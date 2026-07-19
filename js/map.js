// js/map.js
import { CONFIG } from './config.js';
import { Store } from './store.js'; // Import store baru And

export const MapEngine = {
  map: null,
  polygonLayerGroup: null,
  rawGeoJsonInstance: null,
  polygonSnapshot: null, // Tambahan untuk caching array layer
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
  }
}