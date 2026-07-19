// map-modules/wilkerstat-se2026.js

export const wilkerstatSE2026 = {
  /**
   * Validasi struktur data untuk memastikan berkas ini benar-benar data Wilkerstat BPS
   * @param {Object} geojsonData - Objek GeoJSON penuh
   */
  validate(geojsonData) {
    if (!geojsonData || geojsonData.type !== 'FeatureCollection' || !geojsonData.features.length) {
      return false;
    }
    // Ambil sampel properti dari feature pertama
    const p = geojsonData.features[0].properties || {};
    // Validasi keberadaan salah satu key khusus Wilkerstat SE2026
    return !!(p.nmkec || p.NMKEC || p.nmdesa || p.NMDESA || p.nmsls || p.NMSLS);
  },

  /**
   * Mengekstrak properti wilayah secara standar dari feature Wilkerstat SE2026
   * @param {Object} feature - Single GeoJSON Feature object
   */
  extractProperties(feature) {
    const p = feature.properties || {};

    // Normalisasi casing atribut Wilkerstat (mengakomodasi variasi uppercase/lowercase dari BPS)
    const nmkec = p.nmkec || p.NMKEC || p.Kecamatan || p.KECAMATAN || '';
    const nmdesa = p.nmdesa || p.NMDESA || p.kelurahan || p.KELURAHAN || p.Desa || p.DESA || '';
    const nmsls = p.nmsls || p.NMSLS || p.sls || p.SLS || p.id_sls || p.ID_SLS || '';

    let labelTooltip = `<strong>Kecamatan:</strong> ${nmkec}`;
    if (nmdesa) labelTooltip += `<br><strong>Desa/Kel:</strong> ${nmdesa}`;
    if (nmsls) labelTooltip += `<br><strong>SLS:</strong> ${nmsls}`;

    return {
      kec: nmkec.trim(),
      kel: nmdesa.trim(),
      sls: nmsls.trim(),
      tooltipHtml: labelTooltip
    };
  },

  /**
   * Skema gaya visual polygon Wilkerstat SE2026
   */
  getStyle() {
    return {
      color: '#4f46e5',      // Indigo 600
      weight: 1.5,
      fillColor: '#818cf8',  // Indigo 400
      fillOpacity: 0.15,
      dashArray: '3'
    };
  }
};