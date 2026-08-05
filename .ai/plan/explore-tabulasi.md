# Plan: Fitur Explorasi Data Tabulasi

**Versi:** 1.0  
**Tanggal:** 2026-08-01  
**Status:** Siap Implementasi

---

## Ringkasan Fitur

Menambah menu **"Explorasi Data"** di sidebar untuk eksplorasi data secara tabulasi menggunakan **Luckysheet** (vanilla JS, CDN, MIT license). User bisa upload CSV/GeoJSON, lihat data di spreadsheet interaktif, dan opsional tampilkan titik di peta secara bersamaan (split panel).

---

## Keputusan Arsitektur

| Aspek | Keputusan | Alasan |
|---|---|---|
| Library | Luckysheet (CDN) | Vanilla JS, MIT, no row limit |
| CDN load | **Lazy** — hanya saat pertama kali buka explorer | Jaga performa cold start PWA |
| Toolbar | Minimal (`showtoolbar/infobar/statBar: false`) | Hemat ruang, berlaku di semua ukuran layar |
| Sheet tab | `showsheetbar: true` | Navigasi antar multi-dataset |
| Multiple dataset | Ya — tiap dataset = 1 sheet Luckysheet | Tidak perlu reload data yang sudah ada |
| Data persistence | **CSS show/hide** — bukan destroy/recreate | Data di memori tetap ada saat switch view |
| Parsing 200k rows | `Papa.parse(file, { worker: true })` | Main thread tidak freeze |
| Pre-agregasi | Di `handler.toTableRows()` | Feed ~1700 baris ke Luckysheet (bukan 200k) |
| Linked view | Klik row tabel → fly-to marker di peta | Hanya aktif jika data punya koordinat |
| Desktop layout | Split panel + draggable divider | Fleksibel, user bisa atur proporsi |
| Mobile layout | Full-screen toggle (map OR table) | Split panel terlalu sempit di mobile |

---

## Diagram Alur Data

```
User klik "Buka Data Explorer"
         ↓
[explore-modal.js] → Modal muncul
  - Pilih schema (dari sourceRegistry)
  - Upload file CSV/GeoJSON
  - Toggle: "Tampilkan juga di peta?" (jika ada lat/lng)
         ↓
[explore.js] → _handleFile()
         ↓
Papa.parse(file, { worker: true })   ← non-blocking, 200k rows OK
         ↓
handler.toTableRows(rawData)         ← agregasi → ~1700 baris
handler.toLayerConfig() per row      ← hanya jika toggle spasial ON
         ↓
Store.activeExploreData.push(exploreSet)
  exploreSet = { id, sheetName, tableRows, points[], enableSpatial, ... }
         ↓
TableEngine.addSheet(exploreSet)     ← sheet baru di Luckysheet
MapEngine.renderExploreLayer()       ← jika enableSpatial = true
TableEngine.showPanel()              ← tampilkan panel kanan
```

---

## Layout HTML

```
[sidebar 320px] | [map-container flex-1] | [split-divider 6px] | [table-panel 55%]
                                           ← draggable →
```

- `#table-panel` dan `#split-divider`: `class="hidden"` by default
- Saat TableEngine.showPanel() → hapus class `hidden`
- Saat tutup panel → tambah class `hidden` + `MapEngine.resize()`

---

## Checklist Implementasi (Urutan Wajib)

### STEP 1 — `index.html`

Ubah `<main>` menjadi split-panel. Tambah `#split-divider` dan `#table-panel`.

```html
<main class="flex-1 flex h-full overflow-hidden relative z-10">

  <!-- Panel Kiri: Peta -->
  <div id="map-container" class="flex-1 h-full min-w-[200px]"></div>

  <!-- Draggable Divider -->
  <div id="split-divider"
       class="hidden w-1.5 h-full cursor-col-resize bg-base-300
              hover:bg-primary active:bg-primary transition-colors flex-none z-20">
  </div>

  <!-- Panel Kanan: Luckysheet -->
  <div id="table-panel"
       class="hidden flex-col h-full bg-base-100 border-l border-base-300 overflow-hidden"
       style="width:55%; min-width:400px;">

    <!-- Header Panel -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-base-300 bg-base-50 flex-none gap-2">
      <span class="text-xs font-bold text-secondary truncate">📊 Explorasi Tabulasi</span>
      <button id="btn-show-map-mobile" class="btn btn-xs btn-ghost lg:hidden">🗺 Lihat Peta</button>
      <button id="btn-close-table-panel" class="btn btn-xs btn-ghost btn-circle flex-none">✕</button>
    </div>

    <!-- Mount point Luckysheet -->
    <div id="table-container" class="flex-1 w-full overflow-hidden"></div>

  </div>
</main>
```

