// js/domains/map/map.module.js
/**
 * Xplore 3571 - GIS Map Domain Orchestrator
 * Dipindahkan dari js/map.js ke js/domains/map/ sesuai arsitektur DDS-Lite.
 *
 * Tanggung jawab: Orkestrator domain peta Leaflet.
 * Math spasial → helpers/spatial-filter.js
 * Render marker → building-layer-manager.js (domain/map local)
 */
import { CONFIG } from '../../core/config.js';
import { SpatialFilter } from '../../helpers/spatial-filter.js';
import { BuildingLayerManager } from './building-layer-manager.js';

// Extend Leaflet's Canvas renderer to support drawing squares natively on canvas
if (typeof L !== 'undefined' && L.Canvas) {
  L.Canvas.include({
    _updateCircle: function (layer) {
      if (!this._drawing || layer._empty()) { return; }

      var p = layer._point,
        ctx = this._ctx,
        r = Math.max(Math.round(layer._radius), 1),
        s = (Math.max(Math.round(layer._radiusY), 1) || r) / r;

      if (s !== 1) {
        ctx.save();
        ctx.scale(1, s);
      }

      ctx.beginPath();
      if (layer.options.shape === 'square') {
        ctx.rect(p.x - r, p.y / s - r, r * 2, r * 2);
      } else {
        ctx.arc(p.x, p.y / s, r, 0, Math.PI * 2, false);
      }

      if (s !== 1) {
        ctx.restore();
      }

      this._fillStroke(ctx, layer);
    }
  });
}

