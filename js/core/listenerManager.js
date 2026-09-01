// js/core/listenerManager.js
/**
 * Xplore 3571 - Listener Manager
 * Dipindahkan dari js/listenerManager.js ke js/core/ sesuai arsitektur DDS-Lite.
 * Tanggung jawab TUNGGAL: Menjadi satu-satunya titik registrasi semua global listener.
 */
import { initMapListener } from './listeners/mapListener.js';
import { initStoreListener } from './listeners/storeListener.js';

export const ListenerManager = {
  /**
   * Inisialisasi semua global event listener aplikasi.
   * Panggil sekali dari app.js setelah UI dan MapEngine siap.
   */
  init() {
    initMapListener();
    initStoreListener();
    console.log('✔ ListenerManager: Semua global event listener berhasil didaftarkan.');
  }
};