> ⚠️ **JANGAN** tambah CDN Luckysheet di `<head>` — lazy load via JS.

---

### STEP 2 — `components/sidebar.html`

Tambah section baru di **paling bawah** (setelah Filter Spasial):

```html
<!-- Divider Analitik -->
<div class="divider my-0 text-xs text-base-content/30 uppercase tracking-wider">Analitik</div>

<!-- Section: Explorasi Data -->
<section class="flex flex-col gap-2 w-full">
  <span class="text-xs font-bold uppercase tracking-wider text-base-content/50">
    Explorasi Data
  </span>
  <button id="btn-trigger-explore-modal" class="btn btn-sm btn-accent w-full gap-2">
    📊 Buka Data Explorer
  </button>
  <div id="explore-status" class="text-xs text-base-content/40 italic">
    Belum ada data yang dieksplorasi.
  </div>
</section>
```

---

### STEP 3 — `map-modules/*.js` (3 file handler)

Tambah method `toTableRows(rawData, fileType)` di tiap handler. Method ini **mengagregasi** data mentah menjadi baris ringkasan untuk Luckysheet.

#### 3a. `fasih-se2026.js`

Refactor logika klasifikasi ke method private `_resolveKeterangan(p)` terlebih dahulu (dipakai oleh `toLayerConfig`, `getMarkerOptions`, dan `toTableRows`):

```js
// Tambah method private (DRY — hindari duplikasi logika)
_resolveKeterangan(p) {
  const isDitemukan = String(p['is_ditemukan']).toUpperCase() === 'TRUE';
  const isPrelistUsaha = String(p['is_prelist_usaha']).toUpperCase() === 'TRUE';
  const isPrelist = String(p['is_prelist']).toUpperCase() === 'TRUE';
  const jumlahUsaha = parseInt(p['Jumlah.Usaha'], 10) || 0;

  if (isDitemukan && isPrelistUsaha) {
    return jumlahUsaha > 0 ? 'Prelist Usaha - Berusaha' : 'Prelist Usaha - 0 Usaha';
  }
  if (isDitemukan && !isPrelist) {
    return jumlahUsaha > 0 ? 'Assign Baru - Berusaha' : 'Assign Baru - 0 Usaha';
  }
  if (isDitemukan && !isPrelistUsaha) {
    return jumlahUsaha > 0 ? 'Prelist Keluarga - Berusaha' : 'Prelist Keluarga - 0 Usaha';
  }
  return 'Lainnya';
},

// Tambah method toTableRows
toTableRows(rawData, fileType = 'csv') {
  const agg = {};
  rawData.forEach(item => {
    const p = fileType === 'geojson' ? (item.properties || {}) : item;
    const kec  = p['Kecamatan'] || p['kecamatan'] || '-';
    const desa = p['Desa'] || p['desa'] || '-';
    const sls  = p['SLS'] || p['sls'] || '-';
    const ket  = this._resolveKeterangan(p);
    const key  = `${kec}||${desa}||${sls}||${ket}`;

    if (!agg[key]) {
      agg[key] = { Kecamatan: kec, Desa: desa, SLS: sls, Keterangan: ket, Jumlah: 0 };
    }
    agg[key].Jumlah++;
  });
  return Object.values(agg);
},
```

#### 3b. `sentra-ekonomi.js` dan `usaha-suplemen.js`

Kedua handler ini strukturnya sama. Tambah `toTableRows` yang mengembalikan data flat (tidak perlu agregasi berat karena data biasanya tidak 200k baris):

