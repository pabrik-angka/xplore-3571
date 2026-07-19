/**
 * SpatialFilterManager - Modul Filter Spasial Dinamis Berbasis Konfigurasi
 * Memenuhi: SRP (Hanya mengurus filter), DRY (Logika chaining modular), KISS (Mudah dibaca)
 */
class SpatialFilterManager {
  constructor(config, options = {}) {
    this.config = config; // Array berisi konfigurasi hierarki filter
    this.slsSnapshot = options.slsSnapshot || [];
    this.slsLayer = options.slsLayer;
    this.map = options.map;
    this.similarityLinksGroup = options.similarityLinksGroup;
    this.onFilterChangeCallback = options.onFilterChange || (() => {});

    this.init();
  }

  // Helper untuk membaca property GeoJSON tanpa peduli case-sensitive
  getPropIgnoreCase(props, keys) {
    if (!props) return '';
    for (const key of keys) {
      if (props[key] !== undefined) return props[key];
    }
    return '';
  }

  init() {
    // Pasang event listener secara dinamis berdasarkan urutan konfigurasi
    this.config.forEach((level, index) => {
      const el = document.getElementById(level.id);
      if (!el) return;

      el.addEventListener('change', () => {
        // 1. Reset semua dropdown di bawah tingkat yang sedang diubah
        this.resetChildDropdowns(index);
        
        // 2. Isi ulang opsi untuk dropdown tepat 1 tingkat di bawahnya (jika ada)
        if (index + 1 < this.config.length) {
          this.populateDropdown(index + 1);
        }

        // 3. Jalankan filter spasial dan pembaruan peta
        this.applyFilterAndZoom();
      });
    });
  }

  resetChildDropdowns(currentIndex) {
    for (let i = currentIndex + 1; i < this.config.length; i++) {
      const el = document.getElementById(this.config[i].id);
      if (el) {
        el.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = this.config[i].placeholder;
        el.appendChild(opt0);
      }
    }
  }

  populateDropdown(targetIndex) {
    const targetLevel = this.config[targetIndex];
    const targetEl = document.getElementById(targetLevel.id);
    if (!targetEl) return;

    const valuesSet = new Set();

    this.slsSnapshot.forEach(layer => {
      const props = layer.feature?.properties || {};
      
      // Validasi: Apakah baris ini cocok dengan semua filter di tingkat atasnya?
      let isMatch = true;
      for (let i = 0; i < targetIndex; i++) {
        const parentValue = document.getElementById(this.config[i].id)?.value || '';
        if (parentValue) {
          const layerPropValue = this.getPropIgnoreCase(props, this.config[i].props);
          if (String(layerPropValue) !== String(parentValue)) {
            isMatch = false;
            break;
          }
        }
      }

      if (isMatch) {
        const val = this.getPropIgnoreCase(props, targetLevel.props);
        if (val) valuesSet.add(val);
      }
    });

    // Isi opsi ke elemen HTML
    this.resetChildDropdowns(targetIndex - 1); // bersihkan dulu sebelum diisi
    Array.from(valuesSet)
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)))
      .forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        targetEl.appendChild(o);
      });
  }

  applyFilterAndZoom() {
    const visibleLayers = [];

    // Ambil semua nilai filter aktif saat ini
    const currentFilters = this.config.map(level => ({
      props: level.props,
      value: document.getElementById(level.id)?.value || ''
    }));

    // Filter poligon pada peta
    this.slsSnapshot.forEach(layer => {
      const props = layer.feature?.properties || {};
      
      const isMatch = currentFilters.every(f => {
        if (!f.value) return true; // Jika filter kosong, dianggap cocok
        const layerVal = this.getPropIgnoreCase(props, f.props);
        return String(layerVal) === String(f.value);
      });

      if (isMatch) {
        if (!this.slsLayer.hasLayer(layer)) this.slsLayer.addLayer(layer);
        visibleLayers.push(layer);
      } else {
        if (this.slsLayer.hasLayer(layer)) this.slsLayer.removeLayer(layer);
      }
    });

    // Fit Bounds Peta
    if (visibleLayers.length > 0 && this.map) {
      const group = L.featureGroup(visibleLayers);
      try { this.map.fitBounds(group.getBounds(), { padding: [20, 20] }); } catch (e) {}
    }
    if (this.slsLayer) this.slsLayer.bringToBack();

    // Bersihkan garis koneksi similarity
    if (this.similarityLinksGroup) {
      this.similarityLinksGroup.clearLayers();
    }

    // Picu callback eksternal (misal: refresh DataTable)
    this.onFilterChangeCallback();
  }

  // Method pembantu jika data snapshot baru saja dimuat/diperbarui dari async worker
  updateSnapshot(newSnapshot) {
    this.slsSnapshot = newSnapshot;
    // Otomatis isi dropdown tingkat pertama (index 0)
    if (this.config.length > 0) {
      this.populateDropdown(0);
    }
  }
}

// Ekspor modul agar bisa dipakai di file utama
export default SpatialFilterManager;