// js/core/listeners/mapListener.js
/**
 * Map Listener Helper - EventBus handler untuk semua event reaktif yang berkaitan dengan MapEngine.
 * Dipindahkan ke js/core/listeners/ sesuai arsitektur DDS-Lite.
 */
import { MapEngine } from '../../domains/map/map.module.js';
import { registerActiveModule, getAggregatedCapabilities } from '../moduleManager.js';
import { EventBus } from '../event-bus.js';

function _syncFabVisibility(caps) {
  const btnMap = document.getElementById('fab-item-map');
  const btnTable = document.getElementById('fab-item-table');
  const btnDash = document.getElementById('fab-item-dashboard');
  if (btnMap) btnMap.classList.toggle('hidden', !caps.spatial);
  if (btnTable) btnTable.classList.toggle('hidden', !caps.tabulasi);
  if (btnDash) btnDash.classList.toggle('hidden', !caps.dashboard);
}

// Module-level handler references agar bisa di-off() jika diperlukan
const _onExploreFlyto = ({ lat, lng }) => {
  if (lat && lng) {
    MapEngine.highlightExplorePoint(lat, lng);
  }
};

const _onPolygonChanged = ({ polygonData, handler }) => {
  MapEngine.renderPolygon(polygonData, handler);
  registerActiveModule(handler);
  _syncFabVisibility(getAggregatedCapabilities());
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
}
