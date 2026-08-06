// js/helpers/listeners/mapListener.js
/**
 * Map Listener Helper - Event handler untuk semua event reaktif yang berkaitan dengan MapEngine.
 * Dipindahkan dari js/map.js module-level scope (ISS-02) ke sini agar map.js murni sebagai orkestrator GIS.
 * 
 * Event yang ditangani:
 *   - explore:flyto         → MapEngine.highlightExplorePoint()
 *   - app:polygon-changed   → MapEngine.renderPolygon() + registerActiveModule() + syncFab
 *   - app:buildings-changed → MapEngine.renderBuilding() + registerActiveModule() + syncFab
 */
import { MapEngine } from '../../map.js';
import { registerActiveModule, getAggregatedCapabilities } from '../../moduleManager.js';

/**
 * Sinkronisasi visibilitas tombol FAB berdasarkan kapabilitas gabungan modul aktif.
 * @param {{ spatial: boolean, tabulasi: boolean, dashboard: boolean }} caps
 */
function _syncFabVisibility(caps) {
  const btnMap = document.getElementById('fab-item-map');
  const btnTable = document.getElementById('fab-item-table');
  const btnDash = document.getElementById('fab-item-dashboard');
  if (btnMap) btnMap.classList.toggle('hidden', !caps.spatial);
  if (btnTable) btnTable.classList.toggle('hidden', !caps.tabulasi);
  if (btnDash) btnDash.classList.toggle('hidden', !caps.dashboard);
}

/**
 * Mendaftarkan semua event listener reaktif yang berkaitan dengan peta.
 * Dipanggil satu kali oleh ListenerManager.init().
 */
export function initMapListener() {
  // Linked view: fly-to lokasi titik dari tabel tabulasi
  document.addEventListener('explore:flyto', (e) => {
    if (e.detail && e.detail.lat && e.detail.lng) {
      MapEngine.highlightExplorePoint(e.detail.lat, e.detail.lng);
    }
  });

  // Polygon baru dimuat → render + daftarkan modul aktif
  document.addEventListener('app:polygon-changed', (e) => {
    const { polygonData, handler } = e.detail;
    MapEngine.renderPolygon(polygonData, handler);
    registerActiveModule(handler);
    _syncFabVisibility(getAggregatedCapabilities());
  });

  // Dataset bangunan baru dimuat → render + daftarkan modul aktif
  document.addEventListener('app:buildings-changed', (e) => {
    const { buildingLayerSet } = e.detail;
    MapEngine.renderBuilding(buildingLayerSet);
    if (buildingLayerSet.handler) {
      registerActiveModule(buildingLayerSet.handler);
      _syncFabVisibility(getAggregatedCapabilities());
    }
  });
}
