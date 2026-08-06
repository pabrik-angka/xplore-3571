// js/helpers/filter-index.js
/**
 * Helper untuk mengelola pohon indeks filter wilayah (pure logic).
 * SRP: Hanya fokus pada pembuatan index tree dan traversal pencarian index.
 */

export const FilterIndex = {
  /**
   * Membangun pohon indeks filter dari properti fitur GeoJSON secara dinamis.
   * @param {Array} features - Array of GeoJSON features
   * @returns {Object} filterIndexTree
   */
  buildFilterIndexTree(features) {
    const tree = {};

    features.forEach((feature, index) => {
      const fData = feature.properties?.filterData || {};
      const levels = Object.keys(fData).map(k => (fData[k] || '').toString().trim());

      let currentLevel = tree;
      
      levels.forEach((value) => {
        if (!value) return;

        if (!currentLevel[value]) {
          currentLevel[value] = {
            _indices: [],
            children: {}
          };
        }
        
        currentLevel[value]._indices.push(index);
        currentLevel = currentLevel[value].children;
      });
    });

    return tree;
  },

  /**
   * Mengambil daftar opsi dropdown secara dinamis dari pohon indeks.
   * @param {Object} tree - Pohon indeks filter
   * @param {Array<string>} pathArray - Jalur filter aktif
   * @returns {Array<string>} daftar opsi
   */
  getFilterOptions(tree, pathArray = []) {
    if (!tree) return [];
    let currentLevel = tree;
    
    for (const val of pathArray) {
      if (currentLevel && currentLevel[val]) {
        currentLevel = currentLevel[val].children;
      } else {
        return [];
      }
    }
    
    return Object.keys(currentLevel);
  },

  /**
   * Mengambil indeks target fitur untuk di-render & zoom.
   * @param {Object} tree - Pohon indeks filter
   * @param {Array} features - Array of GeoJSON features
   * @param {Array<string>} pathArray - Jalur filter aktif
   * @returns {Array<number>} array of indices
   */
  getTargetIndices(tree, features, pathArray = []) {
    if (!tree) return [];
    const activePath = pathArray.filter(val => val && val !== '');
    
    if (activePath.length === 0) {
      return features?.map(f => f.properties?._index) || [];
    }

    let currentLevel = tree;
    let targetIndices = [];

    for (let i = 0; i < activePath.length; i++) {
      const val = activePath[i];
      if (currentLevel && currentLevel[val]) {
        if (i === activePath.length - 1) {
          targetIndices = currentLevel[val]._indices;
        }
        currentLevel = currentLevel[val].children;
      } else {
        break;
      }
    }

    return targetIndices;
  }
};
