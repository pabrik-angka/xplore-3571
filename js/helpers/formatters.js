// js/helpers/formatters.js
/**
 * Data Formatters Helper - Pure Logic Helper untuk Xplore 3571
 * Menyediakan fungsi-fungsi format data mentah, sanitasi CSV, dan pembentukan string.
 */

export const DataFormatters = {
  /**
   * Mengonversi Array of Objects ke String CSV siap unduh
   */
  arrayToCsv(data = [], columns = []) {
    if (!Array.isArray(data) || data.length === 0) return '';

    const colKeys = columns.length > 0 
      ? columns.map(c => typeof c === 'string' ? c : c.key)
      : Object.keys(data[0]);

    const headers = columns.length > 0 
      ? columns.map(c => typeof c === 'string' ? c : (c.label || c.key))
      : colKeys;

    const escapeCsvValue = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [];
    csvRows.push(headers.map(h => escapeCsvValue(h)).join(','));

    data.forEach(row => {
      const line = colKeys.map(k => escapeCsvValue(row[k]));
      csvRows.push(line.join(','));
    });

    return csvRows.join('\r\n');
  },

  /**
   * Format angka ribuan dengan pemisah desimal lokal
   */
  formatNumber(val, decimals = 0) {
    const num = parseFloat(val);
    if (isNaN(num)) return '-';
    return num.toLocaleString('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
};
