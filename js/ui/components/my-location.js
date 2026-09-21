// js/ui/components/my-location.js
/**
 * Komponen "Lokasi Saya" — GPS Geolocation sederhana
 * Langsung memanggil Geolocation API (browser menampilkan native permission prompt).
 * Jika diizinkan → callback onLocationFound({ lat, lng, accuracy }).
 */
import { ToastComponent } from './toast.js';

export const MyLocationComponent = {

  /**
   * Minta lokasi GPS — browser akan tampilkan native permission dialog otomatis.
   * @param {Function} onLocationFound - callback({ lat, lng, accuracy })
   */
  requestLocation(onLocationFound) {
    if (!navigator.geolocation) {
      ToastComponent.showToast('❌ Perangkat tidak mendukung GPS/Geolocation.', 'error');
      return;
    }

    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        ToastComponent.showToast(`📍 Lokasi ditemukan (akurasi ±${Math.round(accuracy)}m)`, 'success');
        if (typeof onLocationFound === 'function') {
          onLocationFound({ lat, lng, accuracy });
        }
      },
      (error) => {
        // PERMISSION_DENIED → user memang menolak, tidak perlu error berisik
        if (error.code === error.PERMISSION_DENIED) return;
        const msg = this._getErrorMessage(error);
        ToastComponent.showToast(`❌ ${msg}`, 'error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  },

  /** @private */
  _getErrorMessage(error) {
    switch (error.code) {
      case error.POSITION_UNAVAILABLE: return 'Posisi GPS tidak tersedia. Pastikan GPS aktif.';
      case error.TIMEOUT: return 'Waktu habis mengambil posisi GPS. Coba lagi.';
      default: return 'Gagal mendapatkan lokasi GPS.';
    }
  }
};
