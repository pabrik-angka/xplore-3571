# Fitur Explorasi Data Tabulasi — Implementation Plan (Final)

## Latar Belakang

Menambah menu **"Explorasi Data"** di sidebar untuk eksplorasi data secara tabulasi (Luckysheet) dengan opsi tampil di peta juga. Data yang sudah di-load tidak boleh hilang saat user switch antar view.

---

## Keputusan Arsitektur

| Aspek | Keputusan |
|---|---|
| Library pivot | **Luckysheet** (vanilla JS, CDN, MIT) |
| CDN load | **Lazy** — hanya saat user pertama kali buka explorer |
| Toolbar | **Minimal** (`showtoolbar/infobar/sheetbar: false`) → otomatis berlaku di mobile |
| Multiple dataset | **Ya** — tiap dataset = satu sheet Luckysheet |
| Data persistence | **CSS show/hide** — bukan destroy/recreate |
| Mobile layout | **Full-screen toggle** (map OR table), bukan split |
| Desktop layout | **Split panel + draggable divider** |
| Parsing performa | **PapaParse `worker: true`** untuk 200k rows |
| Pre-agregasi | **Di `toTableRows()` per handler** — feed ~1700 baris ke Luckysheet |
| Linked views | **Aktif jika data punya koordinat** — klik row → fly-to + highlight marker |

---

## Arsitektur Data Flow

```
User upload file (200k rows)
        ↓
PapaParse worker (non-blocking)
        ↓
handler.toTableRows(rawData)  ← agregasi 200k → ~1700 baris
handler.toLayerConfig(...)    ← jika enableSpatial = true
        ↓
Store.activeExploreData.push({ id, sheetName, tableRows, points?, sourceName })
        ↓
TableEngine.addSheet(tableRows, sheetName)  →  Luckysheet sheet baru
MapEngine.renderExploreLayer(points)         →  jika enableSpatial = true
```

### View Switching (Show/Hide, Bukan Destroy)

```
Store (memory) — selalu ada, tidak pernah dihapus saat switch view
       ↓                            ↓
MapEngine (Leaflet)          TableEngine (Luckysheet)
   ↕ CSS hidden                  ↕ CSS hidden
   .resize() on show             luckysheet.resize() on show
```

### Layout Responsif

```
Desktop (≥ 1024px):
┌─sidebar─┬───── MAP ─────║─── TABLE (Luckysheet) ───┐
│  320px  │   flex-1       ║◀──drag──▶   min 400px    │
└─────────┴────────────────║──────────────────────────┘
                           ↑ draggable divider

Mobile (< 1024px):
┌──────────────────────────────────────────┐
│  MAP full  ATAU  TABLE full              │
│  [btn toggle di header explore panel]   │
└──────────────────────────────────────────┘
```

---

## Proposed Changes

### 1. index.html

#### [MODIFY] [index.html](file:///P:/My%20Drive/%60NGODING%60/Web/xplore-3571/index.html)

- **TIDAK** tambah Luckysheet CDN di `<head>` — lazy load via JS
- Ubah `<main>` menjadi split-panel container
- Tambah `#table-panel` (hidden default) dengan draggable divider

```diff
-  <main class="flex-1 w-full h-full relative z-10">
-    <div id="map-container" class="w-full h-full"></div>
-  </main>
+  <main class="flex-1 flex h-full overflow-hidden relative z-10">
+    <!-- Map Panel -->
+    <div id="map-container" class="flex-1 h-full min-w-[200px]"></div>
+
+    <!-- Draggable Divider (hidden default, muncul saat table-panel aktif) -->
+    <div id="split-divider"
+         class="hidden w-1.5 h-full cursor-col-resize bg-base-300 hover:bg-primary
+                active:bg-primary transition-colors flex-none z-20"></div>
+
+    <!-- Table Panel (hidden default) -->
+    <div id="table-panel"
+         class="hidden flex-col h-full bg-base-100 border-l border-base-300 overflow-hidden"
+         style="width: 55%; min-width: 400px;">
+      <!-- Panel Header -->
+      <div class="flex items-center justify-between px-3 py-2 border-b border-base-300
+                  bg-base-50 flex-none gap-2">
+        <span class="text-xs font-bold text-secondary truncate">📊 Explorasi Tabulasi</span>
+        <!-- Mobile: tombol switch ke peta -->
+        <button id="btn-show-map-mobile"
+                class="btn btn-xs btn-ghost lg:hidden">🗺 Lihat Peta</button>
+        <button id="btn-close-table-panel" class="btn btn-xs btn-ghost btn-circle flex-none">✕</button>
+      </div>
+      <!-- Luckysheet Mount Point -->
+      <div id="table-container" class="flex-1 w-full overflow-hidden"></div>
+    </div>
+  </main>
```

