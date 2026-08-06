// js/listenerManager.js
/**
 * Xplore 3571 - Listener Manager (Orchestrator)
 * 
 * Tanggung jawab TUNGGAL: Menjadi satu-satunya titik registrasi semua global event listener.
 * Menggantikan listener yang tersebar di module-level map.js (ISS-02).
 * 
 * Setiap kelompok listener dipisahkan ke file helper di js/helpers/listeners/:
 *   - mapListener.js   → event spasial peta (polygon-changed, buildings-changed, flyto)
 *   - storeListener.js → event progress store (store:loading, store:toast)
 * 
 * Dipanggil sekali dari app.js setelah DOM siap.
 */
import { initMapListener } from './helpers/listeners/mapListener.js';
import { initStoreListener } from './helpers/listeners/storeListener.js';

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
