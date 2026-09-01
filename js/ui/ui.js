// js/ui/ui.js
/**
 * Xplore 3571 - General UI Controller & Event Orchestrator
 * Dipindahkan dari js/ui.js ke js/ui/ui.js sesuai arsitektur DDS-Lite.
 */
import { getAllPolygonSources, getHandler, getAllBuildingSources } from '../core/moduleRegistry.js';
import { SearchComponent } from './components/search.js';
import { openSpatialModal } from './modal.ui.js';
import { ToastComponent } from './components/toast.js';
import { resetSpatialFilterDropdowns } from './components/reset-spatial-filter.js';
import { EventBus } from '../core/event-bus.js';

export const UI = {
  elements: {},

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

  init() {
    this.setupSidebarToggle();
    this.setupBasemapToggle();
    this.setupModalTriggers();
    this.setupNetworkMonitoring();
    this.setupActiveModulesListener();

    SearchComponent.init();
    console.log('✔ UI Orchestrator initialized cleanly.');
  },

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

      import('../domains/map/map.module.js').then(({ MapEngine }) => {
        setTimeout(() => {
          MapEngine.resize();
        }, 200);
      });
    };

    if (this.elements.btnToggleSidebar) this.elements.btnToggleSidebar.addEventListener('click', toggle);
    if (this.elements.btnCloseSidebarInner) this.elements.btnCloseSidebarInner.addEventListener('click', toggle);
  },

  setupBasemapToggle() {
    const toggleActive = (activeBtn, inactiveBtn, basemapType) => {
      activeBtn.classList.add('btn-active', 'btn-primary');
      inactiveBtn.classList.remove('btn-active', 'btn-primary');

      import('../domains/map/map.module.js').then(({ MapEngine }) => {
        MapEngine.switchBasemap(basemapType);
      });
    };

    if (this.elements.btnOsm && this.elements.btnGoogle) {
      this.elements.btnOsm.addEventListener('click', () => toggleActive(this.elements.btnOsm, this.elements.btnGoogle, 'osm'));
      this.elements.btnGoogle.addEventListener('click', () => toggleActive(this.elements.btnGoogle, this.elements.btnOsm, 'google'));
    }
  },

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

  setupActiveModulesListener() {
    EventBus.on('app:modules-changed', ({ modules }) => {
      this._renderActiveModulesList(modules);
    });
  },

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

  processPolygonFile(file, schemaId) {
    this.showLoading(true, `Membaca berkas ${file.name}...`);

    import('../core/store.js').then(({ Store }) => {
      Store.processPolygonFile(file, schemaId)
        .then(({ handler, filterMetadata }) => {
          this.showToast(`✔ Berkas berhasil diverifikasi! Memulai rendering peta...`, 'success');

          const filterContainer = document.getElementById('dynamic-filter-container');
          if (filterContainer) {
            import('../domains/map/map.module.js').then(({ MapEngine }) => {
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

  processBuildingFile(file, schemaId) {
    const targetSource = getHandler(schemaId);
    if (!targetSource) {
      this.showToast('Skema bangunan tidak terdaftar!', 'error');
      return;
    }

    import('../core/store.js').then(({ Store }) => {
      const existingDataset = Store.findExistingBuildingDataset(schemaId, file.name);

      const executeLoading = () => {
        this.showLoading(true, `Membaca berkas bangunan ${file.name}...`);

        Store.processBuildingFile(file, targetSource)
          .then((buildingLayerSet) => {
            this.showToast(`✔ Berkas Bangunan "${buildingLayerSet.sourceName}" berhasil dimuat!`, 'success');

            import('../domains/map/map.module.js').then(({ MapEngine }) => {
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
              import('../domains/map/map.module.js').then(({ MapEngine }) => {
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

  showToast(message, type = 'info') {
    ToastComponent.showToast(message, type);
  },

  showLoading(show = true, text = 'Memproses data...', percent = null) {
    ToastComponent.showLoading(show, text, percent);
  }
};
