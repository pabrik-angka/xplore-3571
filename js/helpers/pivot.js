// js/helpers/pivot.js
/**
 * Custom Native ES6 Pivot Engine untuk Xplore 3571
 * Bertanggung jawab mengelompokkan dan mengagregasi data multi-dimensi tanpa library eksternal (Pure Logic Helper).
 */

export const PivotEngine = {
  /**
   * Generate Pivot Matrix
   * @param {Array<Object>} rawData - Array of row objects
   * @param {Object} config - { rowFields: string[], colField: string, valueField: string, aggFunc: 'COUNT'|'SUM'|'AVG'|'MIN'|'MAX' }
   * @returns {Object} { columns: Array<{key, label, type, isStub}>, rows: Array<Object> }
   */
  generatePivot(rawData, { rowFields = [], colField = '', valueField = '', aggFunc = 'SUM' }) {
    if (!Array.isArray(rawData) || rawData.length === 0 || !Array.isArray(rowFields) || rowFields.length === 0) {
      return { columns: [], rows: [] };
    }

    // 1. Dapatkan daftar nilai unik untuk header kolom pivot (jika colField dipilih)
    const colValues = (colField && colField.trim() !== '')
      ? Array.from(new Set(rawData.map(item => String(item[colField] ?? 'Lainnya')))).sort()
      : [];

    // 2. Kelompokkan data berdasarkan kombinasi Nilai Row Fields
    const grouped = new Map();

    rawData.forEach(item => {
      const rowKey = rowFields.map(f => String(item[f] ?? '-')).join('||');
      if (!grouped.has(rowKey)) {
        const rowObj = {};
        rowFields.forEach(f => { rowObj[f] = item[f] ?? '-'; });
        grouped.set(rowKey, { rowObj, buckets: {} });
      }

      const group = grouped.get(rowKey);
      const colKey = colValues.length > 0 ? String(item[colField] ?? 'Lainnya') : '_default_';
      if (!group.buckets[colKey]) {
        group.buckets[colKey] = [];
      }

      const rawVal = item[valueField];
      const val = parseFloat(rawVal);
      group.buckets[colKey].push(isNaN(val) ? 1 : val);
    });

    // 3. Fungsi Komputasi Agregasi per Bucket
    const computeAgg = (arr) => {
      if (!arr || arr.length === 0) return 0;
      if (aggFunc === 'COUNT') return arr.length;
      if (aggFunc === 'SUM') return arr.reduce((a, b) => a + b, 0);
      if (aggFunc === 'AVG') return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
      if (aggFunc === 'MIN') return Math.min(...arr);
      if (aggFunc === 'MAX') return Math.max(...arr);
      return 0;
    };

    // 4. Susun Baris Hasil Pivot
    const pivotRows = [];
    grouped.forEach(({ rowObj, buckets }) => {
      const rowData = { ...rowObj };
      let totalRow = 0;

      if (colValues.length > 0) {
        colValues.forEach(cVal => {
          const val = computeAgg(buckets[cVal]);
          rowData[cVal] = val;
          totalRow += val;
        });
        rowData['TOTAL'] = +(totalRow).toFixed(2);
      } else {
        const val = computeAgg(buckets['_default_']);
        rowData[valueField || 'Total'] = val;
      }

      pivotRows.push(rowData);
    });

    // 5. Susun Metadata Kolom Hasil Pivot
    const resultColumns = [
      ...rowFields.map((f, idx) => ({ key: f, label: f.toUpperCase(), type: 'string', isStub: idx === 0 })),
      ...(colValues.length > 0 
        ? colValues.map(c => ({ key: c, label: c, type: 'number' })) 
        : [{ key: valueField || 'Total', label: (valueField || 'Total').toUpperCase(), type: 'number' }]),
      ...(colValues.length > 0 
        ? [{ key: 'TOTAL', label: 'TOTAL', type: 'number', isBold: true }] 
        : [])
    ];

    return {
      columns: resultColumns,
      rows: pivotRows
    };
  }
};
