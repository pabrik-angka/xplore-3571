// data-modules/template-tabulasi.js
/**
 * Template Data Module untuk Xplore 3571 - Explorasi Tabulasi
 * Menyediakan struktur standar untuk modul tabulasi yang reaktif.
 */

export const templateTabulasiHandler = {
  id: 'template-tabulasi',
  name: 'Nama Modul Tabulasi',
  type: 'tabulation', // 'tabulation' | 'building' | 'polygon'

  // ─── KAPABILITAS FITUR MODUL ──────────────────────────────────
  is_spatial_active: true,    // true jika data memiliki koordinat lat/lng
  is_tabulasi_active: true,   // true agar otomatis menambah Tab di View Tabulasi
  is_dashboard_active: false, // true jika memiliki preset chart

  // Field wajib yang harus ada dalam data mentah
  mandatoryFields: ['id', 'kecamatan', 'desa', 'jumlah_usaha'],

  /**
   * Skema Kolom Tabel untuk DaisyUI Table & Pivot Engine
   */
  tableSchema: [
    { key: 'id',           label: 'ID Record',      type: 'string', isStub: true },
    { key: 'kecamatan',    label: 'Kecamatan',      type: 'string', filterable: true },
    { key: 'desa',         label: 'Desa / Kel',     type: 'string', filterable: true },
    { key: 'sektor',       label: 'Sektor Usaha',   type: 'string', filterable: true },
    { key: 'jumlah_usaha', label: 'Jumlah Usaha',   type: 'number', aggregatable: true },
    { key: 'latitude',     label: 'Latitude',       type: 'number' },
    { key: 'longitude',    label: 'Longitude',      type: 'number' }
  ],

  /**
   * Validasi format properti data mentah
   */
  validate(properties) {
    if (!properties || typeof properties !== 'object') return false;
    const keys = Object.keys(properties).map(k => k.toLowerCase());
    return this.mandatoryFields.every(field => keys.includes(field));
  },

  /**
   * Transformasi data mentah CSV/GeoJSON menjadi Array of Objects seragam untuk Tabulasi
   */
  toTableRows(rawData, fileType = 'csv') {
    if (!Array.isArray(rawData)) return [];
    return rawData.map((item, index) => {
      const p = fileType === 'geojson' ? (item.properties || {}) : item;
      
      const getProp = (keys) => {
        for (const key of keys) {
          for (const k in p) {
            if (k.toLowerCase() === key.toLowerCase()) return p[k];
          }
        }
        return '-';
      };

      return {
        id:           getProp(['id', 'ids', 'kode']) || `ROW-${index + 1}`,
        kecamatan:    getProp(['kecamatan', 'nmkec', 'kec']),
        desa:         getProp(['desa', 'nmdesa', 'kelurahan']),
        sektor:       getProp(['sektor', 'sektor_usaha', 'kategori']),
        jumlah_usaha: parseInt(getProp(['jumlah_usaha', 'jumlah', 'jml']), 10) || 0,
        latitude:     parseFloat(getProp(['latitude', 'lat', 'y']) || NaN),
        longitude:    parseFloat(getProp(['longitude', 'lng', 'lon', 'x']) || NaN)
      };
    });
  },

  /**
   * Transformasi ke objek Spasial Leaflet (hanya jika is_spatial_active: true)
   */
  toLayerConfig(rawItem, fileType = 'csv') {
    if (!this.is_spatial_active) return null;
    const p = fileType === 'geojson' ? (rawItem.properties || {}) : rawItem;

    const lat = parseFloat(p.latitude || p.lat || p.y || NaN);
    const lng = parseFloat(p.longitude || p.lng || p.lon || p.x || NaN);
    if (isNaN(lat) || isNaN(lng)) return null;

    const kec = p.kecamatan || p.nmkec || '-';
    const desa = p.desa || p.nmdesa || '-';
    const sektor = p.sektor || p.sektor_usaha || '-';
    const jml = p.jumlah_usaha || p.jumlah || 0;

    return {
      geometry: { lat, lng },
      popupHtml: `
        <div class="p-2 text-xs">
          <strong>${kec}</strong> - ${desa}<br>
          Sektor: ${sektor}<br>
          Jumlah Usaha: ${jml}
        </div>
      `,
      searchKeyword: `${kec} ${desa} ${sektor}`.toLowerCase(),
      searchTitle: `${kec} - ${desa}`
    };
  }
};
