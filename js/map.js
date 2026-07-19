// js/map.js
const map = L.map('map', { zoomControl: false }).setView([-7.82, 112.02], 12);

// Letakkan kontrol zoom ke kanan bawah agar tidak tertutup drawer mobile view
L.control.zoom({ position: 'bottomright' }).addTo(map);

const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
  maxNativeZoom: 19,
  maxZoom: 22
});

const polygonGroup = L.featureGroup().addTo(map);
const buildingsGroup = L.featureGroup().addTo(map);

export function switchBaseMap(type) {
  if (type === 'osm') {
    map.removeLayer(googleHybrid);
    map.addLayer(osm);
  } else if (type === 'hybrid') {
    map.removeLayer(osm);
    map.addLayer(googleHybrid);
  }
}

export function clearPolygonLayer() {
  polygonGroup.clearLayers();
}

export function clearBuildingsLayer() {
  buildingsGroup.clearLayers();
}

export function renderPolygon(geoJsonData, onEachFeatureCallback) {
  try {
    const geoLayer = L.geoJSON(geoJsonData, {
      style: {
        color: '#4f46e5',
        weight: 1.5,
        fillColor: '#818cf8',
        fillOpacity: 0.2
      },
      onEachFeature: onEachFeatureCallback
    });
    geoLayer.addTo(polygonGroup);
    if (polygonGroup.getLayers().length > 0) {
      map.fitBounds(polygonGroup.getBounds(), { padding: [20, 20] });
    }
    return geoLayer;
  } catch (error) {
    console.error('[Map Module - renderPolygon Error]:', error);
  }
}

export function renderPoints(layersConfig) {
  try {
    layersConfig.forEach(cfg => {
      if (!cfg.geometry || !Number.isFinite(cfg.geometry.lat) || !Number.isFinite(cfg.geometry.lng)) return;
      
      const marker = L.circleMarker([cfg.geometry.lat, cfg.geometry.lng], {
        radius: 6,
        color: '#e11d48',
        fillColor: '#fb7185',
        fillOpacity: 0.85,
        weight: 1
      });
      
      if (cfg.tooltipHtml) {
        marker.bindPopup(cfg.tooltipHtml);
      }
      
      marker._search_keyword = cfg.searchKeyword;
      marker.addTo(buildingsGroup);
    });
    
    if (buildingsGroup.getLayers().length > 0) {
      map.fitBounds(buildingsGroup.getBounds(), { padding: [30, 30] });
    }
  } catch (error) {
    console.error('[Map Module - renderPoints Error]:', error);
  }
}

export function focusToLayer(bounds) {
  if (bounds) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
  }
}

export function getBuildingsGroup() {
  return buildingsGroup;
}