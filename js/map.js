// js/map.js
import { CONFIG } from './config.js';
import { Store } from './store.js';

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
  buildingLayerGroups: {}, // Menyimpan L.featureGroup masing-masing sumber bangunan
  buildingSnapshots: {},   // Menyimpan array layer L.circleMarker titik mentah
  baseLayers: {},
  currentBaseLayer: null,

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
        maxZoom: 22, // Memungkinkan OSM direntangkan (auto-scale) hingga zoom 22
        attribution: mapConfig.ATTRIBUTION
      });

      this.baseLayers.google = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxNativeZoom: 21,
        maxZoom: 22,
        attribution: '© Google Maps'
      });

      this.currentBaseLayer = this.baseLayers.osm;
      this.currentBaseLayer.addTo(this.map);

      // Create a dedicated pane for buildings to keep them on top of polygons
      this.map.createPane('buildingPane');
      this.map.getPane('buildingPane').style.zIndex = '450';

      this.polygonLayerGroup = L.featureGroup().addTo(this.map);
      this.canvasRenderer = L.canvas({ padding: 0.5, pane: 'buildingPane' });
      
      // Initialize single global layer control and active legend registry
      this.layerControl = L.control.layers(null, null, { position: 'bottomright', collapsed: false }).addTo(this.map);
      this.activeLegendItems = {};

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
      style: () => handlerStyle.getStyle(),
      onEachFeature: (feature, layer) => {
        if (feature.properties && feature.properties.tooltipHtml) {
          // PERBAIKAN INTERAKSI: Menggunakan bindPopup agar informasi hanya muncul saat poligon diklik
          layer.bindPopup(feature.properties.tooltipHtml, {
            closeButton: true,
            offset: L.point(0, -10)
          });
        }
      }
    });

    // PERBAIKAN BUG PERFORMA & VISIBILITAS:
    // Ekstrak array layer individu dari instance geojson ke snapshot
    this.polygonSnapshot = this.rawGeoJsonInstance.getLayers().slice();

    // Tambahkan masing-masing layer individu secara langsung ke polygonLayerGroup
    // Jangan tambahkan rawGeoJsonInstance agar removeLayer berfungsi dengan benar.
    this.polygonSnapshot.forEach(layer => {
      this.polygonLayerGroup.addLayer(layer);
    });

    this.map.fitBounds(this.polygonLayerGroup.getBounds());
  },

  /**
   * Menjalankan fungsi filter lokal leaflet
   */
  applyPolygonFilter(criteria) {
    if (!this.polygonSnapshot) return;

    // Dapatkan index target dari array filter [kec, desa, sls]
    const path = [criteria.kec, criteria.desa, criteria.sls].filter(Boolean);
    const targetIndices = Store.getTargetIndices(path);
    const targetSet = new Set(targetIndices);

    const visibleLayers = [];

    // Iterasi layer berdasarkan array snapshot untuk akurasi add/remove individual
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

    // Fit bounds responsif
    if (visibleLayers.length > 0) {
      const group = L.featureGroup(visibleLayers);
      this.map.fitBounds(group.getBounds(), { padding: [20, 20] });
    }

    // Terapkan filter spasial ke titik bangunan (mengikuti polygon)
    this.applySpatialFilter();
  },

  /**
   * Merender titik bangunan dari Store ke dalam satu Layer Control dan Legenda global
   */
  renderBuilding(buildingLayerSet) {
    if (!this.map) return;
    
    const { id, points, sourceName } = buildingLayerSet;

    // Bersihkan layer lama jika re-render
    if (this.buildingLayerGroups[id]) {
      if (this.buildingLayerGroups[id] instanceof L.LayerGroup) {
        this.map.removeLayer(this.buildingLayerGroups[id]);
        if (this.layerControl) this.layerControl.removeLayer(this.buildingLayerGroups[id]);
      } else {
        Object.values(this.buildingLayerGroups[id]).forEach(g => {
          this.map.removeLayer(g);
          if (this.layerControl) this.layerControl.removeLayer(g);
        });
      }
      delete this.buildingLayerGroups[id];
    }
    if (this.activeLegendItems[id]) {
      delete this.activeLegendItems[id];
    }

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
          this.buildingLayerGroups[id][subCat] = L.featureGroup().addTo(this.map);
          if (this.layerControl) {
            this.layerControl.addOverlay(this.buildingLayerGroups[id][subCat], subCat);
          }
          subCatColors[subCat] = style.fillColor || style.color || '#cccccc';
        }

        const marker = L.circleMarker([config.geometry.lat, config.geometry.lng], {
          ...style,
          renderer: this.canvasRenderer
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
      const featureGroup = L.featureGroup().addTo(this.map);
      this.buildingLayerGroups[id] = featureGroup;

      const layerLabel = sourceName || 'Titik Bangunan';
      if (this.layerControl) {
        this.layerControl.addOverlay(featureGroup, layerLabel);
      }

      let firstColor = '#cccccc';
      points.forEach(item => {
        const { config, style } = item;
        if (firstColor === '#cccccc') {
          firstColor = style.fillColor || style.color || '#cccccc';
        }
        const marker = L.circleMarker([config.geometry.lat, config.geometry.lng], {
          ...style,
          renderer: this.canvasRenderer
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

    // Perbarui Tampilan Legenda Global
    this.updateLegend();

    if (mainBounds.isValid()) {
      this.map.fitBounds(mainBounds);
    }
  },

  /**
   * Menjalankan filter titik yang berada di dalam polygon yang terlihat (Point-in-Polygon)
   */
  applySpatialFilter() {
    if (!this.polygonLayerGroup || this.polygonLayerGroup.getLayers().length === 0) {
      // Jika tidak ada polygon, tampilkan semua titik utuh
      for (const id in this.buildingSnapshots) {
        const snapshot = this.buildingSnapshots[id];
        snapshot.forEach(marker => {
          if (!marker.targetGroup.hasLayer(marker)) marker.targetGroup.addLayer(marker);
        });
      }
      return;
    }

    // Jika ada polygon, filter titik
    for (const id in this.buildingSnapshots) {
      const snapshot = this.buildingSnapshots[id];
      
      snapshot.forEach(marker => {
        const isInside = this.isPointInPolygon(marker.itemLatLng, this.polygonLayerGroup);
        if (isInside) {
          if (!marker.targetGroup.hasLayer(marker)) marker.targetGroup.addLayer(marker);
        } else {
          if (marker.targetGroup.hasLayer(marker)) marker.targetGroup.removeLayer(marker);
        }
      });
    }
  },

  /**
   * Algoritma Ray-Casting Point-in-Polygon
   */
  isPointInPolygon(latlng, layerGroup) {
    let inside = false;
    layerGroup.eachLayer(layer => {
      if (inside) return;
      
      // Optimasi dengan Bounding Box Leaflet (super cepat)
      if (layer.getBounds && !layer.getBounds().contains(latlng)) return;

      const pt = [latlng.lng, latlng.lat];
      let polygons = [];
      if (layer.feature.geometry.type === 'Polygon') {
        polygons = [layer.feature.geometry.coordinates];
      } else if (layer.feature.geometry.type === 'MultiPolygon') {
        polygons = layer.feature.geometry.coordinates;
      }
      
      for (const poly of polygons) {
        if (inside) break;
        const ring = poly[0]; 
        let intersect = false;
        
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const xi = ring[i][0], yi = ring[i][1];
          const xj = ring[j][0], yj = ring[j][1];
          if (((yi > pt[1]) != (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) {
            intersect = !intersect;
          }
        }
        
        if (intersect) {
          let inHole = false;
          for (let k = 1; k < poly.length; k++) {
            const hole = poly[k];
            let intersectHole = false;
            for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
              const xi = hole[i][0], yi = hole[i][1];
              const xj = hole[j][0], yj = hole[j][1];
              if (((yi > pt[1]) != (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) {
                intersectHole = !intersectHole;
              }
            }
            if (intersectHole) { inHole = true; break; }
          }
          if (!inHole) inside = true;
        }
      }
    });
    return inside;
  },

  /**
   * ==========================================
   * FUNGSI BARU: Interaksi "Point to Map"
   * ==========================================
   */
  focusToBuilding(layerId, lat, lng, popupHtml) {
    if (!this.map) return;
    
    const targetLatLng = L.latLng(lat, lng);
    
    // Zoom in dan pindah ke koordinat target dengan animasi
    this.map.flyTo(targetLatLng, 19, {
      animate: true,
      duration: 1.5
    });

    // Cari marker fisik yang sesuai untuk membuka popup-nya
    let foundMarker = null;
    if (this.buildingSnapshots[layerId]) {
      const markers = this.buildingSnapshots[layerId];
      // Karena kita butuh marker spesifik, kita cocokkan koordinatnya
      for (const marker of markers) {
        if (marker.itemLatLng.equals(targetLatLng)) {
          foundMarker = marker;
          break;
        }
      }
    }

    // Jika marker ditemukan dan sedang tertutup (karena filter), tampilkan sementara?
    // Tidak, pengguna meminta filter ter-reset saat awal dimuat. 
    // Tapi jika titik tidak terlihat karena difilter, mungkin harus ditambah sementara.
    if (foundMarker) {
      const group = foundMarker.targetGroup;
      if (!group.hasLayer(foundMarker)) {
        group.addLayer(foundMarker);
      }
      // Tunggu flyTo selesai sebelum membuka popup
      this.map.once('moveend', () => {
        foundMarker.openPopup();
      });
    } else {
      // Fallback jika layer hilang, buat popup sementara (jarang terjadi karena kita punya reference marker)
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
      this.legendControl = L.control({ position: 'bottomright' });
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
  }
}