---

### 2. map-modules/*.js — Tambah `toTableRows()`

#### [MODIFY] [fasih-se2026.js](file:///P:/My%20Drive/%60NGODING%60/Web/xplore-3571/map-modules/fasih-se2026.js)
#### [MODIFY] [sentra-ekonomi.js](file:///P:/My%20Drive/%60NGODING%60/Web/xplore-3571/map-modules/sentra-ekonomi.js)
#### [MODIFY] [usaha-suplemen.js](file:///P:/My%20Drive/%60NGODING%60/Web/xplore-3571/map-modules/usaha-suplemen.js)

Tambah method `toTableRows(rawData, fileType)` di tiap handler. Method ini bertanggung jawab untuk:
1. **Agregasi** data mentah (200k → ~1700 baris) sesuai logika bisnis tiap sumber
2. Return array flat objects untuk Luckysheet

Contoh untuk `FasihSE2026`:
```js
toTableRows(rawData, fileType = 'csv') {
  const agg = {};
  rawData.forEach(item => {
    const p = fileType === 'geojson' ? item.properties : item;
    // Ekstrak field kunci
    const kec = p['Kecamatan'] || '-';
    const desa = p['Desa'] || '-';
    const sls = p['SLS'] || '-';
    // Tentukan keterangan (reuse logika getMarkerOptions)
    const keterangan = this._resolveKeterangan(p);
    const key = `${kec}||${desa}||${sls}||${keterangan}`;
    if (!agg[key]) {
      agg[key] = { Kecamatan: kec, Desa: desa, SLS: sls, Keterangan: keterangan, Jumlah: 0 };
    }
    agg[key].Jumlah++;
  });
  return Object.values(agg);
}
```

> [!NOTE]
> Logika klasifikasi yang sudah ada di `getMarkerOptions` / `toLayerConfig` di-refactor ke method private `_resolveKeterangan()` agar tidak duplikasi antara `toTableRows` dan `toLayerConfig` (DRY).

---

### 3. js/store.js

#### [MODIFY] [store.js](file:///P:/My%20Drive/%60NGODING%60/Web/xplore-3571/js/store.js)

Tambah:

```js
// State baru
activeExploreData: [], // Array multi-dataset explorasi

// Method baru
processExploreFile(file, targetSource, enableSpatial = false) {
  return new Promise((resolve, reject) => {
    const handler = targetSource.handler;
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const isGeoJson = /\.(geojson|json)$/i.test(file.name);

    if (!isCsv && !isGeoJson) return reject('Format tidak didukung. Gunakan CSV atau GeoJSON.');

    const fileType = isCsv ? 'csv' : 'geojson';
    const reader = new FileReader();
    reader.onerror = () => reject('Gagal membaca file.');
    reader.onload = (e) => {
      try {
        // Parsing (sync untuk GeoJSON, atau gunakan PapaParse worker untuk CSV)
        let parsedData = [];
        if (isCsv) {
          const result = Papa.parse(e.target.result, { header: true, skipEmptyLines: true });
          parsedData = result.data;
        } else {
          parsedData = JSON.parse(e.target.result).features || [];
        }

        // Pre-agregasi via handler
        const tableRows = handler.toTableRows(parsedData, fileType);

        // Opsional: koordinat untuk linked view
        let points = [];
        if (enableSpatial) {
          parsedData.forEach(item => {
            const config = handler.toLayerConfig(item, fileType);
            const style = handler.getMarkerOptions(item, fileType);
            if (config && !isNaN(config.geometry.lat) && !isNaN(config.geometry.lng)) {
              points.push({ config, style });
            }
          });
        }

        const exploreSet = {
          id: 'exp_' + Date.now(),
          sheetName: `${targetSource.name} (${file.name})`,
          tableRows,
          points,      // [] jika enableSpatial = false
          enableSpatial,
          handler,
          sourceName: targetSource.name,
          filename: file.name,
        };

        this.activeExploreData.push(exploreSet);
        resolve(exploreSet);
      } catch (err) {
        reject('Gagal memproses data: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}
```

> [!IMPORTANT]
> Untuk CSV 200k baris, `reader.onload` + `Papa.parse` sync tetap memblokir main thread singkat. Optimasi lanjutan bisa menggunakan `Papa.parse(file, { worker: true })` langsung dari file object — ini dipertimbangkan di iterasi berikutnya.