```js
toTableRows(rawData, fileType = 'csv') {
  return rawData.map(item => {
    const p = fileType === 'geojson' ? (item.properties || {}) : item;
    // Gunakan getProp helper yang sudah ada di toLayerConfig
    const getProp = (keys) => {
      for (const key of keys) {
        for (const k in p) {
          if (k.toLowerCase() === key.toLowerCase()) return p[k];
        }
      }
      return '-';
    };
    return {
      ID: getProp(['id', 'ids']),
      Nama: getProp(['nama_usaha', 'nama']),
      Deskripsi: getProp(['deskripsi', 'desc']),
      Sektor: getProp(['sektor']),
      Latitude: getProp(['latitude', 'lat', 'y']),
      Longitude: getProp(['longitude', 'lng', 'lon', 'x']),
    };
  });
},
```

---

### STEP 4 — `js/store.js`

Tambah state dan method baru di objek `Store`:

```js
// Tambah di awal objek Store (sejajar activePolygonData, dll.)
activeExploreData: [],

// Tambah method baru di akhir objek Store
processExploreFile(file, targetSource, enableSpatial = false) {
  return new Promise((resolve, reject) => {
    const handler = targetSource.handler;
    const isCsv    = file.name.toLowerCase().endsWith('.csv');
    const isGeoJson = /\.(geojson|json)$/i.test(file.name.toLowerCase());

    if (!isCsv && !isGeoJson) {
      return reject('Format tidak didukung. Gunakan CSV atau GeoJSON.');
    }
    const fileType = isCsv ? 'csv' : 'geojson';

    if (isCsv) {
      // Papa.parse dengan worker = true agar main thread tidak freeze
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        worker: true,
        complete: (result) => {
          try {
            resolve(this._buildExploreSet(result.data, fileType, file, targetSource, handler, enableSpatial));
          } catch (err) {
            reject('Gagal memproses data: ' + err.message);
          }
        },
        error: (err) => reject('Gagal parsing CSV: ' + err.message),
      });
    } else {
      const reader = new FileReader();
      reader.onerror = () => reject('Gagal membaca file GeoJSON.');
      reader.onload = (e) => {
        try {
          const geojson = JSON.parse(e.target.result);
          const parsedData = geojson.features || [];
          resolve(this._buildExploreSet(parsedData, fileType, file, targetSource, handler, enableSpatial));
        } catch (err) {
          reject('Format GeoJSON tidak valid: ' + err.message);
        }
      };
      reader.readAsText(file);
    }
  });
},

// Helper internal (tidak perlu di-export)
_buildExploreSet(parsedData, fileType, file, targetSource, handler, enableSpatial) {
  // 1. Pre-agregasi → ~1700 baris untuk Luckysheet
  const tableRows = handler.toTableRows(parsedData, fileType);

  if (tableRows.length === 0) {
    throw new Error('Tidak ada data yang berhasil diekstrak.');
  }

  // 2. Koordinat untuk linked view (opsional)
  const points = [];
  if (enableSpatial) {
    parsedData.forEach(item => {
      const config = handler.toLayerConfig(item, fileType);
      const style  = handler.getMarkerOptions(item, fileType);
      if (config && !isNaN(config.geometry?.lat) && !isNaN(config.geometry?.lng)) {
        points.push({ config, style });
      }
    });
  }

  const exploreSet = {
    id:            'exp_' + Date.now(),
    sheetName:     `${targetSource.name}`,
    tableRows,
    points,
    enableSpatial,
    sourceName:    targetSource.name,
    filename:      file.name,
  };

  this.activeExploreData.push(exploreSet);
  return exploreSet;
},
```

---

### STEP 5 — `js/table.js` [FILE BARU]

Buat file baru `js/table.js`:

