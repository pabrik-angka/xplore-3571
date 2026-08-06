/**
 * Xplore 3571 - UI Management Module
 */
import { getAllPolygonSources, getPolygonHandler, getAllBuildingSources, getHandler } from './moduleRegistry.js';
import { SearchComponent } from './components/search.js';
import { openSpatialModal } from './components/modal.js';
import { ToastComponent } from './components/toast.js';
import { resetSpatialFilterDropdowns } from './helpers/resetSpatialFilter.js';

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
   * Inisialisasi seluruh event listener UI (UI Orchestrator)
   */
  init() {
    this.setupSidebarToggle();
    this.setupBasemapToggle();
    this.setupModalTriggers();
    this.setupNetworkMonitoring();
    this.setupActiveModulesListener();
    this.setupStoreEventListeners();

    // Inisialisasi komponen pencarian
    SearchComponent.init();
    console.log('✔ UI Orchestrator initialized cleanly.');
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

      import('./map.js').then(({ MapEngine }) => {
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
    if (this.elements.btnTriggerPolygonModal) {
      this.elements.btnTriggerPolygonModal.addEventListener('click', () => {
        openSpatialModal({
          title: 'Load Polygon Wilayah',
          dataType: 'polygon',
          accept: '.geojson, .json',
          onProcess: (file, schemaId) => {
            this.processPolygonFile(file, schemaId);
          },
          onError: (msg, type) => this.showToast(msg, type)
        });
      });
    }

    if (this.elements.btnTriggerBuildingModal) {
      this.elements.btnTriggerBuildingModal.addEventListener('click', () => {
        const buildingOptions = getAllBuildingSources().map(src => ({ value: src.id, label: src.name }));

        openSpatialModal({
          title: 'Muat Titik Bangunan',
          options: buildingOptions,
          accept: '.geojson,.json,.csv',
          onProcess: (file, selectedSchema) => {
            this.processBuildingFile(file, selectedSchema);
          },
          onError: (msg, type) => this.showToast(msg, type)
        });
      });
    }

    if (this.elements.btnTriggerExploreModal) {
      this.elements.btnTriggerExploreModal.addEventListener('click', () => {
        this.showToast('Fitur Muat Data Modul akan segera hadir!', 'info');
      });
    }
  },

  /**
   * Mendengarkan event 'app:modules-changed' dan merender ulang daftar modul aktif di sidebar.
   */
  setupActiveModulesListener() {
    document.addEventListener('app:modules-changed', (e) => {
      const { modules } = e.detail;
      this._renderActiveModulesList(modules);
    });
  },

  /**
   * Merender daftar modul aktif ke dalam sidebar
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

    import('./store.js').then(({ Store }) => {
      Store.processPolygonFile(file, schemaId)
        .then(({ handler, filterMetadata }) => {
          this.showToast(`✔ Berkas berhasil diverifikasi! Memulai rendering peta...`, 'success');

          const filterContainer = document.getElementById('dynamic-filter-container');
          if (filterContainer) {
            import('./map.js').then(({ MapEngine }) => {
              handler.renderFilterUI(filterContainer, filterMetadata, (criteria) => {
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
    const targetSource = getHandler(schemaId);
    if (!targetSource) {
      this.showToast('Skema bangunan tidak terdaftar!', 'error');
      return;
    }

    import('./store.js').then(({ Store }) => {
      const existingDataset = Store.findExistingBuildingDataset(schemaId, file.name);

      const executeLoading = () => {
        this.showLoading(true, `Membaca berkas bangunan ${file.name}...`);

        Store.processBuildingFile(file, targetSource)
          .then((buildingLayerSet) => {
            this.showToast(`✔ Berkas Bangunan "${buildingLayerSet.sourceName}" berhasil dimuat!`, 'success');

            import('./map.js').then(({ MapEngine }) => {
              resetSpatialFilterDropdowns();
              MapEngine.applyPolygonFilter({ kec: '', desa: '', sls: '' });
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
      };

      if (existingDataset) {
        import('./components/confirm-modal.js').then(({ openConfirmModal }) => {
          openConfirmModal({
            title: '⚠️ Data Modul Sudah Ada',
            message: `Modul <strong>"${existingDataset.sourceName}"</strong> (${existingDataset.filename}) sudah dimuat sebelumnya.<br><br>Apakah Anda ingin <strong>memperbarui (overwrite)</strong> dengan data terbaru dari berkas <code>${file.name}</code>?`,
            confirmText: '🔄 Ya, Perbarui Data',
            cancelText: 'Batal',
            confirmClass: 'btn-warning',
            onConfirm: () => {
              import('./map.js').then(({ MapEngine }) => {
                MapEngine.removeBuilding(existingDataset.id);
                Store.removeBuildingDataset(existingDataset.id);
                executeLoading();
              });
            },
            onCancel: () => {
              this.showToast('Proses pemuatan data dibatalkan.', 'info');
            }
          });
        });
      } else {
        executeLoading();
      }
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
   * Mendengarkan event dari store.js tanpa circular import (ISS-04)
   * store:loading → tampilkan/sembunyikan loading indicator
   * store:toast   → tampilkan toast notifikasi
   */
  setupStoreEventListeners() {
    document.addEventListener('store:loading', (e) => {
      const { show, text, percent } = e.detail;
      ToastComponent.showLoading(show, text, percent);
    });

    document.addEventListener('store:toast', (e) => {
      const { message, type } = e.detail;
      ToastComponent.showToast(message, type);
    });
  },

  /**
   * Delegasikan Toast notifikasi ke ToastComponent (Komponen UI Modular)
   */
  showToast(message, type = 'info') {
    ToastComponent.showToast(message, type);
  },

  /**
   * Delegasikan Toast Loading ke ToastComponent (Komponen UI Modular)
   */
  showLoading(show = true, text = 'Memproses data...', percent = null) {
    ToastComponent.showLoading(show, text, percent);
  }
};