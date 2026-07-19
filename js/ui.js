/**
 * Xplore 3571 - UI Management Module
 */
import { getAllPolygonSources, getPolygonHandler } from './polygonRegistry.js';
import { getAllBuildingSources, getHandler } from './sourceRegistry.js';

// component modal load file
import { openSpatialModal } from './components/modal.js';

export const UI = {
  elements: {},

  /**
   * Mengumpulkan referensi elemen DOM setelah fragmen HTML diinjeksi
   */
  reCacheElements() {
    this.elements = {
      sidebarContainer: document.getElementById('sidebar-container'),
      btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
      btnCloseSidebarInner: document.getElementById('btn-close-sidebar-inner'),
      networkStatus: document.getElementById('network-status'),
      btnOsm: document.getElementById('basemap-osm'),
      btnGoogle: document.getElementById('basemap-google'),
      
      btnTriggerPolygonModal: document.getElementById('btn-trigger-polygon-modal'),
      btnTriggerBuildingModal: document.getElementById('btn-trigger-building-modal'),
      
      filterProv: document.getElementById('filter-prov'),
      filterKab: document.getElementById('filter-kab'),
      filterKec: document.getElementById('filter-kec'),
      searchBuilding: document.getElementById('search-building'),
      searchResults: document.getElementById('search-results')
    };
  },

  /**
   * Inisialisasi seluruh event listener UI
   */
  init() {
    this.setupSidebarToggle();
    this.setupBasemapToggle();
    this.setupModalTriggers();
    this.setupNetworkMonitoring();
    this.setupSearchFocus();
    console.log('✔ UI Module initialized cleanly with external Modal Component.');
  },

  /**
   * Mengatur buka-tutup sidebar secara halus
   */
  setupSidebarToggle() {
    const toggle = () => {
      const sb = this.elements.sidebarContainer;
      if (!sb) return;
      if (sb.classList.contains('w-80')) {
        sb.classList.remove('w-80', 'p-0');
        sb.classList.add('w-0', 'overflow-hidden', 'border-r-0');
      } else {
        sb.classList.remove('w-0', 'overflow-hidden', 'border-r-0');
        sb.classList.add('w-80');
      }
    };

    if (this.elements.btnToggleSidebar) this.elements.btnToggleSidebar.addEventListener('click', toggle);
    if (this.elements.btnCloseSidebarInner) this.elements.btnCloseSidebarInner.addEventListener('click', toggle);
  },

  /**
   * Mengatur perpindahan status tombol basemap aktif
   */
  setupBasemapToggle() {
    const toggleActive = (activeBtn, inactiveBtn) => {
      activeBtn.classList.add('btn-active', 'btn-primary');
      inactiveBtn.classList.remove('btn-active', 'btn-primary');
    };
    if (this.elements.btnOsm && this.elements.btnGoogle) {
      this.elements.btnOsm.addEventListener('click', () => toggleActive(this.elements.btnOsm, this.elements.btnGoogle));
      this.elements.btnGoogle.addEventListener('click', () => toggleActive(this.elements.btnGoogle, this.elements.btnOsm));
    }
  },

  /**
   * Mendaftarkan pemicu modal spasial menggunakan skema dinamis dari Registry
   */
  setupModalTriggers() {
    // 1. Trigger Modal Polygon dinamis dari Registry
    if (this.elements.btnTriggerPolygonModal) {
      this.elements.btnTriggerPolygonModal.addEventListener('click', () => {
        const polygonOptions = getAllPolygonSources().map(src => ({ value: src.id, label: src.name }));
        
        openSpatialModal({
          title: 'Muat Poligon Wilayah',
          options: polygonOptions,
          accept: '.geojson,.json',
          onProcess: (file, selectedSchema) => this.processPolygonFile(file, selectedSchema),
          onError: (msg, type) => this.showToast(msg, type)
        });
      });
    }

    // 2. Trigger Modal Bangunan dinamis dari Registry
    if (this.elements.btnTriggerBuildingModal) {
      this.elements.btnTriggerBuildingModal.addEventListener('click', () => {
        const buildingOptions = getAllBuildingSources().map(src => ({ value: src.id, label: src.name }));

        openSpatialModal({
          title: 'Muat Titik Bangunan',
          options: buildingOptions,
          accept: '.geojson,.json,.csv',
          onProcess: (file, selectedSchema) => this.processBuildingFile(file, selectedSchema),
          onError: (msg, type) => this.showToast(msg, type)
        });
      });
    }
  },

  /**
   * Pemrosesan validasi internal berkas polygon
   */
  processPolygonFile(file, schemaId) {
    this.showToast(`Membaca berkas ${file.name}...`, 'info');
    
    const targetSource = getPolygonHandler(schemaId);
    if (!targetSource) {
      this.showToast('Skema poligon tidak terdaftar di sistem!', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geojsonData = JSON.parse(e.target.result);
        
        // Menjalankan sidik jari struktur data via fungsi validate bawaan modul
        if (targetSource.handler && typeof targetSource.handler.validate === 'function') {
          const isValid = targetSource.handler.validate(geojsonData);
          if (!isValid) {
            this.showToast(`❌ Galat Struktur! Berkas tidak sesuai dengan format "${targetSource.name}".`, 'error');
            return;
          }
        }
        
        this.showToast(`✔ Berkas berhasil diverifikasi dengan skema: ${targetSource.name}!`, 'success');
        // TODO: Emisi atau panggil mapEngine.renderPolygon(geojsonData, targetSource.handler) di Fase 2
      } catch (err) {
        this.showToast('Gagal memproses berkas JSON/GeoJSON yang rusak.', 'error');
      }
    };
    reader.readAsText(file);
  },

  /**
   * Pemrosesan awal berkas data bangunan
   */
  processBuildingFile(file, schemaId) {
    this.showToast(`Membaca berkas bangunan ${file.name}...`, 'info');
    
    const targetSource = getHandler(schemaId);
    if (!targetSource) {
      this.showToast('Skema bangunan tidak terdaftar!', 'error');
      return;
    }

    this.showToast(`✔ Berkas Bangunan siap diproses dengan handler terkait!`, 'success');
    // TODO: Integrasikan dengan parser CSV/GeoJSON bangunan pada Fase berikutnya
  },

  /**
   * Memantau status jaringan/koneksi secara real-time
   */
  setupNetworkMonitoring() {
    if (!this.elements.networkStatus) return;
    const updateStatus = () => {
      const isOnline = navigator.onLine;
      this.elements.networkStatus.textContent = isOnline ? 'Online' : 'Offline (Lokal)';
      this.elements.networkStatus.className = isOnline 
        ? 'badge badge-success badge-sm ml-2 gap-1 text-xs' 
        : 'badge badge-error badge-sm ml-2 gap-1 text-xs';
    };
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  },

  /**
   * Kontrol visual kolom pencarian gedung/bangunan
   */
  setupSearchFocus() {
    const searchInput = this.elements.searchBuilding;
    const resultsMenu = this.elements.searchResults;
    if (!searchInput || !resultsMenu) return;

    searchInput.addEventListener('input', () => {
      if (searchInput.value.trim() !== '') {
        resultsMenu.innerHTML = `<li><a class="cursor-pointer">📍 Hasil simulasi pencarian terpusat</a></li>`;
        resultsMenu.classList.remove('hidden');
      } else {
        resultsMenu.classList.add('hidden');
      }
    });
  },

  /**
   * Komponen alert toast pemberitahuan universal
   */
  showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-container');
    if (existingToast) existingToast.remove();

    const alertClasses = {
      info: 'alert-info',
      success: 'alert-success',
      warning: 'alert-warning',
      error: 'alert-error'
    };

    const toastDiv = document.createElement('div');
    toastDiv.className = 'toast toast-end toast-bottom z-[9999] toast-container';
    toastDiv.innerHTML = `
      <div class="alert ${alertClasses[type]} shadow-lg text-sm font-medium">
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(toastDiv);
    setTimeout(() => toastDiv.remove(), 4000);
  }
};