---

### 4. js/table.js — [NEW]

Engine Luckysheet. Tanggung jawab:
- Lazy load CDN Luckysheet (hanya sekali)
- Init Luckysheet dengan konfigurasi minimal
- Add/remove sheet
- Show/hide panel + trigger resize
- Linked view event (klik row → emit event ke MapEngine)

```js
// js/table.js
export const TableEngine = {
  _initialized: false,
  _luckyLoaded: false,
  _sheets: [], // { id, sheetName, tableRows }

  async ensureLuckyLoaded() {
    if (this._luckyLoaded) return;
    await Promise.all([
      this._loadCSS('https://cdn.jsdelivr.net/npm/luckysheet/dist/plugins/css/pluginsCss.css'),
      this._loadCSS('https://cdn.jsdelivr.net/npm/luckysheet/dist/plugins/plugins.css'),
      this._loadCSS('https://cdn.jsdelivr.net/npm/luckysheet/dist/css/luckysheet.css'),
      this._loadScript('https://cdn.jsdelivr.net/npm/luckysheet/dist/plugins/js/plugin.js'),
    ]);
    await this._loadScript('https://cdn.jsdelivr.net/npm/luckysheet/dist/luckysheet.umd.js');
    this._luckyLoaded = true;
  },

  async init() {
    await this.ensureLuckyLoaded();
    if (this._initialized) return;
    luckysheet.create({
      container: 'table-container',
      showtoolbar: false,
      showinfobar: false,
      showsheetbar: true,   // Tab sheet tetap tampil untuk navigasi multi-dataset
      showstatisticBar: false,
      enableAddRow: false,
      allowEdit: false,
      data: [this._emptySheet()],
    });
    this._initialized = true;
    this._setupLinkedViewEvents();
  },

  addSheet(exploreSet) { /* luckysheet.setSheetAdd + luckysheet.setSheetData */ },
  showPanel() { /* toggle CSS + MapEngine.resize() */ },
  hidePanel() { /* toggle CSS + MapEngine.resize() */ },
  _setupLinkedViewEvents() { /* luckysheet cellMousedown → emit custom event */ },
  _loadScript(src) { /* dynamic <script> inject, return Promise */ },
  _loadCSS(href) { /* dynamic <link> inject */ },
  _emptySheet() { /* return minimal sheet config */ },
};
```

---

### 5. js/components/explore-modal.js — [NEW]

Modal upload explorasi. Turunan pola `modal.js` tapi dengan:
- Toggle spasial: `<input type="checkbox" id="modal-spatial-toggle">`
- Info toggle: "Aktifkan jika data memiliki kolom latitude/longitude"
- `accept=".csv,.geojson,.json"`
- Options dari `getAllBuildingSources()` (shared registry — DRY)
- Callback: `onProcess(file, schemaId, enableSpatial)`

---

### 6. js/explore.js — [NEW]

Orchestrator fitur explorasi. Mengelola:
- Init listener tombol trigger modal
- Proses file via `Store.processExploreFile()`
- Kirim `tableRows` ke `TableEngine.addSheet()`
- Jika `enableSpatial`: kirim `points` ke `MapEngine.renderExploreLayer()`
- Draggable divider logic
- Mobile toggle logic (map ↔ table full-screen)

```js
// js/explore.js
export const ExploreEngine = {
  init() {
    document.getElementById('btn-trigger-explore-modal')
      ?.addEventListener('click', () => this._openModal());
    document.getElementById('btn-close-table-panel')
      ?.addEventListener('click', () => this._closeTable());
    document.getElementById('btn-show-map-mobile')
      ?.addEventListener('click', () => this._toggleMobileView('map'));
    this._initDraggableDivider();
  },

  async _handleFile(file, schemaId, enableSpatial) {
    const { Store } = await import('./store.js');
    const { getHandler } = await import('./sourceRegistry.js');
    const { TableEngine } = await import('./table.js');
    const { MapEngine } = await import('./map.js');
    const { UI } = await import('./ui.js');

    const targetSource = getHandler(schemaId);
    if (!targetSource) { UI.showToast('Skema tidak ditemukan!', 'error'); return; }

    UI.showLoading(true, 'Memproses & mengagregasi data...');
    try {
      const exploreSet = await Store.processExploreFile(file, targetSource, enableSpatial);
      await TableEngine.init();             // lazy init Luckysheet (no-op jika sudah)
      TableEngine.addSheet(exploreSet);
      TableEngine.showPanel();
      if (enableSpatial && exploreSet.points.length > 0) {
        MapEngine.renderExploreLayer(exploreSet);
      }
      UI.showToast(`✔ "${exploreSet.sheetName}" berhasil dimuat!`, 'success');
    } catch (err) {
      UI.showToast(`❌ ${err}`, 'error');
    } finally {
      UI.showLoading(false);
    }
  },

  _initDraggableDivider() { /* mousedown/move/up pada #split-divider → resize panels + MapEngine.resize() */ },
  _toggleMobileView(target) { /* show/hide #map-container dan #table-panel */ },
  _closeTable() { /* TableEngine.hidePanel() */ },
};
```