export const MapEngine = {
  map: null,
  polygonLayerGroup: null,
  rawGeoJsonInstance: null,
  polygonSnapshot: null,
  baseLayers: {},
  currentBaseLayer: null,

  // Getters untuk backward-compat / mapping data dari manager
  get buildingLayerGroups() { return BuildingLayerManager.buildingLayerGroups; },
  get buildingSnapshots() { return BuildingLayerManager.buildingSnapshots; },
  get activeLegendItems() { return BuildingLayerManager.activeLegendItems; },

  /**
   * Inisialisasi peta dasar kosongan di awal sesuai config
   */
  init(containerId) {
    try {
      if (this.map) return;

      // VALIDASI: Cek apakah elemen ada di DOM saat ini
      const container = document.getElementById(containerId);
      if (!container) {
        console.warn(`[MapEngine - Cancelled]: Elemen dengan ID '${containerId}' tidak ditemukan di DOM. Penundaan inisialisasi dilakukan.`);
        return false; // Kembalikan status gagal tanpa melempar hard error
      }

      const mapConfig = CONFIG.MAP;
      this.map = L.map(containerId, { maxZoom: 22 }).setView(mapConfig.DEFAULT_CENTER, mapConfig.DEFAULT_ZOOM);

      this.baseLayers.osm = L.tileLayer(mapConfig.TILE_LAYER, {
        maxNativeZoom: 19,
        maxZoom: 22,
        attribution: mapConfig.ATTRIBUTION
      });

      this.baseLayers.google = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxNativeZoom: 21,
        maxZoom: 22,
        attribution: '© Google Maps'
      });

      this.currentBaseLayer = this.baseLayers.osm;
      this.currentBaseLayer.addTo(this.map);

      this.polygonLayerGroup = L.featureGroup().addTo(this.map);
      this.canvasRenderer = L.canvas({ padding: 0.5 });

      // Initialize single global layer control and active legend registry
      this.layerControl = L.control.layers(null, null, { position: 'topright', collapsed: false }).addTo(this.map);

      console.log('✔ Leaflet Map Engine initialized empty with configured center.');
      return true; // Sukses
    } catch (error) {
      console.error('[MapEngine - init Error]:', error);
      return false;
    }
  },

  /**
   * Memaksa Leaflet menghitung ulang ukuran kontainer agar tidak blank/abu-abu
   */
  resize() {
    if (this.map) {
      this.map.invalidateSize({ animate: true });
    }
  },

  /**
   * Mengganti layer peta dasar secara real-time
   */
  switchBasemap(type) {
    if (!this.map || !this.baseLayers[type]) return;

    this.map.removeLayer(this.currentBaseLayer);
    this.currentBaseLayer = this.baseLayers[type];
    this.currentBaseLayer.addTo(this.map);
  },

  /**
   * Render koleksi GeoJSON penuh ke dalam peta dengan interaksi klik
   */
  renderPolygon(geojsonData, handlerStyle) {
    if (!this.map || !this.polygonLayerGroup) return;

    this.polygonLayerGroup.clearLayers();

    this.rawGeoJsonInstance = L.geoJSON(geojsonData, {
      renderer: this.canvasRenderer,
      style: () => handlerStyle.getStyle(),
      onEachFeature: (feature, layer) => {
        if (feature.properties && feature.properties.tooltipHtml) {
          layer.bindPopup(feature.properties.tooltipHtml, {
            closeButton: true,
            offset: L.point(0, -10)
          });
        }
      }
    });

    this.polygonSnapshot = this.rawGeoJsonInstance.getLayers().slice();

    this.polygonSnapshot.forEach(layer => {
      this.polygonLayerGroup.addLayer(layer);
    });

    this.map.fitBounds(this.polygonLayerGroup.getBounds());

    this.bringBuildingsToFront();
  },

  /**
   * Menjalankan fungsi filter lokal leaflet
   */
  applyPolygonFilter(criteria) {
    if (!this.polygonSnapshot) return;

    // NOTE: Store diakses via dynamic import untuk menghindari circular dependency
    import('../../core/store.js').then(({ Store }) => {
      const path = [criteria.kec, criteria.desa, criteria.sls].filter(Boolean);
      const targetIndices = Store.getTargetIndices(path);
      const targetSet = new Set(targetIndices);

      const visibleLayers = [];

      this.polygonSnapshot.forEach((layer) => {
        const idx = layer.feature.properties._index;

        if (targetSet.has(idx)) {
          if (!this.polygonLayerGroup.hasLayer(layer)) {
            this.polygonLayerGroup.addLayer(layer);
          }
          visibleLayers.push(layer);
        } else {
          if (this.polygonLayerGroup.hasLayer(layer)) {
            this.polygonLayerGroup.removeLayer(layer);
          }
        }
      });

      if (visibleLayers.length > 0) {
        const group = L.featureGroup(visibleLayers);
        this.map.fitBounds(group.getBounds(), { padding: [20, 20] });
      }

      this.applySpatialFilter();
      this.bringBuildingsToFront();
    });
  },

  /**
   * Menghapus layer bangunan & legenda spesifik dari peta Leaflet secara bersih
   */
  removeBuilding(id) {
    BuildingLayerManager.removeBuilding(this.map, this.layerControl, id, () => this.updateLegend());
  },

  /**
   * Merender titik bangunan dari Store ke dalam satu Layer Control dan Legenda global
   */
  renderBuilding(buildingLayerSet) {
    BuildingLayerManager.renderBuilding(this.map, this.layerControl, this.canvasRenderer, buildingLayerSet, () => this.updateLegend());
  },

  /**
   * Menambahkan batch titik baru ke layer bangunan yang sudah ada (Incremental Loading)
   */
  appendBuildingBatch(id, newPoints, isFirstBatch = false) {
    BuildingLayerManager.appendBuildingBatch(this.map, this.layerControl, this.canvasRenderer, id, newPoints, isFirstBatch, () => this.updateLegend());
  },

  /**
   * Menjalankan filter titik yang berada di dalam polygon yang terlihat (Point-in-Polygon)
   */
  applySpatialFilter() {
    if (!this.polygonLayerGroup || this.polygonLayerGroup.getLayers().length === 0) {
      for (const id in this.buildingSnapshots) {
        const snapshot = this.buildingSnapshots[id];
        const toAdd = snapshot.filter(m => !m.targetGroup.hasLayer(m));
        if (toAdd.length > 0) {
          const group = snapshot[0]?.targetGroup;
          if (group && group.addLayers) group.addLayers(toAdd);
          else if (group) toAdd.forEach(m => group.addLayer(m));
        }
      }
      return;
    }

    const visibleBounds = this.polygonLayerGroup.getBounds();
    if (!visibleBounds || !visibleBounds.isValid()) return;

    const activePolygons = SpatialFilter.getActivePolygons(this.polygonLayerGroup);

    for (const id in this.buildingSnapshots) {
      const snapshot = this.buildingSnapshots[id];
      const candidateMarkers = [];
      const instantRemove = [];

      snapshot.forEach(marker => {
        if (!visibleBounds.contains(marker.itemLatLng)) {
          if (marker.targetGroup.hasLayer(marker)) {
            instantRemove.push(marker);
          }
        } else {
          candidateMarkers.push(marker);
        }
      });

      if (instantRemove.length > 0) {
        const group = instantRemove[0]?.targetGroup;
        if (group && group.removeLayers) group.removeLayers(instantRemove);
        else if (group) instantRemove.forEach(m => group.removeLayer(m));
      }

      if (candidateMarkers.length > 0) {
        this._processSpatialCandidateBatch(candidateMarkers, activePolygons, 0, 1000);
      }
    }
  },

  /**
   * Batch processing async Ray-Casting dengan Operasi Bulk Array
   */
  _processSpatialCandidateBatch(candidates, activePolygons, startIndex, batchSize) {
    const endIndex = Math.min(startIndex + batchSize, candidates.length);
    const toAdd = [];
    const toRemove = [];

    for (let i = startIndex; i < endIndex; i++) {
      const marker = candidates[i];
      const isInside = SpatialFilter.isPointInPolygonFast(marker.itemLatLng, activePolygons);

      if (isInside) {
        if (!marker.targetGroup.hasLayer(marker)) {
          toAdd.push(marker);
        }
      } else {
        if (marker.targetGroup.hasLayer(marker)) {
          toRemove.push(marker);
        }
      }
    }

    if (candidates.length > 0) {
      const group = candidates[0]?.targetGroup;
      if (group) {
        if (toRemove.length > 0) {
          if (group.removeLayers) group.removeLayers(toRemove);
          else toRemove.forEach(m => group.removeLayer(m));
        }
        if (toAdd.length > 0) {
          if (group.addLayers) group.addLayers(toAdd);
          else toAdd.forEach(m => group.addLayer(m));
        }
      }
    }

    if (endIndex < candidates.length) {
      requestAnimationFrame(() => {
        this._processSpatialCandidateBatch(candidates, activePolygons, endIndex, batchSize);
      });
    }
  },

  /**
   * Interaksi "Point to Map" — fly to dan buka popup
   */
  focusToBuilding(layerId, lat, lng, popupHtml) {
    if (!this.map) return;

    const targetLatLng = L.latLng(lat, lng);

    this.map.flyTo(targetLatLng, 19, {
      animate: true,
      duration: 1.5
    });

    let foundMarker = null;
    if (this.buildingSnapshots[layerId]) {
      const markers = this.buildingSnapshots[layerId];
      for (const marker of markers) {
        if (marker.itemLatLng.equals(targetLatLng)) {
          foundMarker = marker;
          break;
        }
      }
    }

    if (foundMarker) {
      const group = foundMarker.targetGroup;
      if (!group.hasLayer(foundMarker)) {
        group.addLayer(foundMarker);
      }
      this.map.once('moveend', () => {
        foundMarker.openPopup();
      });
    } else {
      this.map.once('moveend', () => {
        L.popup({ offset: L.point(0, -10) })
          .setLatLng(targetLatLng)
          .setContent(popupHtml)
          .openOn(this.map);
      });
    }
  },

  /**
   * Memperbarui panel legenda global tunggal di pojok kanan bawah
   */
  updateLegend() {
    if (!this.legendControl) {
      this.legendControl = L.control({ position: 'topright' });
      this.legendControl.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend bg-base-100/95 backdrop-blur shadow-lg p-3 rounded-lg border border-base-200 text-xs mt-2 min-w-[180px]');
        div.id = 'global-map-legend';
        return div;
      };
      this.legendControl.addTo(this.map);
    }

    const container = document.getElementById('global-map-legend');
    if (!container) return;

    let html = '<h4 class="font-bold mb-2 border-b border-base-200 pb-1 text-base-content/80 text-sm">Legenda</h4>';
    let hasItems = false;

    for (const layerId in this.activeLegendItems) {
      const items = this.activeLegendItems[layerId];
      for (const cat in items) {
        hasItems = true;
        html += `
          <div class="flex items-center gap-2 mb-1.5 last:mb-0">
            <span class="inline-block w-3 h-3 rounded-full border border-base-content/20 shadow-sm" style="background-color: ${items[cat]}"></span>
            <span class="text-base-content/90 font-medium">${cat}</span>
          </div>
        `;
      }
    }

    if (hasItems) {
      container.innerHTML = html;
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
    }
  },

  /**
   * Mengatur antrean gambar pada Canvas agar semua marker berada di atas polygon
   */
  bringBuildingsToFront() {
    BuildingLayerManager.bringBuildingsToFront();
  },

  /**
   * Highlight & Fly-To titik lokasi dari linked view tabulasi
   */
  highlightExplorePoint(lat, lng) {
    if (!this.map || isNaN(lat) || isNaN(lng)) return;

    const targetLatLng = L.latLng(lat, lng);
    this.map.flyTo(targetLatLng, 19, { animate: true, duration: 1.2 });

    const circle = L.circleMarker(targetLatLng, {
      radius: 18,
      color: '#f59e0b',
      fillColor: '#fbbf24',
      fillOpacity: 0.4,
      weight: 3
    }).addTo(this.map);

    setTimeout(() => {
      let opacity = 0.4;
      const fadeInterval = setInterval(() => {
        opacity -= 0.05;
        if (opacity <= 0) {
          clearInterval(fadeInterval);
          this.map.removeLayer(circle);
        } else {
          circle.setStyle({ fillOpacity: opacity, opacity: opacity * 2 });
        }
      }, 50);
    }, 1500);
  }
};
