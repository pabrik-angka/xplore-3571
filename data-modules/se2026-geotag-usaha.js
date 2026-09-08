// data-modules/se2026-geotag-usaha.js
import { BaseDataModule } from './BaseStrategy.js';

class SE2026GeotagUsaha extends BaseDataModule {
  constructor() {
    super({
      id: 'se2026-geotag-usaha',
      name: 'SE2026 Geotag Usaha',
      type: 'building',
      is_spatial_active: true,
      is_tabulasi_active: true, // Diaktifkan untuk mendukung view tabel & pivot
      is_dashboard_active: false,
      mandatoryFields: ['idsubsls', 'assignment_id', 'nama_principal', 'geotag_latitude', 'geotag_longitude']
    });
  }

  get moduleId() {
    return 'se2026-geotag-usaha';
  }

  get moduleName() {
    return 'SE2026 Geotag Usaha';
  }

  get dataType() {
    return 'Point';
  }

  /**
   * Skema kolom lengkap untuk visualisasi Tabel & Pivot Tabulasi
   * Mendukung 35 kolom CSV sesuai spesifikasi data SE2026
   */
  getTableSchema() {
    return [
      // Identifikasi & Kode
      { key: 'idsubsls', label: 'ID Sub SLS', type: 'string', isStub: true, filterable: true },
      { key: 'assignment_id', label: 'Assignment ID', type: 'string', filterable: true },
      { key: 'index1', label: 'Index', type: 'string' },
      { key: 'jenis_prelist', label: 'Jenis Prelist', type: 'string', isDimension: true, filterable: true },
      { key: 'assignment_status_alias', label: 'Status Assignment', type: 'string', isDimension: true, filterable: true },

      // Identitas Usaha & Pemilik
      { key: 'nama_principal', label: 'Nama Principal', type: 'string', isDimension: true, filterable: true },
      { key: 'nama_usaha', label: 'Nama Usaha', type: 'string', isDimension: true, filterable: true },
      { key: 'nama_komersial', label: 'Nama Komersial', type: 'string', isDimension: true, filterable: true },
      { key: 'keberadaan_usaha_label', label: 'Keberadaan Usaha', type: 'string', isDimension: true, filterable: true },
      { key: 'jenis_usaha_label', label: 'Jenis Usaha', type: 'string', isDimension: true, filterable: true },
      { key: 'nik_pengusaha', label: 'NIK Pengusaha', type: 'string' },
      { key: 'nib', label: 'NIB', type: 'string' },

      // Karakteristik & Aktivitas Usaha
      { key: 'keg_utama', label: 'Kegiatan Utama', type: 'string', isDimension: true, filterable: true },
      { key: 'lokasi_usaha_label', label: 'Lokasi Usaha', type: 'string', isDimension: true, filterable: true },
      { key: 'input', label: 'Input', type: 'string' },
      { key: 'proses', label: 'Proses', type: 'string' },
      { key: 'produk', label: 'Produk', type: 'string' },
      { key: 'kbli_akhir', label: 'KBLI Akhir', type: 'string', isDimension: true, filterable: true },
      { key: 'kategori_2025', label: 'Kategori 2025', type: 'string', isDimension: true, filterable: true },

      // Measures / Nilai Indikator Usaha
      { key: 'produk_sendiri_value', label: 'Produk Sendiri', type: 'number', isMeasure: true },
      { key: 'layanan_mamin_value', label: 'Layanan Mamin', type: 'number', isMeasure: true },
      { key: 'keg_penjualan_value', label: 'Keg Penjualan', type: 'number', isMeasure: true },
      { key: 'keg_jasa_value', label: 'Keg Jasa', type: 'number', isMeasure: true },

      // Koordinat Spasial
      { key: 'geotag_latitude', label: 'Latitude', type: 'number' },
      { key: 'geotag_longitude', label: 'Longitude', type: 'number' },

      // Kode Wilayah Administrasi BPS
      { key: 'kdprov', label: 'Kode Prov', type: 'string' },
      { key: 'kdkab', label: 'Kode Kab', type: 'string' },
      { key: 'kdkec', label: 'Kode Kec', type: 'string' },
      { key: 'kddesa', label: 'Kode Desa', type: 'string' },
      { key: 'kdsls', label: 'Kode SLS', type: 'string' },
      { key: 'kdsubsls', label: 'Kode Sub SLS', type: 'string' },

      // Nama Wilayah Administrasi BPS
      { key: 'nmprov', label: 'Provinsi', type: 'string', isDimension: true },
      { key: 'nmkab', label: 'Kabupaten/Kota', type: 'string', isDimension: true },
      { key: 'nmkec', label: 'Kecamatan', type: 'string', isDimension: true, filterable: true },
      { key: 'nmdesa', label: 'Desa/Kelurahan', type: 'string', isDimension: true, filterable: true },
      { key: 'nmsls', label: 'SLS', type: 'string', isDimension: true, filterable: true }
    ];
  }

