// js/helpers/building-layer-manager.js
/**
 * BuildingLayerManager - Mengurus manajemen dan rendering penanda titik bangunan Leaflet.
 * Decoupled dari js/map.js (SRP).
 */

export const BuildingLayerManager = {
  buildingLayerGroups: {}, // Menyimpan L.featureGroup/L.markerClusterGroup masing-masing sumber bangunan
  buildingSnapshots: {},   // Menyimpan array layer L.circleMarker titik mentah
  activeLegendItems: {},   // Menyimpan data legenda aktif

  /**
   * Menghapus layer bangunan & legenda spesifik dari peta Leaflet secara bersih.
   * @param {Object} map - Instance peta Leaflet
   * @param {Object} layerControl - Kontrol layer Leaflet
   * @param {string} id - ID layer dataset bangunan
   * @param {Function} updateLegendFn - Callback untuk memicu update legend peta
   */
  removeBuilding(map, layerControl, id, updateLegendFn) {
    if (!map || !id) return;

    if (this.buildingLayerGroups[id]) {
      if (typeof this.buildingLayerGroups[id].clearLayers === 'function') {
        this.buildingLayerGroups[id].clearLayers();
      }
      if (this.buildingLayerGroups[id] instanceof L.LayerGroup) {
        map.removeLayer(this.buildingLayerGroups[id]);
        if (layerControl) layerControl.removeLayer(this.buildingLayerGroups[id]);
      } else if (typeof this.buildingLayerGroups[id] === 'object') {
        Object.values(this.buildingLayerGroups[id]).forEach(g => {
          if (typeof g.clearLayers === 'function') g.clearLayers();
          map.removeLayer(g);
          if (layerControl) layerControl.removeLayer(g);
        });
      }
      delete this.buildingLayerGroups[id];
    }

    if (this.buildingSnapshots[id]) {
      delete this.buildingSnapshots[id];
    }

    if (this.activeLegendItems[id]) {
      delete this.activeLegendItems[id];
    }

    if (typeof updateLegendFn === 'function') {
      updateLegendFn();
    }
  },

  /**
   * Merender seluruh titik bangunan dari data store ke peta Leaflet.
   */
  renderBuilding(map, layerControl, canvasRenderer, buildingLayerSet, updateLegendFn) {
    if (!map) return;

    const { id, points, sourceName } = buildingLayerSet;

    // Bersihkan layer lama jika re-render
    this.removeBuilding(map, layerControl, id, updateLegendFn);

    this.buildingSnapshots[id] = [];
    let mainBounds = L.latLngBounds();

    const hasSubcategory = points.some(p => p.config.subcategory);

    if (hasSubcategory) {
      this.buildingLayerGroups[id] = {};
      const subCatColors = {};

      points.forEach(item => {
        const { config, style } = item;
        const subCat = config.subcategory || 'Lainnya';

        if (!this.buildingLayerGroups[id][subCat]) {
          this.buildingLayerGroups[id][subCat] = L.markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 40,
            disableClusteringAtZoom: 14
          }).addTo(map);
          if (layerControl) {
            layerControl.addOverlay(this.buildingLayerGroups[id][subCat], subCat);
          }
          subCatColors[subCat] = style.fillColor || style.color || '#cccccc';
        }

        const marker = L.circleMarker([config.geometry.lat, config.geometry.lng], {
          ...style,
          renderer: canvasRenderer
        });
        marker.bindPopup(config.popupHtml);
        marker.itemLatLng = L.latLng(config.geometry.lat, config.geometry.lng);
        marker.targetGroup = this.buildingLayerGroups[id][subCat];
        marker.targetGroup.addLayer(marker);

        mainBounds.extend(marker.itemLatLng);
        this.buildingSnapshots[id].push(marker);
      });

      this.activeLegendItems[id] = subCatColors;

    } else {
      const featureGroup = L.markerClusterGroup({
        chunkedLoading: true
      }).addTo(map);
      this.buildingLayerGroups[id] = featureGroup;

      const layerLabel = sourceName || 'Titik Bangunan';
      if (layerControl) {
        layerControl.addOverlay(featureGroup, layerLabel);
      }

      let firstColor = '#cccccc';
      points.forEach(item => {
        const { config, style } = item;
        if (firstColor === '#cccccc') {
          firstColor = style.fillColor || style.color || '#cccccc';
        }
        const marker = L.circleMarker([config.geometry.lat, config.geometry.lng], {
          ...style,
          renderer: canvasRenderer
        });
        marker.bindPopup(config.popupHtml);
        marker.itemLatLng = L.latLng(config.geometry.lat, config.geometry.lng);
        marker.targetGroup = featureGroup;
        marker.targetGroup.addLayer(marker);

        mainBounds.extend(marker.itemLatLng);
        this.buildingSnapshots[id].push(marker);
      });

      this.activeLegendItems[id] = { [layerLabel]: firstColor };
    }

    if (typeof updateLegendFn === 'function') {
      updateLegendFn();
    }

    this.bringBuildingsToFront();

    if (mainBounds.isValid()) {
      map.fitBounds(mainBounds);
    }
  },

  /**
   * Menambahkan batch titik baru ke layer bangunan yang sudah ada (Incremental Loading).
   */
  appendBuildingBatch(map, layerControl, canvasRenderer, id, newPoints, isFirstBatch, updateLegendFn) {
    if (!map || !newPoints || newPoints.length === 0) return;

    if (!this.buildingSnapshots[id]) {
      this.buildingSnapshots[id] = [];
    }

    let group = this.buildingLayerGroups[id];
    if (!group) {
      group = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 40,
        disableClusteringAtZoom: 14
      }).addTo(map);
      this.buildingLayerGroups[id] = group;
      if (layerControl) {
        layerControl.addOverlay(group, 'Titik Bangunan');
      }
    }

    const clusterGroup = (group instanceof L.LayerGroup) ? group : Object.values(group)[0];
    if (!clusterGroup) return;

    const markers = [];
    const mainBounds = L.latLngBounds();

    newPoints.forEach(item => {
      const { config, style } = item;
      const marker = L.circleMarker([config.geometry.lat, config.geometry.lng], {
        ...style,
        renderer: canvasRenderer
      });
      marker.bindPopup(config.popupHtml);
      marker.itemLatLng = L.latLng(config.geometry.lat, config.geometry.lng);
      marker.targetGroup = clusterGroup;

      markers.push(marker);
      mainBounds.extend(marker.itemLatLng);
      this.buildingSnapshots[id].push(marker);
    });

    requestAnimationFrame(() => {
      if (clusterGroup.addLayers) {
        clusterGroup.addLayers(markers);
      } else {
        markers.forEach(m => clusterGroup.addLayer(m));
      }

      if (isFirstBatch && mainBounds.isValid()) {
        map.fitBounds(mainBounds);
      }

      this.bringBuildingsToFront();
    });
  },

  /**
   * Memastikan semua marker titik bangunan digambar di atas polygon pada canvas.
   */
  bringBuildingsToFront() {
    for (const id in this.buildingLayerGroups) {
      const group = this.buildingLayerGroups[id];
      if (group) {
        if (typeof group.bringToFront === 'function') {
          try { group.bringToFront(); } catch (e) {}
        } else if (typeof group === 'object') {
          Object.values(group).forEach(g => {
            if (g && typeof g.bringToFront === 'function') {
              try { g.bringToFront(); } catch (e) {}
            }
          });
        }
      }
    }
  }
};
