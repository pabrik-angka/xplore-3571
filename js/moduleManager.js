// js/moduleManager.js
// Tanggung jawab: Registry in-memory untuk semua modul data aktif pada sesi ini.
// Dispatch event 'app:modules-changed' setiap kali daftar berubah.
// Pure module — tidak bergantung pada global state manapun.

/** @type {Map<string, {id: string, name: string, type: string, is_spatial_active: boolean, is_tabulasi_active: boolean, is_dashboard_active: boolean}>} */
const _activeModules = new Map();

/**
 * Mendaftarkan modul yang baru saja berhasil dimuat ke registry aktif.
 * @param {Object} handler - Objek handler dari data-modules (harus punya id, name)
 */
export function registerActiveModule(handler) {
  if (!handler?.id || !handler?.name) {
    console.warn('[moduleManager] Handler tidak valid — id dan name wajib ada.');
    return;
  }
  _activeModules.set(handler.id, {
    id: handler.id,
    name: handler.name,
    type: handler.type || 'unknown',
    is_spatial_active: handler.is_spatial_active ?? true,
    is_tabulasi_active: handler.is_tabulasi_active ?? false,
    is_dashboard_active: handler.is_dashboard_active ?? false,
  });
  _dispatchChanged();
}

/**
 * Menghapus modul dari registry aktif (misal saat layer di-remove).
 * @param {string} moduleId
 */
export function unregisterActiveModule(moduleId) {
  if (_activeModules.delete(moduleId)) {
    _dispatchChanged();
  }
}

/**
 * Mengembalikan semua modul aktif sebagai array.
 * @returns {Array}
 */
export function getActiveModules() {
  return Array.from(_activeModules.values());
}

/**
 * Menghitung kapabilitas gabungan dari semua modul aktif (OR logic).
 * Jika minimal 1 modul aktif mendukung fitur, maka tombol FAB tampil.
 * @returns {{ spatial: boolean, tabulasi: boolean, dashboard: boolean }}
 */
export function getAggregatedCapabilities() {
  const modules = getActiveModules();
  if (modules.length === 0) return { spatial: false, tabulasi: false, dashboard: false };
  return {
    spatial:   modules.some(m => m.is_spatial_active),
    tabulasi:  modules.some(m => m.is_tabulasi_active),
    dashboard: modules.some(m => m.is_dashboard_active),
  };
}

/** @private */
function _dispatchChanged() {
  document.dispatchEvent(new CustomEvent('app:modules-changed', {
    detail: {
      modules: getActiveModules(),
      capabilities: getAggregatedCapabilities(),
    }
  }));
}
