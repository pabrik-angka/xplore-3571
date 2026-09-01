#' @title Base Class untuk Manajemen Koneksi DuckDB
#'
#' @description
#' Kelas R6 yang menyediakan infrastruktur koneksi DuckDB terpusat,
#' optimal untuk operasi OLAP (analytical query), pemrosesan bulk file JSON,
#' dan penanganan data scraping berskala besar (~150MB+).
#' Memiliki dukungan enkripsi (encryption_key/password) secara opt-in.
#'
#' Kelas ini dapat digunakan secara langsung (instanced) atau diwarisi (inherited) oleh subclass.
#'
#' @importFrom R6 R6Class
#' @importFrom DBI dbConnect dbDisconnect dbExecute dbGetQuery dbWriteTable dbExistsTable
#' @importFrom duckdb duckdb duckdb_register duckdb_unregister
#' @importFrom data.table as.data.table is.data.table rbindlist
#'
#' @include logger_helper.R
#'
#' @export
DuckDBBase <- R6::R6Class(
  "DuckDBBase",

  private = list(
    duckdb_file = NULL,
    encryption_key = NULL,

    # CORE: Membuka koneksi DuckDB dengan pragma optimal & enkripsi
    get_connection = function() {
    	# 1. Tanpa Password (Default/Memory)
    	if (is.null(private$encryption_key) || nchar(private$encryption_key) == 0) {
    		drv <- duckdb::duckdb(dbdir = private$duckdb_file, read_only = FALSE)
    		con <- DBI::dbConnect(drv)

    		DBI::dbExecute(con, "PRAGMA memory_limit='4GB'")
    		DBI::dbExecute(con, "PRAGMA threads=4")
    		return(con)
    	}

    	# 2. Dengan Password / Enkripsi
    	drv <- duckdb::duckdb(dbdir = ":memory:", read_only = FALSE)
    	con <- DBI::dbConnect(drv)

    	# A. Aktifkan modul crypto penuh via httpfs extension atau ijinkan flag unsafe crypto local
    	tryCatch({
    		DBI::dbExecute(con, "INSTALL httpfs;")
    		DBI::dbExecute(con, "LOAD httpfs;")
    	}, error = function(e) {
    		# Fallback jika environment offline/tidak bisa download extension
    		DBI::dbExecute(con, "SET force_mbedtls_unsafe = 'true';")
    	})

    	# B. Normalisasi path file
    	target_file <- normalizePath(private$duckdb_file, winslash = "/", mustWork = FALSE)

    	# C. Attach file terenkripsi
    	attach_sql <- sprintf(
    		"ATTACH '%s' AS secure_db (ENCRYPTION_KEY '%s');",
    		target_file,
    		private$encryption_key
    	)
    	DBI::dbExecute(con, attach_sql)

    	# D. Alihkan context session utama ke database terenkripsi
    	DBI::dbExecute(con, "USE secure_db;")

    	# E. Tuning performa
    	DBI::dbExecute(con, "PRAGMA memory_limit='4GB'")
    	DBI::dbExecute(con, "PRAGMA threads=4")

    	return(con)
    },

    # Normalisasi input ke data.table (DRY)
    .to_dt = function(x) {
      if (data.table::is.data.table(x)) return(x)
      if (is.data.frame(x))             return(data.table::as.data.table(x))
      if (is.matrix(x))                 return(data.table::as.data.table(as.data.frame(x)))
      if (is.list(x))                   return(data.table::rbindlist(x, fill = TRUE))
      stop(sprintf("[DuckDBBase] Tipe input tidak didukung: %s", class(x)[1]))
    },

    # Mapping tipe kolom R ke tipe kolom DuckDB (dipakai saat ALTER TABLE ADD COLUMN)
    .map_r_type_to_duckdb = function(col_vec) {
      if (inherits(col_vec, "POSIXct") || inherits(col_vec, "Date")) return("TIMESTAMP")
      if (is.integer(col_vec))  return("INTEGER")
      if (is.numeric(col_vec))  return("DOUBLE")
      if (is.logical(col_vec))  return("BOOLEAN")
      return("VARCHAR")
    },

    # Deteksi & koersi list-column ke string JSON agar aman diregister ke DuckDB
    .sanitize_list_columns = function(dt) {
      list_cols <- names(dt)[sapply(dt, function(x) is.list(x) && !is.data.frame(x))]
      if (length(list_cols) > 0) {
        logger::log_warn(logger::skip_formatter(sprintf(
          "[DuckDB] Kolom list terdeteksi, dikonversi ke JSON string: %s",
          paste(list_cols, collapse = ", ")
        )))
        for (col in list_cols) {
          data.table::set(dt, j = col, value = sapply(dt[[col]], function(x) {
            if (is.null(x) || length(x) == 0) return(NA_character_)
            jsonlite::toJSON(x, auto_unbox = TRUE)
          }))
        }
      }
      return(dt)
    },

    # Executor callback connection
    with_db = function(fn) {
      con <- private$get_connection()
      # DuckDB membutuhkan driver dan koneksi untuk ditutup secara teratur
      on.exit({
        drv <- DBI::dbGetInfo(con)$db
        DBI::dbDisconnect(con, shutdown = TRUE)
      }, add = TRUE)
      fn(con)
    }
  ),

  public = list(

    # =========================================================================
    # CONSTRUCTOR
    # =========================================================================

    #' @description
    #' Inisialisasi DuckDBBase.
    #' @param duckdb_file Karakter. Path ke file database DuckDB atau ":memory:".
    #' @param password Karakter (Opsional). Key/Password enkripsi untuk file DuckDB. Default: NULL.
    initialize = function(duckdb_file = ":memory:", password = NULL) {
      if (duckdb_file != ":memory:") {
        private$duckdb_file <- normalizePath(duckdb_file, winslash = "/", mustWork = FALSE)
        dir.create(dirname(private$duckdb_file), recursive = TRUE, showWarnings = FALSE)
      } else {
        private$duckdb_file <- ":memory:"
      }

      # Simpan password / encryption_key jika di-pass oleh caller
      if (!is.null(password) && is.character(password) && nchar(password) > 0) {
        private$encryption_key <- password
      }

      # Panggil hook inisialisasi tabel (subclass dapat meng-override ini)
      self$initialize_tables()
    },

    #' @description
    #' **Hook.** Subclass dapat meng-override method ini untuk mendefinisikan skema tabel awal.
    #' Tidak melempar error agar base class dapat di-instansiasi langsung.
    initialize_tables = function() {
      # No-op default
      invisible(NULL)
    },

    # =========================================================================
    # PUBLIC API: Operasi DB Dasar
    # =========================================================================

    #' @description
    #' Menjalankan query SELECT dan mengembalikan `data.table`.
    #' @param sql Karakter. SQL SELECT statement.
    #' @return `data.table` hasil query.
    db_query = function(sql) {
      private$with_db(function(con) {
        res <- DBI::dbGetQuery(con, sql)
        data.table::as.data.table(res)
      })
    },

    #' @description
    #' Menjalankan perintah DML/DDL (INSERT, CREATE, dll).
    #' @param sql Karakter. SQL statement.
    #' @return NULL (invisible).
    db_execute = function(sql) {
      private$with_db(function(con) {
        DBI::dbExecute(con, sql)
      })
      invisible(NULL)
    },

    #' @description
    #' Menulis data (append) ke tabel target.
    #' @param table Karakter. Nama tabel target.
    #' @param dt Data input (tabular).
    #' @return NULL (invisible).
    db_batch_append = function(table, dt) {
      if (is.null(dt) || nrow(dt) == 0) return(invisible(NULL))
      dt <- private$.to_dt(dt)

      private$with_db(function(con) {
        DBI::dbWriteTable(con, table, as.data.frame(dt),
                          append = TRUE, row.names = FALSE)
      })
      invisible(NULL)
    },

    #' @description
    #' Menghapus tabel target (jika ada), membuat ulang, dan mengisinya dengan
    #' data baru dari data.table/data.frame secara atomik.
    #' Berguna untuk load staging table yang bersifat dinamis.
    #' @param table_name Karakter. Nama tabel target.
    #' @param dt Data input (data.table atau data.frame).
    #' @return NULL (invisible).
    db_stage_replace = function(table_name, dt) {
      if (is.null(dt) || nrow(dt) == 0) return(invisible(NULL))
      dt <- private$.to_dt(dt)

      private$with_db(function(con) {
        # Drop table jika sudah ada
        DBI::dbExecute(con, sprintf("DROP TABLE IF EXISTS %s", table_name))
        # Tulis ulang tabel (otomatis membuat tabel baru dengan skema data.frame)
        DBI::dbWriteTable(con, table_name, as.data.frame(dt), row.names = FALSE)
      })
      logger::log_success(sprintf("[DuckDB] Sukses mereplace seluruh isi tabel '%s' dengan data baru (%d baris)", table_name, nrow(dt)))
      invisible(NULL)
    },

    #' @description
    #' Insert data ke tabel target dengan skema yang otomatis beradaptasi (schema evolution).
    #' Jika tabel belum ada, tabel dibuat otomatis dari struktur data.
    #' Jika tabel sudah ada, kolom baru yang belum terdaftar akan ditambahkan otomatis
    #' via ALTER TABLE sebelum data di-insert (INSERT ... BY NAME).
    #' PERINGATAN: Method ini TIDAK thread-safe untuk dipanggil paralel dari banyak worker
    #' sekaligus (ALTER TABLE bersifat DDL). Wajib dipanggil sekuensial dari main process.
    #' @param table_name Karakter. Nama tabel target.
    #' @param dt Data input (data.table/data.frame).
    #' @return NULL (invisible).
    db_append_evolving = function(table_name, dt) {
    	if (is.null(dt) || nrow(dt) == 0) return(invisible(NULL))
    	dt <- private$.to_dt(dt)
    	dt <- private$.sanitize_list_columns(dt)

    	tryCatch({
    		private$with_db(function(con) {
    			duckdb::duckdb_register(con, "temp_view_evolve", as.data.frame(dt))
    			on.exit(
    				tryCatch(duckdb::duckdb_unregister(con, "temp_view_evolve"), error = function(e) NULL),
    				add = TRUE
    			)

    			if (!DBI::dbExistsTable(con, table_name)) {
    				# PERBAIKAN: Jika tabel belum ada, buat skema eksplisit dari tipe data R
    				# agar DuckDB tidak melakukan auto-cast ke INTEGER/BIGINT
    				col_defs <- sapply(names(dt), function(col) {
    					sprintf('"%s" %s', col, private$.map_r_type_to_duckdb(dt[[col]]))
    				})
    				create_sql <- sprintf('CREATE TABLE "%s" (%s)', table_name, paste(col_defs, collapse = ", "))
    				DBI::dbExecute(con, create_sql)

    				# Insert data
    				DBI::dbExecute(con, sprintf('INSERT INTO "%s" BY NAME SELECT * FROM temp_view_evolve', table_name))
    				logger::log_success(sprintf("[DuckDB] Tabel '%s' baru dibuat dengan %d baris.", table_name, nrow(dt)))
    			} else {
    				existing_cols <- DBI::dbGetQuery(con, sprintf('PRAGMA table_info("%s")', table_name))$name
    				new_cols <- setdiff(names(dt), existing_cols)

    				if (length(new_cols) > 0) {
    					for (col in new_cols) {
    						col_type <- private$.map_r_type_to_duckdb(dt[[col]])
    						DBI::dbExecute(con, sprintf('ALTER TABLE "%s" ADD COLUMN "%s" %s', table_name, col, col_type))
    					}
    				}

    				DBI::dbExecute(con, sprintf('INSERT INTO "%s" BY NAME SELECT * FROM temp_view_evolve', table_name))
    			}
    		})
    	}, error = function(e) { ... })
    },

    #' @description
    #' Mengecek keberadaan tabel di database.
    #' @param table_name Karakter. Nama tabel.
    #' @return Logical.
    db_table_exists = function(table_name) {
      private$with_db(function(con) {
        DBI::dbExistsTable(con, table_name)
      })
    },

    # =========================================================================
    # ADVANCED FEATURE: JSON & Scraping
    # =========================================================================

    #' @description
    #' Melakukan bulk import folder berisi file JSON ke tabel target.
    #' Memanfaatkan fitur native DuckDB read_json_auto() yang sangat cepat.
    #' @param table_name Karakter. Nama tabel target.
    #' @param folder_path Karakter. Path ke folder yang berisi file-file JSON.
    #' @param pattern Karakter. Pola regex filter file. Default: "*.json".
    #' @return NULL (invisible).
    db_import_json_folder = function(table_name, folder_path, pattern = "*.json") {
      path_pattern <- file.path(normalizePath(folder_path, winslash = "/"), pattern)

      # Buat SQL bulk insert menggunakan read_json_auto milik DuckDB
      sql <- sprintf("
        CREATE TABLE IF NOT EXISTS %s AS
        SELECT * FROM read_json_auto('%s')
      ", table_name, path_pattern)

      # Jika tabel sudah ada, lakukan append
      if (self$db_table_exists(table_name)) {
        sql <- sprintf("
          INSERT INTO %s
          SELECT * FROM read_json_auto('%s')
        ", table_name, path_pattern)
      }

      self$db_execute(sql)
      logger::log_success(sprintf("[DuckDB] Sukses bulk import JSON dari %s ke tabel %s", folder_path, table_name))
      invisible(NULL)
    },

    #' @description
    #' Membuat virtual View yang otomatis men-deduplikasi data staging.
    #' Berguna menyaring data scraping terduplikat dan menyajikan data terbaru.
    #' @param table_name Karakter. Nama tabel sumber (staging).
    #' @param unique_key Karakter. Kolom kunci unik pembeda data (misal: 'id').
    #' @param order_col Karakter. Kolom pengurut waktu scraping (misal: 'scraped_at').
    #' @param view_name Karakter. Nama View yang akan dibuat.
    #' @return NULL (invisible).
    create_deduplicated_view = function(table_name, unique_key, order_col, view_name) {
      sql <- sprintf("
        CREATE OR REPLACE VIEW %s AS
        SELECT * EXCLUDE (row_num) FROM (
          SELECT *,
                 ROW_NUMBER() OVER (PARTITION BY %s ORDER BY %s DESC) as row_num
          FROM %s
        ) WHERE row_num = 1
      ", view_name, unique_key, order_col, table_name)

      self$db_execute(sql)
      logger::log_success(sprintf("[DuckDB] Deduplicated VIEW '%s' berhasil dibuat untuk tabel '%s'", view_name, table_name))
      invisible(NULL)
    },

    #' @description
    #' Menjalankan checkpoint untuk membersihkan cache dan melakukan kompresi file DuckDB.
    #' @return NULL (invisible).
    db_checkpoint = function() {
      self$db_execute("CHECKPOINT")
      invisible(NULL)
    }
  )
)
