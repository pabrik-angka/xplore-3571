// data-modules/BaseStrategy.js

/**
 * Base Class untuk seluruh Strategy Data Module di Xplore 3571.
 * Menyediakan implementasi default untuk validasi dan helper normalisasi properti.
 */
export class BaseDataModule {
  constructor(config = {}) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type || 'tabulation'; // 'tabulation' | 'building' | 'polygon'
    
    // Kapabilitas fitur modul (default values)
    this.is_spatial_active = config.is_spatial_active ?? false;
    this.is_tabulasi_active = config.is_tabulasi_active ?? true;
    this.is_dashboard_active = config.is_dashboard_active ?? false;
    
    this.mandatoryFields = config.mandatoryFields || [];
  }

  /**
   * Validasi keberadaan seluruh field mandatori secara case-insensitive.
   * @param {Object} properties - Properti record data mentah.
   * @returns {boolean} True jika semua field mandatori terpenuhi.
   */
  validate(properties) {
    if (!properties) return false;
    const keys = Object.keys(properties).map(k => k.toLowerCase());
    return this.mandatoryFields.every(field => keys.includes(field.toLowerCase()));
  }

  /**
   * Helper utility untuk menormalisasi properti menjadi lowercase keys.
   * Sangat berguna untuk menghindari variasi casing header kolom dari file CSV/GeoJSON.
   * @param {Object} properties - Properti record data mentah.
   * @returns {Object} Properti ter-normalisasi dengan key lowercase.
   */
  normalizeProperties(properties) {
    const p = {};
    if (!properties) return p;
    for (const key in properties) {
      p[key.toLowerCase()] = properties[key];
    }
    return p;
  }
}