  /**
   * Preset Pivot Table otomatis untuk modul SE2026
   */
  getPivotPresets() {
    return [
      {
        id: 'pivot-kategori-kecamatan',
        title: 'Jumlah Usaha per Kategori & Kecamatan',
        rowFields: ['kategori_2025'],
        colField: 'nmkec',
        valueField: 'assignment_id',
        aggFunc: 'COUNT'
      },
      {
        id: 'pivot-jenis-keberadaan',
        title: 'Rekap Jenis Usaha per Keberadaan Usaha',
        rowFields: ['jenis_usaha_label'],
        colField: 'keberadaan_usaha_label',
        valueField: 'assignment_id',
        aggFunc: 'COUNT'
      },
      {
        id: 'pivot-sebaran-wilayah',
        title: 'Sebaran Usaha per Kecamatan & Desa',
        rowFields: ['nmkec', 'nmdesa'],
        colField: null,
        valueField: 'assignment_id',
        aggFunc: 'COUNT'
      }
    ];
  }

  /**
   * Mengonversi raw row CSV / GeoJSON ke UnifiedRecord (db_schema_design.md §2)
   * Standarisasi format koordinat [lng, lat] & 16-digit ID Sub SLS
   * @param {Object} rawRow
   * @param {'indexeddb'|'duckdb'|'supabase'} source
   */
  toUnifiedRecord(rawRow, source = 'indexeddb') {
    const raw = rawRow.properties ? { ...rawRow.properties, ...rawRow } : rawRow;
    const p = this.normalizeProperties(raw);

    const getProp = (...keys) => {
      for (const k of keys) {
        const val = p[k.toLowerCase()];
        if (val !== undefined && val !== null && val !== '') return val;
      }
      return '';
    };

    const parseNum = (val) => {
      if (val === undefined || val === null || val === '' || val === '-') return 0;
      const cleaned = String(val).trim().replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    const parseCoord = (val) => {
      if (val === undefined || val === null || val === '' || val === '-') return NaN;
      const cleaned = String(val).trim().replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? NaN : num;
    };

    // Wilayah (Kode BPS)
    const kdprov = String(getProp('kdprov') || '35').padStart(2, '0');
    const kdkab = String(getProp('kdkab') || '71').padStart(2, '0');
    const kdkec = String(getProp('kdkec') || '000').padStart(3, '0');
    const kddesa = String(getProp('kddesa') || '000').padStart(3, '0');
    const kdsls = String(getProp('kdsls') || '0000').padStart(4, '0');
    const kdsubsls = String(getProp('kdsubsls') || '00').padStart(2, '0');

    // Bangun 16 digit idsubsls terstandarisasi jika belum ada
    let idsubsls = getProp('idsubsls');
    if (!idsubsls || idsubsls.length < 16) {
      idsubsls = `${kdprov}${kdkab}${kdkec}${kddesa}${kdsls}${kdsubsls}`;
    }

    const nmprov = getProp('nmprov') || 'JAWA TIMUR';
    const nmkab = getProp('nmkab') || 'KOTA KEDIRI';
    const nmkec = getProp('nmkec');
    const nmdesa = getProp('nmdesa');
    const nmsls = getProp('nmsls');

    const region = {
      kdprov,
      nmprov,
      kdkab,
      nmkab,
      kdkec,
      nmkec,
      kddesa,
      nmdesa,
      kdsls,
      nmsls,
      kdsubsls,
      idsubsls
    };

    // Identifikasi & Karakteristik Usaha
    const assignment_id = getProp('assignment_id');
    const nama_principal = getProp('nama_principal');
    const nama_usaha = getProp('nama_usaha');
    const nama_komersial = getProp('nama_komersial');
    const keberadaan_usaha_label = getProp('keberadaan_usaha_label');
    const jenis_usaha_label = getProp('jenis_usaha_label');
    const keg_utama = getProp('keg_utama');
    const lokasi_usaha_label = getProp('lokasi_usaha_label');
    const kbli_akhir = getProp('kbli_akhir');
    const kategori_2025 = getProp('kategori_2025');

    // Parsing koordinat
    const lat = parseCoord(getProp('geotag_latitude', 'latitude', 'lat', 'y'));
    const lng = parseCoord(getProp('geotag_longitude', 'geotag_logitute', 'longitude', 'lng', 'x'));

    // Properti lengkap yang disimpan dan diakses oleh view tabel & pivot
    const properties = {
      ...p,
      idsubsls,
      assignment_id,
      index1: getProp('index1'),
      jenis_prelist: getProp('jenis_prelist'),
      assignment_status_alias: getProp('assignment_status_alias'),
      nama_principal,
      nama_usaha,
      nama_komersial,
      keberadaan_usaha_label,
      jenis_usaha_label,
      nik_pengusaha: getProp('nik_pengusaha'),
      nib: getProp('nib'),
      keg_utama,
      lokasi_usaha_label,
      input: getProp('input'),
      proses: getProp('proses'),
      produk: getProp('produk'),
      kbli_akhir,
      kategori_2025,
      produk_sendiri_value: parseNum(getProp('produk_sendiri_value')),
      layanan_mamin_value: parseNum(getProp('layanan_mamin_value')),
      keg_penjualan_value: parseNum(getProp('keg_penjualan_value')),
      keg_jasa_value: parseNum(getProp('keg_jasa_value')),
      geotag_latitude: lat,
      geotag_longitude: lng,
      kdprov,
      kdkab,
      kdkec,
      kddesa,
      kdsls,
      kdsubsls,
      nmprov,
      nmkab,
      nmkec,
      nmdesa,
      nmsls
    };

    // Pre-computed Search Key (lowercase)
    const searchFields = [
      'nama_principal',
      'nama_usaha',
      'nama_komersial',
      'keg_utama',
      'kbli_akhir',
      'nmkec',
      'nmdesa',
      'nmsls'
    ];
    const searchKey = searchFields
      .map(field => String(properties[field] || '').toLowerCase())
      .filter(Boolean)
      .join(' ');

    const recordId = assignment_id ? `${this.moduleId}-${assignment_id}` : `${this.moduleId}-${idsubsls}-${Math.random().toString(36).substring(2, 7)}`;

    const record = {
      id: recordId,
      type: this.dataType,
      source,
      moduleId: this.moduleId,
      idsubsls,
      region,
      properties,
      searchFields,
      searchKey
    };

    // Geometry jika memiliki koordinat valid [lng, lat] (GeoJSON standard)
    if (!isNaN(lat) && !isNaN(lng)) {
      record.geometry = {
        type: 'Point',
        coordinates: [lng, lat]
      };
      record.tooltipHtml = `
        <div class="p-2 text-xs min-w-[220px]">
          <div class="text-center font-bold text-base mb-1">${nama_principal || nama_usaha || 'Usaha'}</div>
          <div class="border-t border-base-300 my-1"></div>
          <div class="space-y-1 mt-1">
            <div><span class="text-base-content/60 font-medium">Nama Usaha:</span> <span class="font-semibold">${nama_usaha || '-'} / ${nama_komersial || '-'}</span></div>
            <div><span class="text-base-content/60 font-medium">Jenis Usaha:</span> <span class="font-semibold">${jenis_usaha_label || '-'}</span></div>
            <div><span class="text-base-content/60 font-medium">Kegiatan Utama:</span> <span class="font-semibold">${keg_utama || '-'}</span></div>
            <div><span class="text-base-content/60 font-medium">Wilayah:</span> <span class="font-semibold">${nmkec || '-'}, ${nmdesa || '-'}</span></div>
          </div>
          ${assignment_id ? `
            <div class="border-t border-base-300 my-2"></div>
            <div class="text-center">
              <a href="https://fasih-sm.bps.go.id/app/assignment/fd68e454-ba45-4b85-8205-f3bf777ded24/${assignment_id}" target="_blank" class="text-blue-600 hover:underline font-medium">
                Buka di Fasih-SM
              </a>
            </div>
          ` : ''}
        </div>
      `;
      record.clusterGroup = this.moduleId;
    }

    return record;
  }

  // ─────────────────────────────────────────────────────────────
  // BACKWARD COMPATIBILITY DENGAN SPATIAL LAYER LEAFLET SAAT INI
  // ─────────────────────────────────────────────────────────────

  toLayerConfig(rawItem, fileType = 'csv') {
    const p = fileType === 'geojson' ? (rawItem.properties || {}) : rawItem;
    const lowerMap = new Map();
    for (const k in p) {
      lowerMap.set(k.toLowerCase(), p[k]);
    }

    const getProp = (keys) => {
      for (const key of keys) {
        const val = lowerMap.get(key.toLowerCase());
        if (val !== undefined && val !== null && val !== '') return val;
      }
      return '-';
    };

    const parseCoord = (val) => {
      if (val === undefined || val === null || val === '' || val === '-') return NaN;
      const cleaned = String(val).trim().replace(',', '.');
      return parseFloat(cleaned);
    };

    const lat = parseCoord(getProp(['geotag_latitude', 'latitude', 'lat', 'y']));
    const lng = parseCoord(getProp(['geotag_longitude', 'geotag_logitute', 'longitude', 'lng', 'x']));

    const namaUsaha = getProp(['nama_principal', 'nama_usaha_bang']);
    const nama_usaha = getProp(['nama_usaha']);
    const nama_komersial = getProp(['nama_komersial']);
    const jenis_usaha_label = getProp(['jenis_usaha_label']);
    const keg_utama = getProp(['keg_utama']);
    const assignment_id = getProp(['assignment_id']);

    const popupHtml = `
      <div class="p-2 text-xs min-w-[220px]">
        <div class="text-center font-bold text-base mb-1">
          ${namaUsaha}
        </div>
        <div class="border-t border-base-300 my-1"></div>
        <div class="space-y-1 mt-1">
          <div><span class="text-base-content/60 font-medium">Nama Usaha/Komersial</span> <span class="font-semibold">${nama_usaha}/${nama_komersial}</span></div>
          <div><span class="text-base-content/60 font-medium">Jenis Usaha:</span> <span class="font-semibold">${jenis_usaha_label}</span></div>
          <div><span class="text-base-content/60 font-medium">Kegiatan Utama:</span> <span class="font-semibold">${keg_utama}</span></div>
        </div>
        <div class="border-t border-base-300 my-2"></div>
        <div class="space-y-1 mt-1">
          <div><span class="text-base-content/60 font-medium">Sumber:</span> <span class="font-semibold">SE2026 Geotag Usaha</span></div>
        </div>
        <div class="border-t border-base-300 my-2"></div>        
        <div class="text-center">
          <a href="https://fasih-sm.bps.go.id/app/assignment/fd68e454-ba45-4b85-8205-f3bf777ded24/${assignment_id}" target="_blank" class="text-blue-600 hover:underline font-medium">
            Buka di Fasih-SM
          </a>
        </div>
      </div>
    `;

    return {
      geometry: { lat, lng },
      popupHtml,
      searchKeyword: `${namaUsaha}`.toLowerCase(),
      searchTitle: namaUsaha,
      subcategory: 'SE2026 Geotag Usaha',
      originalData: p
    };
  }

  getMarkerOptions(rawItem, fileType = 'csv') {
    return {
      radius: 6,
      fillColor: '#ff9900ff',
      color: '#ffffff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.95,
      shape: 'round'
    };
  }
}

export const se2026GetagUsaha = new SE2026GeotagUsaha();
