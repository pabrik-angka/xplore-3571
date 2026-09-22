// js/core/listeners/mapListener.js
/**
 * Map Listener Helper - EventBus handler untuk semua event reaktif yang berkaitan dengan MapEngine.
 * Dipindahkan ke js/core/listeners/ sesuai arsitektur DDS-Lite.
 */
import { MapEngine } from '../../domains/map/map.module.js';
import { registerActiveModule, getAggregatedCapabilities } from '../moduleManager.js';
import { EventBus } from '../event-bus.js';
import { MyLocationComponent } from '../../ui/components/my-location.js';
import { ToastComponent } from '../../ui/components/toast.js';

function _syncFabVisibility(caps) {
  const btnMap = document.getElementById('fab-item-map');
  const btnTable = document.getElementById('fab-item-table');
  const btnDash = document.getElementById('fab-item-dashboard');
  if (btnMap) btnMap.classList.toggle('hidden', !caps.spatial);
  if (btnTable) btnTable.classList.toggle('hidden', !caps.tabulasi);
  if (btnDash) btnDash.classList.toggle('hidden', !caps.dashboard);
  // fab-item-location selalu tampil — GPS independen dari data
}

// Module-level handler references agar bisa di-off() jika diperlukan
const _onExploreFlyto = ({ lat, lng }) => {
  if (lat && lng) {
    MapEngine.highlightExplorePoint(lat, lng);
  }
};

const _onPolygonChanged = ({ polygonData, handler, filterMetadata }) => {
  MapEngine.renderPolygon(polygonData, handler);
  registerActiveModule(handler);
  _syncFabVisibility(getAggregatedCapabilities());

  const filterContainer = document.getElementById('dynamic-filter-container');
  if (filterContainer && handler && typeof handler.renderFilterUI === 'function') {
    const meta = filterMetadata || polygonData.features?.map(f => f.properties.filterData) || [];
    handler.renderFilterUI(filterContainer, meta, (criteria) => {
      MapEngine.applyPolygonFilter(criteria);
    });
  }
};

const _onBuildingsChanged = ({ buildingLayerSet }) => {
  MapEngine.renderBuilding(buildingLayerSet);
  if (buildingLayerSet.handler) {
    registerActiveModule(buildingLayerSet.handler);
    _syncFabVisibility(getAggregatedCapabilities());
  }
};

export function initMapListener() {
  EventBus.on('explore:flyto', _onExploreFlyto);
  EventBus.on('app:polygon-changed', _onPolygonChanged);
  EventBus.on('app:buildings-changed', _onBuildingsChanged);

  // Wire-up tombol "Lokasi Saya" di FAB
  const btnMyLocation = document.getElementById('btn-my-location');
  if (btnMyLocation) {
    btnMyLocation.addEventListener('click', () => {
      MyLocationComponent.requestLocation(({ lat, lng, accuracy }) => {
        MapEngine.showMyLocation(lat, lng, accuracy);
      });
    });
  }

  // Wire-up tombol "Set Lat Lon" manual di sidebar
  const btnSetLatLon = document.getElementById('btn-set-latlon');
  const inputLatLon = document.getElementById('input-latlon');

  const handleSetLatLon = () => {
    if (!inputLatLon) return;
    const val = inputLatLon.value.trim();
    if (!val) {
      ToastComponent.showToast('⚠️ Masukkan koordinat Lat, Lon.', 'warning');
      return;
    }

    const parts = val.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) {
      ToastComponent.showToast('❌ Format salah. Gunakan format: lat, lon (contoh: -6.1754, 106.8272)', 'error');
      return;
    }

    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      ToastComponent.showToast('❌ Nilai koordinat tidak valid.', 'error');
      return;
    }

    MapEngine.showMyLocation(lat, lng, 10);
    ToastComponent.showToast(`📍 Lokasi Saya diset ke: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, 'success');
  };

  if (btnSetLatLon) {
    btnSetLatLon.addEventListener('click', handleSetLatLon);
  }
  if (inputLatLon) {
    inputLatLon.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') handleSetLatLon();
    });
  }
}