```js
// js/table.js
/**
 * Xplore 3571 - Table Engine (Luckysheet)
 * Bertanggung jawab: lazy load CDN, init Luckysheet, multi-sheet, linked view, show/hide panel.
 */

const LUCKY_CDN = {
  css: [
    'https://cdn.jsdelivr.net/npm/luckysheet/dist/plugins/css/pluginsCss.css',
    'https://cdn.jsdelivr.net/npm/luckysheet/dist/plugins/plugins.css',
    'https://cdn.jsdelivr.net/npm/luckysheet/dist/css/luckysheet.css',
    'https://cdn.jsdelivr.net/npm/luckysheet/dist/assets/iconfont/iconfont.css',
  ],
  js: [
    'https://cdn.jsdelivr.net/npm/luckysheet/dist/plugins/js/plugin.js',
    'https://cdn.jsdelivr.net/npm/luckysheet/dist/luckysheet.umd.js',
  ],
};

export const TableEngine = {
  _initialized: false,
  _luckyLoaded: false,

  // ─── PUBLIC ────────────────────────────────────────────────────

  async init() {
    if (this._initialized) return;
    await this._loadLucky();
    luckysheet.create({
      container:       'table-container',
      lang:            'id',
      showtoolbar:     false,
      showinfobar:     false,
      showstatisticBar:false,
      showsheetbar:    true,   // tab navigasi antar dataset
      enableAddRow:    false,
      allowEdit:       false,
      data:            [this._emptySheet('—')],
    });
    this._initialized = true;
    this._setupLinkedView();
    console.log('✔ TableEngine (Luckysheet) initialized.');
  },

  /** Tambah sheet baru dari exploreSet */
  addSheet(exploreSet) {
    if (!this._initialized) {
      console.warn('TableEngine.addSheet: belum init.');
      return;
    }
    const sheetData = this._rowsToLuckyData(exploreSet.tableRows);
    luckysheet.setSheetAdd({
      sheetObject: {
        name:  exploreSet.sheetName,
        color: '#6366f1',
        data:  sheetData,
        index: exploreSet.id,
      },
      order: luckysheet.getAllSheets().length,
    });
    // Aktifkan sheet yang baru ditambahkan
    luckysheet.setSheetActive(luckysheet.getAllSheets().length - 1);
    this._updateExploreStatus(exploreSet);
  },

  showPanel() {
    const panel   = document.getElementById('table-panel');
    const divider = document.getElementById('split-divider');
    if (panel)   panel.classList.remove('hidden');
    if (divider) divider.classList.remove('hidden');
    this._resizeMap();
    // Luckysheet perlu resize setelah panel visible
    setTimeout(() => { try { luckysheet.resize(); } catch(e) {} }, 50);
  },

  hidePanel() {
    const panel   = document.getElementById('table-panel');
    const divider = document.getElementById('split-divider');
    if (panel)   panel.classList.add('hidden');
    if (divider) divider.classList.add('hidden');
    this._resizeMap();
  },

  // ─── PRIVATE ───────────────────────────────────────────────────

  async _loadLucky() {
    if (this._luckyLoaded) return;
    // Load CSS paralel
    await Promise.all(LUCKY_CDN.css.map(href => this._loadCSS(href)));
    // Load JS berurutan (plugin harus sebelum luckysheet.umd)
    for (const src of LUCKY_CDN.js) {
      await this._loadScript(src);
    }
    this._luckyLoaded = true;
    console.log('✔ Luckysheet CDN berhasil dimuat.');
  },

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  },

  _loadCSS(href) {
    return new Promise((resolve) => {
      if (document.querySelector(`link[href="${href}"]`)) { resolve(); return; }
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href; l.onload = resolve;
      document.head.appendChild(l);
    });
  },

  /** Konversi array of flat objects → format data Luckysheet (array of rows) */
  _rowsToLuckyData(rows) {
    if (!rows || rows.length === 0) return [];
    const headers = Object.keys(rows[0]);
    const headerRow = headers.map(h => ({ v: h, m: h, ct: { fa: 'General', t: 'g' }, bl: 1 }));
    const dataRows  = rows.map(row =>
      headers.map(h => ({ v: row[h] ?? '', m: String(row[h] ?? ''), ct: { fa: 'General', t: 'g' } }))
    );
    return [headerRow, ...dataRows];
  },

  _emptySheet(name = 'Kosong') {
    return { name, color: '#9ca3af', data: [], index: 'sheet_empty' };
  },

  /** Linked view: klik sel di Luckysheet → fly-to marker di peta */
  _setupLinkedView() {
    // Luckysheet tidak punya event click row langsung.
    // Gunakan hook rangeSelect untuk detect baris aktif.
    luckysheet.setHookFunction('rangeSelect', (sheet, range) => {
      try {
        const rowIdx = range[0].row[0];
        if (rowIdx === 0) return; // header row

        const allSheets   = luckysheet.getAllSheets();
        const activeSheet = allSheets.find(s => s.index === luckysheet.getSheetIndex(luckysheet.getActiveSheet()));
        if (!activeSheet) return;

        // Ambil nilai lat/lng dari baris yang dipilih
        const headers = activeSheet.data[0]?.map(c => (c?.v || '').toString().toLowerCase()) || [];
        const latIdx  = headers.findIndex(h => ['lat', 'latitude'].includes(h));
        const lngIdx  = headers.findIndex(h => ['lng', 'lon', 'long', 'longitude'].includes(h));
        if (latIdx < 0 || lngIdx < 0) return;

        const row = activeSheet.data[rowIdx];
        const lat = parseFloat(row?.[latIdx]?.v);
        const lng = parseFloat(row?.[lngIdx]?.v);
        if (!isNaN(lat) && !isNaN(lng)) {
          // Emit custom event → didengar oleh MapEngine
          window.dispatchEvent(new CustomEvent('explore:flyto', { detail: { lat, lng } }));
        }
      } catch (e) { /* silent fail */ }
    });
  },

  _updateExploreStatus(exploreSet) {
    const el = document.getElementById('explore-status');
    const count = exploreSet.tableRows.length;
    if (el) el.textContent = `${exploreSet.sourceName}: ${count.toLocaleString('id')} baris agregasi.`;
  },

  _resizeMap() {
    setTimeout(() => {
      import('./map.js').then(({ MapEngine }) => MapEngine.resize()).catch(() => {});
    }, 200);
  },
};
```

