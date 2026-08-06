// js/helpers/listeners/storeListener.js
/**
 * Store Listener Helper - Event handler untuk event progress/toast yang dikirim oleh store.js.
 * Memutus circular dependency store.js → ui.js (ISS-04) dengan pola event-driven.
 * 
 * Event yang ditangani:
 *   - store:loading → ToastComponent.showLoading()
 *   - store:toast   → ToastComponent.showToast()
 */
import { ToastComponent } from '../../components/toast.js';

/**
 * Mendaftarkan listener untuk event progress dari store.js.
 * Dipanggil satu kali oleh ListenerManager.init().
 */
export function initStoreListener() {
  // Tampilkan / sembunyikan loading indicator saat store sedang memproses data
  document.addEventListener('store:loading', (e) => {
    const { show, text, percent } = e.detail;
    ToastComponent.showLoading(show, text ?? 'Memproses data...', percent ?? null);
  });

  // Tampilkan notifikasi toast setelah store selesai memproses (sukses / error)
  document.addEventListener('store:toast', (e) => {
    const { message, type } = e.detail;
    ToastComponent.showToast(message, type ?? 'info');
  });
}
