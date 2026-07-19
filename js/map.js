// js/map.js
import { CONFIG } from './config.js';
import { Store } from './store.js'; // Import store baru And

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

      this.polygonLayerGroup = L.featureGroup().addTo(this.map);
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
   * Merender titik bangunan dari Store
   */
  renderBuilding(buildingLayerSet) {
    if (!this.map) return;
    
    const { id, points, handler } = buildingLayerSet;

    // Jika layer ini sudah ada, hapus dulu untuk re-render
    if (this.buildingLayerGroups[id]) {
      this.map.removeLayer(this.buildingLayerGroups[id]);
    }

    const featureGroup = L.featureGroup().addTo(this.map);
    this.buildingLayerGroups[id] = featureGroup;
    this.buildingSnapshots[id] = [];

    points.forEach(item => {
      const { config, style } = item;
      const marker = L.circleMarker([config.geometry.lat, config.geometry.lng], style);
      marker.bindPopup(config.popupHtml);
      
      // Simpan reference latlng untuk keperluan filter spasial
      marker.itemLatLng = L.latLng(config.geometry.lat, config.geometry.lng);

      featureGroup.addLayer(marker);
      this.buildingSnapshots[id].push(marker);
    });

    this.map.fitBounds(featureGroup.getBounds());
  },

  /**
   * Menjalankan filter titik yang berada di dalam polygon yang terlihat (Point-in-Polygon)
   */
  applySpatialFilter() {
    if (!this.polygonLayerGroup || this.polygonLayerGroup.getLayers().length === 0) {
      // Jika tidak ada polygon, tampilkan semua titik utuh
      for (const id in this.buildingLayerGroups) {
        const group = this.buildingLayerGroups[id];
        const snapshot = this.buildingSnapshots[id];
        snapshot.forEach(marker => {
          if (!group.hasLayer(marker)) group.addLayer(marker);
        });
      }
      return;
    }

    // Jika ada polygon, filter titik
    for (const id in this.buildingLayerGroups) {
      const group = this.buildingLayerGroups[id];
      const snapshot = this.buildingSnapshots[id];
      
      snapshot.forEach(marker => {
        const isInside = this.isPointInPolygon(marker.itemLatLng, this.polygonLayerGroup);
        if (isInside) {
          if (!group.hasLayer(marker)) group.addLayer(marker);
        } else {
          if (group.hasLayer(marker)) group.removeLayer(marker);
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
      const group = this.buildingLayerGroups[layerId];
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
  }
}