---

### 7. js/map.js

#### [MODIFY] [map.js](file:///P:/My%20Drive/%60NGODING%60/Web/xplore-3571/js/map.js)

Tambah method `renderExploreLayer(exploreSet)`:
- Render titik explorasi sebagai layer group terpisah dari `activeBuildingData`
- Layer group diberi label berbeda (misal: "🔍 Explore: [sheetName]")
- Marker bisa di-highlight via `MapEngine.highlightExplorePoint(lat, lng)`

---

### 8. components/sidebar.html

#### [MODIFY] [sidebar.html](file:///P:/My%20Drive/%60NGODING%60/Web/xplore-3571/components/sidebar.html)

Tambah section baru di bawah Filter Spasial:

```html
<!-- Divider -->
<div class="divider my-0 text-xs text-base-content/30 uppercase tracking-wider">Analitik</div>

<!-- 5. Explorasi Data Section -->
<section class="flex flex-col gap-2 w-full">
  <span class="text-xs font-bold uppercase tracking-wider text-base-content/50">
    Explorasi Data
  </span>
  <button id="btn-trigger-explore-modal" class="btn btn-sm btn-accent w-full gap-2">
    📊 Buka Data Explorer
  </button>
  <!-- Status dataset yang sedang aktif -->
  <div id="explore-status" class="text-xs text-base-content/40 italic">
    Belum ada data yang dieksplorasi.
  </div>
</section>
```

---

### 9. js/ui.js

#### [MODIFY] [ui.js](file:///P:/My%20Drive/%60NGODING%60/Web/xplore-3571/js/ui.js)

Tambah di `reCacheElements()`:
```js
btnTriggerExploreModal: document.getElementById('btn-trigger-explore-modal'),
exploreStatus: document.getElementById('explore-status'),
```

---

### 10. js/app.js

#### [MODIFY] [app.js](file:///P:/My%20Drive/%60NGODING%60/Web/xplore-3571/js/app.js)

```diff
+import { ExploreEngine } from './explore.js';

 // Di dalam DOMContentLoaded:
 UI.reCacheElements();
 UI.init();
+ExploreEngine.init();
```

---

## Urutan Implementasi

1. `index.html` — ubah layout split-panel (tanpa CDN Luckysheet)
2. `components/sidebar.html` — tambah section Explorasi Data
3. `map-modules/*.js` — tambah `toTableRows()` di 3 handler
4. `js/store.js` — tambah `activeExploreData` + `processExploreFile()`
5. `js/map.js` — tambah `renderExploreLayer()` + `highlightExplorePoint()`
6. `js/table.js` — [NEW] TableEngine dengan lazy Luckysheet load
7. `js/components/explore-modal.js` — [NEW] modal dengan toggle spasial
8. `js/explore.js` — [NEW] ExploreEngine + draggable divider + mobile toggle
9. `js/ui.js` — cache elemen baru
10. `js/app.js` — import + init ExploreEngine

---

## Verification Plan (Manual di Browser)

- [ ] Klik "Buka Data Explorer" → Luckysheet CDN mulai di-load (cek Network tab)
- [ ] Upload CSV 200k baris + toggle spasial OFF → sheet baru muncul di Luckysheet, loading tidak freeze UI
- [ ] Upload CSV kedua → sheet kedua muncul, bisa switch antar tab sheet
- [ ] Toggle spasial ON → titik explorasi muncul di peta sebagai layer terpisah
- [ ] Klik baris di Luckysheet (data punya koordinat) → peta fly-to marker
- [ ] Drag divider → panel resize smooth, peta tidak blank
- [ ] Tutup panel → peta kembali full-width, Luckysheet tetap di memory
- [ ] Buka kembali panel → data masih ada (tidak reload)
- [ ] Di mobile: panel tabel full-screen, tombol "Lihat Peta" berfungsi
- [ ] Data spasial existing (polygon + layer bangunan) tidak terganggu
