// js/core/store.js
/**
 * Xplore 3571 - Data State Orchestrator
 * Dipindahkan dari js/store.js ke js/core/store.js sesuai arsitektur DDS-Lite.
 *
 * Mengendalikan State Aplikasi: Active Polygon, Active Buildings, Tabulation Sets,
 * dan komunikasi reaktif menggunakan Centralized EventBus (bukan document.dispatchEvent).
 */
import { getPolygonHandler } from './moduleRegistry.js';
import { DbService } from './services/db.service.js';
import { FilterIndex } from '../domains/map/filter-index.js';
import { EventBus } from './event-bus.js';

export const Store = {
  activePolygonData: null,
  activeHandler: null,
  filterMetadata: [],
  activeBuildingData: [], // Menyimpan array objek layer bangunan yang sedang aktif

  // ==========================================
  // STATE TABULASI: Multi-dataset & Pivot Tabs
  // ==========================================
  tabulationSets: new Map(),
  activeTabId: null,

  // ==========================================
  // STATE BARU: Tempat menyimpan cache index filter
  // ==========================================
  filterIndexTree: {},

  /**
   * Membaca dan memvalidasi berkas spasial lokal
   */
  processPolygonFile(file, schemaId) {
    return new Promise((resolve, reject) => {
      const handler = getPolygonHandler(schemaId);
      if (!handler) {
        return reject('Skema poligon tidak dikenali oleh sistem.');
      }

      const reader = new FileReader();
      reader.onerror = () => reject('Gagal membaca file dari disk.');
      reader.onload = (e) => {
        try {
          const geojsonData = JSON.parse(e.target.result);
          if (!geojsonData.features || geojsonData.features.length === 0) {
            return reject('Berkas GeoJSON tidak mengandung komponen fitur objek spasial.');
          }

          const sampleProps = geojsonData.features[0].properties || {};
          if (!handler.validate(sampleProps)) {
            return reject(`Struktur field tidak valid! Pastikan mengandung field mandatori: ${handler.mandatoryFields.join(', ')}`);
          }

          const processedFeatures = geojsonData.features.map((feature, index) => {
            const props = feature.properties || {};
            const extracted = handler.extract(props);
            
            feature.properties = {
              _index: index,
              filterData: extracted.filterData,
              tooltipHtml: extracted.tooltipHtml
            };

            return feature;
          });

          this.filterIndexTree = FilterIndex.buildFilterIndexTree(processedFeatures);

          this.activePolygonData = { ...geojsonData, features: processedFeatures };
          this.activeHandler = handler;
          this.filterMetadata = processedFeatures.map(f => f.properties.filterData);

          // Emit EventBus untuk update spasial / UI reaktif
          EventBus.emit('app:polygon-changed', {
            polygonData: this.activePolygonData,
            handler: this.activeHandler,
            filterMetadata: this.filterMetadata
          });

          resolve({
            handler: this.activeHandler,
            filterMetadata: this.filterMetadata,
            filterIndexTree: this.filterIndexTree 
          });
        } catch (err) {
          reject('Format JSON rusak atau tidak valid.');
        }
      };
      reader.readAsText(file);
    });
  },

  /**
   * Mengambil daftar opsi dropdown secara dinamis
   */
  getFilterOptions(pathArray = []) {
    return FilterIndex.getFilterOptions(this.filterIndexTree, pathArray);
  },

  /**
   * Mengambil indeks target fitur untuk di-render & zoom
   */
  getTargetIndices(pathArray = []) {
    return FilterIndex.getTargetIndices(this.filterIndexTree, this.activePolygonData?.features, pathArray);
  },

  /**
   * Membaca & Memproses File Data dengan Chunk Streaming Batching
   */
  processBuildingFile(file, targetSource) {
    return new Promise((resolve, reject) => {
      const handler = targetSource.handler;
      const sourceRegistryName = targetSource.name;
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const isGeoJson = file.name.toLowerCase().endsWith('.geojson') || file.name.toLowerCase().endsWith('.json');

      if (!isCsv && !isGeoJson) {
        return reject('Format file tidak didukung. Gunakan CSV atau GeoJSON.');
      }

      const cleanIdKey = (handler && handler.id) ? handler.id : (targetSource.id || file.name.replace(/[^a-zA-Z0-9]/g, '_'));
      const layerId = 'bgn_' + cleanIdKey;
      const fileType = isCsv ? 'csv' : 'geojson';

      this.removeBuildingDataset(layerId);

      const buildingLayerSet = {
        id: layerId,
        filename: file.name,
        points: [],
        handler: handler,
        sourceName: sourceRegistryName || file.name
      };

      this.activeBuildingData.push(buildingLayerSet);

      const tabContext = {
        id: layerId,
        type: 'raw',
        title: `📄 ${sourceRegistryName || file.name}`,
        fileName: file.name,
        rawData: [],
        columns: []
      };

      EventBus.emit('store:loading', { show: true, text: `Worker memulai pembacaan ${file.name}...`, percent: 0 });

      // Path Worker baru relatif terhadap root app HTML (index.html)
      const worker = new Worker('./js/core/workers/parser.worker.js');

      worker.onmessage = (e) => {
        const msg = e.data;

        if (msg.type === 'CHUNK') {
          const { rawBatch, tableRowsBatch, totalParsed, percent, isFirstBatch } = msg;

          const pointsBatch = [];
          if (rawBatch && rawBatch.length > 0) {
            rawBatch.forEach(rawItem => {
              try {
                const config = typeof handler.toLayerConfig === 'function'
                  ? handler.toLayerConfig(rawItem, fileType)
                  : null;
                if (config && !isNaN(config.geometry?.lat) && !isNaN(config.geometry?.lng)) {
                  const style = typeof handler.getMarkerOptions === 'function'
                    ? handler.getMarkerOptions(rawItem, fileType)
                    : { radius: 6, fillColor: '#37b26c', color: '#fff', weight: 1.5, opacity: 1, fillOpacity: 0.95 };
                  pointsBatch.push({ config, style });
                }
              } catch (e) {
                console.warn('[store] toLayerConfig error pada satu baris:', e);
              }
            });
          }

          buildingLayerSet.points.push(...pointsBatch);
          tabContext.rawData.push(...tableRowsBatch);

          if (isFirstBatch) {
            const schemaCols = typeof handler.getTableSchema === 'function'
              ? handler.getTableSchema()
              : (handler.tableSchema || []);

            if (schemaCols && schemaCols.length > 0) {
              tabContext.columns = schemaCols;
            } else if (tableRowsBatch.length > 0) {
              tabContext.columns = Object.keys(tableRowsBatch[0]).map((k, i) => ({ key: k, label: k.toUpperCase(), isStub: i === 0 }));
            }

            this.addTabulationSet(tabContext);
            EventBus.emit('app:buildings-changed', { buildingLayerSet });
          } else {
            const existingTab = this.tabulationSets.get(layerId);
            if (existingTab) existingTab.rawData = tabContext.rawData;

            import('../domains/map/map.module.js').then(({ MapEngine }) => {
              MapEngine.appendBuildingBatch(layerId, pointsBatch, false);
            });

            EventBus.emit('tabulation:changed', { activeTabId: this.activeTabId, action: 'update' });
          }

          EventBus.emit('store:loading', { show: true, text: `[Worker Thread] Memproses ${totalParsed.toLocaleString('id')} baris...`, percent });
        }

        if (msg.type === 'COMPLETE') {
          const { totalParsed } = msg;

          EventBus.emit('store:loading', { show: false });
          EventBus.emit('store:toast', { message: `✔ [Worker Thread] Selesai memuat ${totalParsed.toLocaleString('id')} baris data.`, type: 'success' });

          DbService.saveDataset(DbService.STORES.TABULATION, tabContext);
          DbService.saveDataset(DbService.STORES.BUILDING, {
            id: buildingLayerSet.id,
            filename: buildingLayerSet.filename,
            sourceName: buildingLayerSet.sourceName,
            points: buildingLayerSet.points
          });

          worker.terminate();
          resolve(buildingLayerSet);
        }

        if (msg.type === 'ERROR') {
          EventBus.emit('store:loading', { show: false });
          worker.terminate();
          reject(msg.message);
        }
      };

      worker.onerror = (err) => {
        EventBus.emit('store:loading', { show: false });
        worker.terminate();
        reject('Error pada Web Worker: ' + err.message);
      };

      worker.postMessage({
        action: 'PARSE_BUILDING_FILE',
        file,
        layerId,
        fileType,
        sourceName: sourceRegistryName || file.name
      });
    });
  },

  /**
   * Pencarian Titik Bangunan Lintas Layer
   */
  searchBuildings(keyword) {
    if (!keyword || keyword.trim() === '') return [];
    const kw = keyword.toLowerCase().trim();
    const results = [];

    this.activeBuildingData.forEach(layerSet => {
      const sourceName = layerSet.sourceName;

      layerSet.points.forEach((pt, index) => {
        if (pt.config.searchKeyword && pt.config.searchKeyword.includes(kw)) {
          results.push({
            layerId: layerSet.id,
            pointIndex: index,
            title: pt.config.searchTitle || 'Tanpa Nama',
            lat: pt.config.geometry.lat,
            lng: pt.config.geometry.lng,
            sourceName: sourceName,
            popupHtml: pt.config.popupHtml
          });
        }
      });
    });

    return results;
  },

  /**
   * TABULASI: Management Tab & Dataset
   */
  addTabulationSet(tabContext) {
    if (!tabContext || !tabContext.id) return;
    this.tabulationSets.set(tabContext.id, {
      type: 'raw',
      parentDatasetId: null,
      filterState: {},
      sortState: [],
      pagination: { page: 1, pageSize: 100 },
      ...tabContext
    });
    this.activeTabId = tabContext.id;

    EventBus.emit('tabulation:changed', { activeTabId: this.activeTabId, action: 'add' });
  },

  getActiveTabContext() {
    if (!this.activeTabId) return null;
    return this.tabulationSets.get(this.activeTabId) || null;
  },

  setActiveTabId(id) {
    if (this.tabulationSets.has(id)) {
      this.activeTabId = id;
      EventBus.emit('tabulation:changed', { activeTabId: this.activeTabId, action: 'switch' });
    }
  },

  findExistingBuildingDataset(schemaId, filename) {
    if (!schemaId && !filename) return null;
    const cleanIdKey = schemaId || filename.replace(/[^a-zA-Z0-9]/g, '_');
    const expectedId = 'bgn_' + cleanIdKey;

    return this.activeBuildingData.find(bSet => 
      bSet.id === expectedId ||
      (bSet.handler && bSet.handler.id === schemaId) ||
      bSet.filename === filename
    ) || null;
  },

  removeBuildingDataset(id) {
    if (!id) return;
    const idx = this.activeBuildingData.findIndex(bSet => bSet.id === id);
    if (idx >= 0) {
      this.activeBuildingData.splice(idx, 1);
    }
    this.removeTabulationSet(id);
  },

  removeTabulationSet(id) {
    if (this.tabulationSets.has(id)) {
      this.tabulationSets.delete(id);
      if (this.activeTabId === id) {
        const keys = Array.from(this.tabulationSets.keys());
        this.activeTabId = keys.length > 0 ? keys[keys.length - 1] : null;
      }
      DbService.deleteDataset(DbService.STORES.TABULATION, id);
      DbService.deleteDataset(DbService.STORES.BUILDING, id);

      EventBus.emit('tabulation:changed', { activeTabId: this.activeTabId, action: 'remove' });
    }
  },

  /**
   * Restore dataset dari IndexedDB PWA offline cache
   */
  async loadStoredDatasets() {
    try {
      const storedTabs = await DbService.getAllDatasets(DbService.STORES.TABULATION);
      const storedBuildings = await DbService.getAllDatasets(DbService.STORES.BUILDING);

      if (storedTabs && storedTabs.length > 0) {
        storedTabs.forEach(tab => {
          this.tabulationSets.set(tab.id, tab);
        });
        this.activeTabId = storedTabs[storedTabs.length - 1].id;
        EventBus.emit('tabulation:changed', { activeTabId: this.activeTabId, action: 'hydrate' });
      }

      if (storedBuildings && storedBuildings.length > 0) {
        for (const bSet of storedBuildings) {
          this.activeBuildingData.push(bSet);
          EventBus.emit('app:buildings-changed', { buildingLayerSet: bSet });
        }
      }

      if (storedTabs.length > 0 || storedBuildings.length > 0) {
        console.log(`✔ IndexedDB PWA Hydrated: ${storedTabs.length} tabulasi, ${storedBuildings.length} layer spasial.`);
      }
    } catch (e) {
      console.warn('Gagal me-restore data dari IndexedDB:', e);
    }
  }
};
