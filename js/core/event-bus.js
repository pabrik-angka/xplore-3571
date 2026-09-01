// js/core/event-bus.js
/**
 * Xplore 3571 - Centralized Pub/Sub EventBus
 * Satu-satunya mekanisme komunikasi antar-modul internal.
 * Menggantikan document.dispatchEvent(new CustomEvent()) yang tidak traceable.
 *
 * Aturan wajib:
 *  - Gunakan EventBus.off() di setiap cleanup/reset modul.
 *  - Simpan referensi handler sebagai module-level variable agar bisa di-off().
 *  - Jangan gunakan anonymous arrow function sebagai handler EventBus.on().
 */

/** @type {Map<string, Set<Function>>} */
const _handlers = new Map();

export const EventBus = {
  /**
   * Daftarkan handler untuk satu event.
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!_handlers.has(event)) _handlers.set(event, new Set());
    _handlers.get(event).add(handler);
  },

  /**
   * Hapus handler (wajib dipanggil saat komponen di-unmount/reset).
   * @param {string} event
   * @param {Function} handler - Harus referensi fungsi yang SAMA persis dengan yang di-on().
   */
  off(event, handler) {
    _handlers.get(event)?.delete(handler);
  },

  /**
   * Kirim event ke semua subscriber.
   * @param {string} event
   * @param {*} payload
   */
  emit(event, payload) {
    console.debug(`[EventBus] emit: ${event}`, payload);
    _handlers.get(event)?.forEach(h => h(payload));
  }
};