---

### STEP 6 — `js/components/explore-modal.js` [FILE BARU]

Buat file baru `js/components/explore-modal.js`:

```js
// js/components/explore-modal.js
import { getAllBuildingSources } from '../sourceRegistry.js';

/**
 * Modal upload untuk Explorasi Data.
 * @param {Object} config
 * @param {Function} config.onProcess  Callback(file, schemaId, enableSpatial)
 * @param {Function} config.onError    Callback(message, type)
 */
export function openExploreModal({ onProcess, onError }) {
  const modalContainer = document.getElementById('modal-container');
  if (!modalContainer) return;

  const sourceOptions = getAllBuildingSources()
    .map(src => `<option value="${src.id}">${src.name}</option>`)
    .join('');

  modalContainer.innerHTML = `
    <dialog id="explore-dialog" class="modal modal-open">
      <div class="modal-box max-w-sm rounded-xl border border-base-300 shadow-2xl">
        <h3 class="font-bold text-lg text-accent mb-4">📊 Explorasi Data</h3>

        <div class="form-control gap-4">

          <!-- 1. Pilih Schema -->
          <div>
            <label class="label"><span class="label-text font-semibold">1. Pilih Skema Sumber Data</span></label>
            <select id="exp-schema-select" class="select select-bordered select-sm w-full">
              <option value="" disabled selected>Pilih Skema...</option>
              ${sourceOptions}
            </select>
          </div>

          <!-- 2. Upload File -->
          <div>
            <label class="label"><span class="label-text font-semibold">2. Pilih File Data</span></label>
            <input type="file" id="exp-file-input" accept=".csv,.geojson,.json"
                   class="file-input file-input-bordered file-input-sm w-full" />
            <p class="text-xs text-base-content/50 mt-1">Format: CSV, GeoJSON, atau JSON</p>
          </div>

          <!-- 3. Toggle Spasial -->
          <div class="flex items-start gap-3 p-3 bg-base-200 rounded-lg">
            <input type="checkbox" id="exp-spatial-toggle"
                   class="checkbox checkbox-accent checkbox-sm mt-0.5" />
            <div>
              <label for="exp-spatial-toggle" class="text-sm font-semibold cursor-pointer">
                Tampilkan juga di peta
              </label>
              <p class="text-xs text-base-content/50">
                Aktifkan jika data memiliki kolom latitude & longitude
              </p>
            </div>
          </div>

        </div>

        <div class="modal-action mt-5 gap-2">
          <button id="exp-cancel" class="btn btn-sm btn-ghost cursor-pointer">Batal</button>
          <button id="exp-submit" class="btn btn-sm btn-accent cursor-pointer">
            Proses Data →
          </button>
        </div>
      </div>
    </dialog>
  `;

  const dialog = document.getElementById('explore-dialog');

  document.getElementById('exp-cancel').addEventListener('click', () => dialog.remove());

  document.getElementById('exp-submit').addEventListener('click', () => {
    const schemaId      = document.getElementById('exp-schema-select').value;
    const file          = document.getElementById('exp-file-input').files[0];
    const enableSpatial = document.getElementById('exp-spatial-toggle').checked;

    if (!schemaId || !file) {
      onError?.('Lengkapi skema dan file terlebih dahulu!', 'warning');
      return;
    }

    dialog.remove();
    onProcess(file, schemaId, enableSpatial);
  });
}
```

