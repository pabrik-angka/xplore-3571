/**
 * Xplore 3571 - UI Management Module
 */
import { getAllPolygonSources, getPolygonHandler, getAllBuildingSources, getHandler } from './moduleRegistry.js';
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
      btnTriggerExploreModal: document.getElementById('btn-trigger-explore-modal'),
      activeModulesList: document.getElementById('active-modules-list'),
      
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
    this.setupActiveModulesListener();
    
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
    // 3. Trigger Modal Explorasi Data (btn di sidebar Collapse 2)
    if (this.elements.btnTriggerExploreModal) {
      this.elements.btnTriggerExploreModal.addEventListener('click', () => {
        // TODO: Buka modal explorasi tabulasi/data di iterasi berikutnya
        this.showToast('Fitur Muat Data Modul akan segera hadir!', 'info');
      });
    }
  },

  /**
   * Mendengarkan event 'app:modules-changed' dan merender ulang daftar modul aktif di sidebar.
   * Pattern: passive reactive listener — tidak menyimpan state sendiri.
   */
  setupActiveModulesListener() {
    document.addEventListener('app:modules-changed', (e) => {
      const { modules } = e.detail;
      this._renderActiveModulesList(modules);
    });
  },

  /**
   * Merender daftar <li> modul aktif ke dalam #active-modules-list di sidebar.
   * @param {Array} modules - Array dari ModuleManager.getActiveModules()
   */
  _renderActiveModulesList(modules) {
    const list = document.getElementById('active-modules-list');
    if (!list) return;

    if (!modules || modules.length === 0) {
      list.innerHTML = `
        <li>
          <span id="active-modules-empty" class="text-xs text-base-content/40 italic pl-2">
            Belum ada modul yang dimuat.
          </span>
        </li>
      `;
      return;
    }

    const typeIcon = { building: '📍', polygon: '🔷', unknown: '📦' };
    list.innerHTML = modules.map(m => `
      <li>
        <a class="text-xs gap-1" title="Modul: ${m.id}">
          ${typeIcon[m.type] || typeIcon.unknown} ${m.name}
        </a>
      </li>
    `).join('');
  },

  /**
   * Pemrosesan validasi internal berkas polygon
   */
  processPolygonFile(file, schemaId) {
    this.showLoading(true, `Membaca berkas ${file.name}...`);
    
    // Panggil engine store untuk memvalidasi isi internal berkas
    import('./store.js').then(({ Store }) => {
      Store.processPolygonFile(file, schemaId)
        .then(({ handler, filterMetadata }) => {
          this.showToast(`✔ Berkas berhasil diverifikasi! Memulai rendering peta...`, 'success');
          
          // Render UI filter dinamis ke sidebar container
          const filterContainer = document.getElementById('dynamic-filter-container');
          if (filterContainer) {
            import('./map.js').then(({ MapEngine }) => {
              handler.renderFilterUI(filterContainer, filterMetadata, (criteria) => {
                // Aksi balik saat user memilih opsi filter di sidebar
                MapEngine.applyPolygonFilter(criteria);
              });
            });
          }
          this.showLoading(false);
        })
        .catch((errMessage) => {
          this.showToast(`❌ Galat Validasi: ${errMessage}`, 'error');
          this.showLoading(false);
        });
    }).catch(err => {
      this.showToast(`❌ Galat Load Module: ${err.message || err}`, 'error');
      this.showLoading(false);
    });
  },

  /**
   * Pemrosesan awal berkas data bangunan
   */
  processBuildingFile(file, schemaId) {
    this.showLoading(true, `Membaca berkas bangunan ${file.name}...`);
    
    const targetSource = getHandler(schemaId);
    if (!targetSource) {
      this.showToast('Skema bangunan tidak terdaftar!', 'error');
      this.showLoading(false);
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
            
            // 3. Panggil ulang applySpatialFilter memastikan state mengikuti polygon utuh
            MapEngine.applySpatialFilter();
            this.showLoading(false);
          }).catch(err => {
            this.showToast(`❌ Galat Filter Spasial: ${err.message || err}`, 'error');
            this.showLoading(false);
          });
        })
        .catch(err => {
          this.showToast(`❌ Galat Bangunan: ${err}`, 'error');
          this.showLoading(false);
        });
    }).catch(err => {
      this.showToast(`❌ Galat Load Module: ${err.message || err}`, 'error');
      this.showLoading(false);
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
   * Komponen alert toast pemberitahuan universal (Posisi Kanan Atas / top-end)
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
    toastDiv.className = 'toast toast-end toast-top z-[9999] toast-container mt-16'; // mt-16 agar tidak terhalang navbar jika ada
    toastDiv.innerHTML = `
      <div class="alert ${alertClasses[type]} shadow-lg text-sm font-medium">
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(toastDiv);
    setTimeout(() => toastDiv.remove(), 4000);
  },

  /**
   * Toast Loading dengan indikator progress (Posisi Kanan Atas / top-end)
   */
  showLoading(show = true, text = 'Memproses data spasial...') {
    let loadingToast = document.getElementById('loading-toast');
    
    if (!show) {
      if (loadingToast) {
        loadingToast.remove();
      }
      return;
    }

    if (!loadingToast) {
      loadingToast = document.createElement('div');
      loadingToast.id = 'loading-toast';
      loadingToast.className = 'toast toast-end toast-top z-[9999] mt-16';
      loadingToast.innerHTML = `
        <div class="alert alert-info shadow-xl text-sm font-medium flex flex-col items-start gap-2 min-w-[280px]">
          <div class="flex items-center gap-2">
            <span class="loading loading-spinner loading-xs text-primary"></span>
            <span id="loading-toast-text">${text}</span>
          </div>
          <progress class="progress progress-primary w-full h-1"></progress>
        </div>
      `;
      document.body.appendChild(loadingToast);
    } else {
      const textEl = loadingToast.querySelector('#loading-toast-text');
      if (textEl) textEl.textContent = text;
    }
  }
};