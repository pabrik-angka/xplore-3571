#' @title Orkestrator Ingestion Data Fasih ke DuckDB
#'
#' @description
#' Kelas R6 yang menjembatani hasil parsing `FasihAnswer` (named list of data.table)
#' ke penyimpanan permanen DuckDB dengan skema yang otomatis beradaptasi
#' (schema evolution) menggunakan `db_append_evolving()` dari `DuckDBBase`.
#'
#' @importFrom R6 R6Class
#' @importFrom data.table data.table
#'
#' @include duckdb-base_class.R
#' @include fasih-answer_class.R
#' @include config_class.R
#' @include logger_helper.R
#'
#' @export
FasihStore <- R6::R6Class(
  "FasihStore",

  inherit = DuckDBBase,

  private = list(
    config    = NULL,
    is_docker = FALSE
  ),

  public = list(

    #' @description
    #' Inisialisasi FasihStore. Path DuckDB otomatis mengikuti pola direktori
    #' data R4BPS (docker vs lokal), kecuali dioverride manual.
    #' @param duckdb_file Karakter. Path file DuckDB. Default: auto-resolve dari config.
    initialize = function(duckdb_file = NULL, password = NULL) {
      private$config    <- ConfigManager$new()
      private$is_docker <- (private$config$get("env") == "docker")

      if (is.null(duckdb_file)) {
        data_dir <- if (private$is_docker) {
          path.expand("~/data/duckdb")
        } else {
          file.path(getOption("R4BPS.temp_dir"), "duckdb_storage")
        }
        dir.create(data_dir, recursive = TRUE, showWarnings = FALSE)
        duckdb_file <- file.path(data_dir, "fasih_database.duckdb")
      }

      # Panggil constructor DuckDBBase (otomatis memanggil initialize_tables())
      super$initialize(duckdb_file = duckdb_file, password = password)
    },

    #' @description
    #' **Override.** FasihStore tidak memiliki skema tabel tetap — tabel dibuat
    #' dinamis saat ingestion pertama via `db_append_evolving()`.
    initialize_tables = function() {
      invisible(NULL)
    },

    #' @description Ingest langsung named list of data.table hasil transform_files ke DuckDB
    # Di dalam FasihStore.R
    ingest_tables = function(tables_list) {
    	if (is.null(tables_list) || length(tables_list) == 0) {
    		logger::log_warn("[FasihStore] List tabel kosong, tidak ada data yang di-ingest.")
    		return(invisible(FALSE))
    	}

    	logger::log_info(sprintf("[FasihStore] Memulai ingest %d tabel ke DuckDB...", length(tables_list)))

    	for (tbl_name in names(tables_list)) {
    		dt <- tables_list[[tbl_name]]
    		if (!is.null(dt) && nrow(dt) > 0) {
    			# PERBAIKAN: Panggil via self$ jika db_append_evolving bertipe PUBLIC di DuckDBBase
    			self$db_append_evolving(table_name = tbl_name, dt = dt)
    		}
    	}

    	logger::log_success("[FasihStore] Ingest batch selesai.")
    	return(invisible(TRUE))
    },

    #' @description
    #' Parsing batch file `answer.json` via `FasihAnswer` lalu ingest hasilnya
    #' ke DuckDB secara sekuensial per-tabel (schema-evolving).
    #' Paralelisasi parsing tetap ditangani di dalam `FasihAnswer$transform_files()`;
    #' method ini HANYA menjalankan tahap ingest DB secara sekuensial di main process,
    #' karena `db_append_evolving()` menggunakan DDL (ALTER TABLE) yang tidak thread-safe.
    #'
    #' @param input_data Karakter vector. Daftar path file answer.json atau
    #' bisa berupa list of data.table hasil transform_files ke DuckDB .
    #' @param template_path Karakter. Path ke template.json untuk `FasihAnswer`.
    #' @param region_levels data.table. Metadata level wilayah (opsional).
    #' @param custom_data data.table. Metadata custom_data (opsional).
    #' @param parallel Logical. Aktifkan paralel saat parsing file. Default: FALSE.
    #' @param workers Integer. Jumlah worker paralel saat parsing. Default: 4L.
    #' @param buffer_dir Karakter. Lokasi buffer checkpoint parsing (opsional).
    #' @param verbose Logical. Aktifkan logging detail per file. Default: FALSE.
    #' @param overwrite Logical. Hapus tabel lama jika ada sebelum ingest baru. Default: FALSE.
    #' @return List named data.table hasil parsing (sebelum di-ingest), untuk keperluan debug/verifikasi.
    ingest_batch = function(input_data, template_path = NULL, ...) {
    	if (is.list(input_data) && !is.data.frame(input_data)) {
    		logger::log_info("[FasihStore] Input berupa list data.table, langsung meng-ingest ke DuckDB...")
    		return(self$ingest_tables(input_data))
    	}

    	if (is.character(input_data)) {
    		if (is.null(template_path)) {
    			stop("[FasihStore] template_path wajib diisi jika input_data berupa file paths.")
    		}

    		fa <- FasihAnswer$new(template_path = template_path)
    		trans <- fa$transform_files(file_paths = input_data, ...)
    		return(self$ingest_tables(trans))
    	}

    	stop("[FasihStore] Format input_data tidak dikenali.")
    }
  )
)