---

### STEP 7 — `js/explore.js` [FILE BARU]

Buat file baru `js/explore.js`:

```js
// js/explore.js
/**
 * Xplore 3571 - Explore Engine
 * Orchestrator: modal → store → table engine → map engine
 */
import { TableEngine }    from './table.js';
import { openExploreModal } from './components/explore-modal.js';

export const ExploreEngine = {

  init() {
    // Trigger modal
    document.getElementById('btn-trigger-explore-modal')
      ?.addEventListener('click', () => this._openModal());

    // Tutup panel tabel
    document.getElementById('btn-close-table-panel')
      ?.addEventListener('click', () => TableEngine.hidePanel());

    // Mobile: tombol kembali ke peta
    document.getElementById('btn-show-map-mobile')
      ?.addEventListener('click', () => this._toggleMobileView('map'));

    // Draggable divider
    this._initDraggableDivider();

    // Linked view listener
    window.addEventListener('explore:flyto', (e) => this._onFlyTo(e.detail));

    console.log('✔ ExploreEngine initialized.');
  },

  // ─── PRIVATE ───────────────────────────────────────────────────

  _openModal() {
    openExploreModal({
      onProcess: (file, schemaId, enableSpatial) => this._handleFile(file, schemaId, enableSpatial),
      onError:   (msg, type) => import('./ui.js').then(({ UI }) => UI.showToast(msg, type)),
    });
  },

  async _handleFile(file, schemaId, enableSpatial) {
    const { Store }     = await import('./store.js');
    const { getHandler } = await import('./sourceRegistry.js');
    const { MapEngine } = await import('./map.js');
    const { UI }        = await import('./ui.js');

    const targetSource = getHandler(schemaId);
    if (!targetSource) {
      UI.showToast('Skema tidak ditemukan di registry!', 'error');
      return;
    }

    UI.showLoading(true, `Memproses data dari "${file.name}"...`);

    try {
      const exploreSet = await Store.processExploreFile(file, targetSource, enableSpatial);

      // Init Luckysheet (lazy) dan tambah sheet baru
      await TableEngine.init();
      TableEngine.addSheet(exploreSet);
      TableEngine.showPanel();

      // Render titik di peta jika toggle aktif
      if (enableSpatial && exploreSet.points.length > 0) {
        MapEngine.renderExploreLayer(exploreSet);
        UI.showToast(
          `✔ "${exploreSet.sheetName}" — ${exploreSet.tableRows.length.toLocaleString('id')} baris | ${exploreSet.points.length.toLocaleString('id')} titik di peta`,
          'success'
        );
      } else {
        UI.showToast(
          `✔ "${exploreSet.sheetName}" — ${exploreSet.tableRows.length.toLocaleString('id')} baris`,
          'success'
        );
      }
    } catch (err) {
      (await import('./ui.js')).UI.showToast(`❌ ${err}`, 'error');
    } finally {
      (await import('./ui.js')).UI.showLoading(false);
    }
  },

  _onFlyTo({ lat, lng }) {
    import('./map.js').then(({ MapEngine }) => {
      MapEngine.highlightExplorePoint(lat, lng);
    });
  },

  _toggleMobileView(target) {
    const mapEl   = document.getElementById('map-container');
    const tableEl = document.getElementById('table-panel');
    if (!mapEl || !tableEl) return;

    if (target === 'map') {
      mapEl.classList.remove('hidden');
      tableEl.classList.add('hidden');
      import('./map.js').then(({ MapEngine }) => MapEngine.resize());
    } else {
      mapEl.classList.add('hidden');
      tableEl.classList.remove('hidden');
      setTimeout(() => { try { luckysheet.resize(); } catch(e) {} }, 50);
    }
  },

  _initDraggableDivider() {
    const divider  = document.getElementById('split-divider');
    const tablePanel = document.getElementById('table-panel');
    const container  = document.querySelector('main');
    if (!divider || !tablePanel || !container) return;

    let isDragging = false;

    divider.addEventListener('mousedown', (e) => {
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const containerRect = container.getBoundingClientRect();
      const newTableWidth = containerRect.right - e.clientX;
      const minW = 400;
      const maxW = containerRect.width * 0.75;
      tablePanel.style.width = Math.min(maxW, Math.max(minW, newTableWidth)) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Beritahu Leaflet dan Luckysheet untuk resize
      import('./map.js').then(({ MapEngine }) => MapEngine.resize());
      setTimeout(() => { try { luckysheet.resize(); } catch(e) {} }, 100);
    });
  },
};
```

