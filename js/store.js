// js/store.js
import { getPolygonHandler } from './polygonRegistry.js';

export const Store = {
  activePolygonData: null,
  activeHandler: null,
  filterMetadata: [],
  
  // ==========================================
  // STATE BARU: Tempat menyimpan cache index filter
  // ==========================================
  filterIndexTree: {}, 

  /**
   * Membaca dan memvalidasi berkas spasial lokal
   */
  processPolygonFile(file, schemaId) {
    return new Promise((resolve, reject) => {
      const handler = getPolygonHandler(schemaId);
      if (!handler) {
        return reject('Skema poligon tidak dikenali oleh sistem.');
      }

      const reader = new FileReader();
      reader.onerror = () => reject('Gagal membaca file dari disk.');
      reader.onload = (e) => {
        try {
          const geojsonData = JSON.parse(e.target.result);
          if (!geojsonData.features || geojsonData.features.length === 0) {
            return reject('Berkas GeoJSON tidak mengandung komponen fitur objek spasial.');
          }

          const sampleProps = geojsonData.features[0].properties || {};
          if (!handler.validate(sampleProps)) {
            return reject(`Struktur field tidak valid! Pastikan mengandung field mandatori: ${handler.mandatoryFields.join(', ')}`);
          }

          // Reset index pohon setiap kali file baru dimuat
          this.filterIndexTree = {};

          const processedFeatures = geojsonData.features.map((feature, index) => {
            const props = feature.properties || {};
            const extracted = handler.extract(props);
            
            // Tambahkan indeks asli ke properti fitur
            feature.properties = {
              _index: index,
              filterData: extracted.filterData,
              tooltipHtml: extracted.tooltipHtml
            };

            // ==========================================
            // LOGIK DINAMIS: Membangun Index berdasarkan data ekstraksi
            // ==========================================
            const fData = extracted.filterData || {};
            // Mengambil keys secara dinamis (misal: ['kecamatan', 'desa', 'sls'])
            const levels = Object.keys(fData).map(k => (fData[k] || '').toString().trim());

            // Bangun tree secara rekursif/bertingkat sesuai kedalaman filterData yang ada
            let currentLevel = this.filterIndexTree;
            
            levels.forEach((value, depth) => {
              if (!value) return; // Abaikan jika nilainya kosong

              if (!currentLevel[value]) {
                currentLevel[value] = {
                  _indices: [], // Menyimpan kecocokan indeks fitur untuk level ini
                  children: {}
                };
              }
              
              // Simpan indeks polygon ke level ini
              currentLevel[value]._indices.push(index);
              
              // Turun ke level berikutnya (jika ada)
              currentLevel = currentLevel[value].children;
            });

            return feature;
          });

          this.activePolygonData = { ...geojsonData, features: processedFeatures };
          this.activeHandler = handler;
          this.filterMetadata = processedFeatures.map(f => f.properties.filterData);

          resolve({
            handler: this.activeHandler,
            filterMetadata: this.filterMetadata,
            // Kembalikan data index tree ke UI jika dibutuhkan
            filterIndexTree: this.filterIndexTree 
          });
        } catch (err) {
          reject('Format JSON rusak atau tidak valid.');
        }
      };
      reader.readAsText(file);
    });
  },

  /**
   * ==========================================
   * FUNGSI BARU: Mengambil daftar opsi dropdown secara dinamis
   * ==========================================
   * pathArray contoh: ['KECAMATAN A'] atau ['KECAMATAN A', 'DESA B']
   */
  getFilterOptions(pathArray = []) {
    let currentLevel = this.filterIndexTree;
    
    // Telusuri pohon berdasarkan apa yang dipilih user
    for (const val of pathArray) {
      if (currentLevel && currentLevel[val]) {
        currentLevel = currentLevel[val].children;
      } else {
        return []; // Jika path patah, kembalikan array kosong
      }
    }
    
    // Kembalikan semua opsi string unik yang ada di level tersebut
    return Object.keys(currentLevel);
  },

  /**
   * ==========================================
   * FUNGSI BARU: Mengambil indeks target fitur untuk di-render & zoom
   * ==========================================
   */
  getTargetIndices(pathArray = []) {
    // Bersihkan path dari nilai kosong/default dropdown
    const activePath = pathArray.filter(val => val && val !== '');
    
    if (activePath.length === 0) {
      // Jika filter kosong, kembalikan semua index
      return this.activePolygonData?.features.map(f => f.properties._index) || [];
    }

    let currentLevel = this.filterIndexTree;
    let targetIndices = [];

    // Telusuri sampai node terakhir yang dipilih
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