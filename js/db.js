// js/db.js
/**
 * Xplore 3571 - Native IndexedDB Storage Helper (0KB Dependency)
 * Bertanggung jawab menyimpan dan me-restore dataset tabulasi & layer spasial PWA untuk offline caching.
 */

const DB_NAME = 'Xplore3571DB';
const DB_VERSION = 1;
const STORES = {
  TABULATION: 'tabulation_store',
  BUILDING: 'building_store'
};

export const StorageDB = {
  db: null,

  /**
   * Inisialisasi IndexedDB Database
   */
  init() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        return resolve(this.db);
      }

      if (!('indexedDB' in window)) {
        console.warn('⚠️ IndexedDB tidak didukung oleh browser ini.');
        return resolve(null);
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains(STORES.TABULATION)) {
          db.createObjectStore(STORES.TABULATION, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.BUILDING)) {
          db.createObjectStore(STORES.BUILDING, { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        console.log('✔ PWA IndexedDB initialized successfully.');
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('❌ Gagal membuka IndexedDB:', e.target.error);
        resolve(null); // Fallback tanpa memblokir aplikasi
      };
    });
  },

  /**
   * Menyimpan item ke object store
   * @param {string} storeName - STORES.TABULATION | STORES.BUILDING
   * @param {Object} dataObj - Objek data yang wajib memiliki properti `id`
   */
  async saveDataset(storeName, dataObj) {
    try {
      const db = await this.init();
      if (!db || !dataObj || !dataObj.id) return;

      return new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(dataObj);

        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn(`IndexedDB save error (${storeName}):`, e);
    }
  },

  /**
   * Mengambil seluruh item dari object store
   * @param {string} storeName 
   * @returns {Promise<Array>}
   */
  async getAllDatasets(storeName) {
    try {
      const db = await this.init();
      if (!db) return [];

      return new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    } catch (e) {
      console.warn(`IndexedDB getAll error (${storeName}):`, e);
      return [];
    }
  },

  /**
   * Menghapus item berdasarkan id
   */
  async deleteDataset(storeName, id) {
    try {
      const db = await this.init();
      if (!db || !id) return;

      return new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn(`IndexedDB delete error (${storeName}):`, e);
    }
  },

  STORES
};