---

### STEP 8 — `js/map.js`

Tambah 2 method baru di objek `MapEngine`:

```js
// Tambah di map.js — sejajar dengan method renderBuilding()

/**
 * Render layer titik data explorasi (terpisah dari layer bangunan sidebar)
 * @param {Object} exploreSet - dari Store.activeExploreData
 */
renderExploreLayer(exploreSet) {
  // Buat layer group terpisah dengan nama berbeda
  const layerName = `🔍 ${exploreSet.sheetName}`;
  // ... implementasi mirip renderBuilding() tapi gunakan layerName dari exploreSet
  // Simpan referensi layer dengan exploreSet.id sebagai key
},

/**
 * Highlight dan fly-to titik explorasi dari linked view
 * @param {number} lat
 * @param {number} lng
 */
highlightExplorePoint(lat, lng) {
  this._map.flyTo([lat, lng], 17, { animate: true, duration: 0.8 });
  // Opsional: tampilkan circle highlight sementara
  const circle = L.circle([lat, lng], { radius: 50, color: '#f59e0b', fillOpacity: 0.3 })
    .addTo(this._map);
  setTimeout(() => circle.remove(), 2000);
},
```

---

### STEP 9 — `js/ui.js`

Tambah cache elemen baru di `reCacheElements()`:

```js
// Tambah di dalam this.elements = { ... }
btnTriggerExploreModal: document.getElementById('btn-trigger-explore-modal'),
exploreStatus:          document.getElementById('explore-status'),
```

---

### STEP 10 — `js/app.js`

```js
// Tambah import di atas
import { ExploreEngine } from './explore.js';

// Tambah di dalam DOMContentLoaded, setelah UI.init():
ExploreEngine.init();
```

---

## Catatan Implementasi

### Luckysheet CDN yang Benar

Luckysheet memerlukan beberapa file CSS + 2 file JS dimuat secara **berurutan**. Jika urutan salah → error. Urutan di `TableEngine._loadLucky()` di atas sudah benar.

Cek versi terbaru di: [https://www.jsdelivr.com/package/npm/luckysheet](https://www.jsdelivr.com/package/npm/luckysheet)

### Papa.parse worker: true

Saat menggunakan `worker: true`, Papa.parse menerima `File` object langsung (bukan string dari FileReader). Ini sudah ditangani di `Store.processExploreFile()` — untuk CSV, file langsung dilempar ke Papa.parse tanpa FileReader.

### MapEngine.highlightExplorePoint

Linked view hanya berfungsi jika:
1. Data explorasi punya kolom `lat/latitude` dan `lng/longitude`
2. Toggle spasial ON saat upload (sehingga `exploreSet.points.length > 0`)

Jika tidak ada koordinat, `rangeSelect` hook di Luckysheet akan `return` diam-diam (silent fail).

---

## File Baru yang Dibuat

| File | Keterangan |
|---|---|
| `js/table.js` | TableEngine — Luckysheet wrapper |
| `js/explore.js` | ExploreEngine — orchestrator |
| `js/components/explore-modal.js` | Modal upload explorasi |

## File yang Dimodifikasi

| File | Perubahan |
|---|---|
| `index.html` | Split panel layout |
| `components/sidebar.html` | Section Explorasi Data |
| `map-modules/fasih-se2026.js` | Tambah `_resolveKeterangan()` + `toTableRows()` |
| `map-modules/sentra-ekonomi.js` | Tambah `toTableRows()` |
| `map-modules/usaha-suplemen.js` | Tambah `toTableRows()` |
| `js/store.js` | Tambah `activeExploreData` + `processExploreFile()` + `_buildExploreSet()` |
| `js/map.js` | Tambah `renderExploreLayer()` + `highlightExplorePoint()` |
| `js/ui.js` | Cache elemen baru |
| `js/app.js` | Import + init ExploreEngine |
