/**
 * Xplore 3571 - UI Management Module
 */
import { getAllPolygonSources, getPolygonHandler } from './polygonRegistry.js';
import { getAllBuildingSources, getHandler } from './sourceRegistry.js';
import { SearchComponent } from './components/search.js';

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
    
    // Inisialisasi komponen pencarian
    SearchComponent.init();
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

      // PERBAIKAN BUG BLANK MAP: Beritahu Leaflet bahwa kontainer berubah ukuran
      import('./map.js').then(({ MapEngine }) => {
        // Berikan sedikit delay 150-300ms jika sidebar Anda menggunakan animasi transisi Tailwind
        setTimeout(() => {
          MapEngine.resize();
        }, 200);
      });
    };

    if (this.elements.btnToggleSidebar) this.elements.btnToggleSidebar.addEventListener('click', toggle);
    if (this.elements.btnCloseSidebarInner) this.elements.btnCloseSidebarInner.addEventListener('click', toggle);
  },

  /**
   * Mengatur perpindahan status tombol basemap aktif
   */
  setupBasemapToggle() {
    const toggleActive = (activeBtn, inactiveBtn, basemapType) => {
      activeBtn.classList.add('btn-active', 'btn-primary');
      inactiveBtn.classList.remove('btn-active', 'btn-primary');
      
      import('./map.js').then(({ MapEngine }) => {
        MapEngine.switchBasemap(basemapType);
      });
    };

    if (this.elements.btnOsm && this.elements.btnGoogle) {
      this.elements.btnOsm.addEventListener('click', () => toggleActive(this.elements.btnOsm, this.elements.btnGoogle, 'osm'));
      this.elements.btnGoogle.addEventListener('click', () => toggleActive(this.elements.btnGoogle, this.elements.btnOsm, 'google'));
    }
  },

  /**
   * Mendaftarkan pemicu modal spasial menggunakan skema dinamis dari Registry
   */
  setupModalTriggers() {
    // 1. Trigger Modal Polygon dinamis dari Registry
    if (this.elements.btnTriggerPolygonModal) {
      this.elements.btnTriggerPolygonModal.addEventListener('click', () => {
        openSpatialModal({
          title: 'Load Polygon Wilayah',
          dataType: 'polygon', 
          accept: '.geojson, .json',
          // PERBAIKAN BUG: Menggunakan arrow function agar konteks "this" merujuk ke objek UI, bukan objek Modal
          onProcess: (file, schemaId) => {
            this.processPolygonFile(file, schemaId);
          },
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
          // PERBAIKAN BUG: Disamakan menggunakan arrow function yang aman
          onProcess: (file, selectedSchema) => {
            this.processBuildingFile(file, selectedSchema);
          },
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
    
    // Panggil engine store untuk memvalidasi isi internal berkas
    import('./store.js').then(({ Store }) => {
      Store.processPolygonFile(file, schemaId)
        .then(({ handler, filterMetadata }) => {
          this.showToast(`✔ Berkas berhasil diverifikasi! Memulai rendering peta...`, 'success');
          
          // 1. Render data ke peta via MapEngine
          import('./map.js').then(({ MapEngine }) => {
            MapEngine.renderPolygon(Store.activePolygonData, handler);
            
            // 2. Render UI filter dinamis ke sidebar container
            const filterContainer = document.getElementById('dynamic-filter-container');
            if (filterContainer) {
              handler.renderFilterUI(filterContainer, filterMetadata, (criteria) => {
                // Aksi balik saat user memilih opsi filter di sidebar
                MapEngine.applyPolygonFilter(criteria);
              });
            }
          });
        })
        .catch((errMessage) => {
          this.showToast(`❌ Galat Validasi: ${errMessage}`, 'error');
        });
    });
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

    import('./store.js').then(({ Store }) => {
      Store.processBuildingFile(file, targetSource)
        .then((buildingLayerSet) => {
          this.showToast(`✔ Berkas Bangunan berhasil dirender!`, 'success');
          
          import('./map.js').then(({ MapEngine }) => {
            // 1. Reset filter UI di dropdown (jika ada) agar semua kembali utuh
            const selKec = document.getElementById('filter-sel-kec');
            const selDesa = document.getElementById('filter-sel-desa');
            const selSls = document.getElementById('filter-sel-sls');
            if (selKec) selKec.value = '';
            if (selDesa) { selDesa.innerHTML = '<option value="">-- DESA --</option>'; selDesa.disabled = true; }
            if (selSls) { selSls.innerHTML = '<option value="">-- SLS --</option>'; selSls.disabled = true; }

            // 2. Terapkan filter kosong (reset) ke peta agar seluruh polygon muncul utuh
            MapEngine.applyPolygonFilter({ kec: '', desa: '', sls: '' });

            // 3. Render file bangunan ke peta (MapEngine akan memasukkan titik & memanggil applySpatialFilter)
            MapEngine.renderBuilding(buildingLayerSet);
            
            // 4. Panggil ulang applySpatialFilter memastikan state mengikuti polygon utuh
            MapEngine.applySpatialFilter();
          });
        })
        .catch(err => {
          this.showToast(`❌ Galat Bangunan: ${err}`, 'error');
        });
    });
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
   * (Fungsi setupSearchFocus dihapus karena sudah dimigrasikan ke js/components/search.js)
   */

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