// js/core/services/storage.service.js
/**
 * Xplore 3571 - LocalStorage Safe Wrapper
 * Repository layer untuk UI settings, theme, dan preferensi pengguna.
 * Terpisah dari db.service.js (IndexedDB) yang menangani data GIS.
 *
 * Seluruh operasi dibungkus try/catch karena localStorage bisa fail
 * di mode private/incognito atau saat storage penuh.
 */

export const StorageService = {
  /**
   * Simpan nilai ke localStorage.
   * @param {string} key
   * @param {*} value - Akan di-JSON.stringify otomatis
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[StorageService] Gagal menyimpan key "${key}":`, e);
    }
  },

  /**
   * Ambil nilai dari localStorage.
   * @param {string} key
   * @param {*} defaultValue - Nilai fallback jika key tidak ada atau parse gagal
   * @returns {*}
   */
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[StorageService] Gagal membaca key "${key}":`, e);
      return defaultValue;
    }
  },

  /**
   * Hapus key dari localStorage.
   * @param {string} key
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[StorageService] Gagal menghapus key "${key}":`, e);
    }
  },

  /**
   * Cek apakah key ada di localStorage.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    try {
      return localStorage.getItem(key) !== null;
    } catch (e) {
      return false;
    }
  }
};
