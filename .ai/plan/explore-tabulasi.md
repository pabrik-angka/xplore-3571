# Plan: Fitur Explorasi Data Tabulasi & Custom Pivot Engine

**Versi:** 2.0 (Refactored & Aligned)  
**Tanggal:** 2026-08-06  
**Status:** Siap Implementasi  

---

## 1. Ringkasan Fitur & Perubahan Arsitektur

Fitur **"Explorasi Data Tabulasi"** dikembangkan sebagai salah satu pilar utama aplikasi PWA GIS **Xplore 3571** pada hash route `#table`. Fitur ini memungkinkan pengguna untuk memuat data mentah (CSV/GeoJSON) ukuran besar (50-100MB / 1.000.000 baris) tanpa membuat browser crash (OOM) atau lag. Data dialirkan (stream) langsung ke IndexedDB, diakses secara paginasi (lazy-loading), dan agregasi berat (Pivot) dijalankan sepenuhnya di background worker.

### Perubahan Utama dari Plan v1:
- ❌ **Menghapus Luckysheet CDN:** Digantikan dengan **DaisyUI Table (`<table class="table">`)** native yang ringan dan seragam secara estetika.
- ✅ **CSS Sticky Positioning:** Sticky Header (`sticky top-0`) dan Sticky Column/Stub Kolom (`sticky left-0`).
- ✅ **IndexedDB-Centric Storage:** Data mentah disimpan dalam IndexedDB, RAM hanya menampung metadata + data halaman aktif (50-500 baris) untuk menghindari Out-of-Memory (OOM).
- ✅ **Tombol "➕ Pivot Table":** Memanggil Modal/Drawer Builder Pivot untuk membuat agregasi kustom dan membuka hasilnya di **Tab Baru**.
- ✅ **Non-blocking Stream Parsing Web Worker:** PapaParse membaca file secara streaming (`step`) di background thread dan langsung menulis ke IndexedDB per-batch.
- ✅ **Worker-based Native Pivot Engine (`js/pivot.js`):** Menghitung agregasi pivot di dalam Web Worker agar Main Thread (UI) tetap 60 FPS.

---

## 2. Keputusan Arsitektur

| Aspek | Keputusan | Alasan |
|---|---|---|
| **UI Table** | DaisyUI v5 Table + CSS Sticky | Light, 0KB extra, responsif, seragam |
| **Freeze Header & Stub** | `sticky top-0` & `sticky left-0` | Native CSS3, performa render browser maksimal |
| **Modul Load** | Flag `is_tabulasi_active: true` | Pemuatan terpusat via Sidebar |
| **Multi-Dataset Navigation** | Top Tab Bar (`div class="tabs tabs-lifted"`) | Pengguna bisa membuka beberapa dataset berdampingan |
| **Tombol Aksi Utama Tab** | `➕ Pivot Table` | Membuka Pivot Builder untuk membuat agregasi |
| **Hasil Pivot** | Tab Baru (`type: 'pivot'`) | Mengisolasi data agregasi tanpa merusak data mentah |
| **Parsing CSV 100k+ Baris** | `Papa.parse(fileStream, { worker: true, step: batchWrite })` | Membaca file secara chunk streaming langsung ke IndexedDB untuk mencegah OOM |
| **Paging Data** | Lazy Loading `LIMIT` & `OFFSET` via IndexedDB | RAM tidak menyimpan seluruh baris data mentah, hanya memuat halaman aktif |
| **Eksekusi Pivot** | Offloaded ke `data-worker.js` | Mengamankan Main Thread dari pembekuan UI saat mengolah data 100MB |
| **Cross-View Link** | Klik baris tabel → Event `explore:flyto` | Leaflet otomatis fly-to ke titik koordinat |

---

## 3. Template Data Module untuk Explorasi Tabulasi

Berikut adalah template standar berbasis **OOP Class** yang mewarisi `BaseModule` untuk membuat modul JS baru yang mendukung kapabilitas tabulasi (`data-modules/template-tabulasi.js`):

```javascript
// data-modules/template-tabulasi.js
import { BaseDataModule } from './BaseModule.js';

/**
 * Template Data Module untuk Xplore 3571
 * Mendukung Explorasi Tabulasi, Spasial, dan Dashboard
 */
class TemplateTabulasiHandler extends BaseDataModule {
  constructor() {
    super({
      id: 'template-tabulasi',
      name: 'Nama Modul Tabulasi',
      type: 'tabulation', // 'tabulation' | 'building' | 'polygon'
      is_spatial_active: true,
      is_tabulasi_active: true,
      is_dashboard_active: false,
      mandatoryFields: ['id', 'kecamatan', 'desa', 'jumlah_usaha']
    });

    /**
     * Definition Skema Kolom Tabel untuk DaisyUI Table & Pivot Engine
     * Menggunakan konsep Metadata-Driven Schema (isDimension dan isMeasure)
     */
    this.tableSchema = [
      { key: 'id',           label: 'ID Record',      type: 'string', isStub: true },
      { key: 'kecamatan',    label: 'Kecamatan',      type: 'string', isDimension: true, filterable: true },
      { key: 'desa',         label: 'Desa / Kel',     type: 'string', isDimension: true, filterable: true },
      { key: 'sektor',       label: 'Sektor Usaha',   type: 'string', isDimension: true, filterable: true },
      { key: 'jumlah_usaha', label: 'Jumlah Usaha',   type: 'number', isMeasure: true, aggregatable: true },
      { key: 'kategori_skala',label: 'Skala Usaha',   type: 'string', isDimension: true }, // Kolom Olahan
      { key: 'latitude',     label: 'Latitude',       type: 'number' },
      { key: 'longitude',    label: 'Longitude',      type: 'number' }
    ];
  }

  /**
   * Transformasi data mentah CSV/GeoJSON menjadi Array of Objects seragam untuk Tabulasi
   * Menerapkan Pilihan A: Passthrough Otomatis & Kolom Olahan (Calculated Fields)
   */
  toTableRows(rawData, fileType = 'csv') {
    return rawData.map((item, index) => {
      const p = this.normalizeProperties(fileType === 'geojson' ? (item.properties || {}) : item);
      
      const getProp = (keys) => {
        for (const key of keys) {
          if (p[key.toLowerCase()] !== undefined) return p[key.toLowerCase()];
        }
        return '-';
      };

      const jmlUsaha = parseInt(getProp(['jumlah_usaha', 'jumlah', 'jml']), 10) || 0;
      
      // LOGIKA KOLOM OLAHAN (Calculated Fields)
      const skala = jmlUsaha > 10 ? 'Menengah/Besar' : 'Kecil';

      return {
        ...p, // Passthrough Otomatis: Menyalin semua properti asli yang tidak memerlukan casting
        id:           getProp(['id', 'ids', 'kode']) || `ROW-${index + 1}`,
        kecamatan:    getProp(['kecamatan', 'nmkec', 'kec']),
        desa:         getProp(['desa', 'nmdesa', 'kelurahan']),
        sektor:       getProp(['sektor', 'sektor_usaha', 'kategori']),
        jumlah_usaha: jmlUsaha,
        kategori_skala: skala, // Kolom Olahan baru
        latitude:     parseFloat(getProp(['latitude', 'lat', 'y']) || NaN),
        longitude:    parseFloat(getProp(['longitude', 'lng', 'lon', 'x']) || NaN)
      };
    });
  }

  /**
   * Transformasi ke objek Spasial Leaflet (hanya jika is_spatial_active: true)
   */
  toLayerConfig(rawItem, fileType = 'csv') {
    if (!this.is_spatial_active) return null;
    const p = fileType === 'geojson' ? (rawItem.properties || {}) : rawItem;

    const lat = parseFloat(p.latitude || p.lat || NaN);
    const lng = parseFloat(p.longitude || p.lng || NaN);
    if (isNaN(lat) || isNaN(lng)) return null;

    return {
      geometry: { lat, lng },
      popupHtml: `
        <div class="p-2 text-xs">
          <strong>${p.kecamatan || '-'}</strong> - ${p.desa || '-'}<br>
          Sektor: ${p.sektor || '-'}<br>
          Jumlah Usaha: ${p.jumlah_usaha || 0}
        </div>
      `,
      searchKeyword: `${p.kecamatan} ${p.desa} ${p.sektor}`.toLowerCase(),
      searchTitle: `${p.kecamatan} - ${p.desa}`
    };
  }
}

export const templateTabulasiHandler = new TemplateTabulasiHandler();
```

---

## 4. Layout & Konsep UI/UX Tabulasi

### A. Layout View Tabulasi (`index.html#table`)

```html
<div id="view-table" class="flex flex-col h-full w-full bg-base-100 overflow-hidden">
  
  <!-- 1. TOP TAB BAR (Multi-Dataset & Pivot Tabs) -->
  <div class="flex items-center justify-between px-3 pt-2 bg-base-200 border-b border-base-300 flex-none gap-2 overflow-x-auto">
    
    <!-- Tab Navigasi Dinamis -->
    <div id="tabulation-tab-bar" class="tabs tabs-lifted flex-nowrap">
      <!-- Generated via JS -->
      <!-- Contoh:
      <button class="tab tab-active gap-2 font-bold text-accent">
        📄 SE2026 <span class="badge badge-sm badge-ghost">1.200</span>
      </button>
      <button class="tab gap-2">
        📊 Pivot: SE2026 <span class="badge badge-sm badge-accent">24</span> <span class="btn-close">✕</span>
      </button>
      -->
    </div>

    <!-- Tombol Aksi Tambah Pivot -->
    <button id="btn-trigger-pivot-modal" class="btn btn-sm btn-accent gap-1 flex-none mb-1">
      ✨ ➕ Pivot Table
    </button>
  </div>

  <!-- 2. TOOLBAR TABEL (Search, Filter, Export, Pagination Info) -->
  <div class="flex flex-wrap items-center justify-between gap-2 p-3 bg-base-100 border-b border-base-300 flex-none">
    
    <!-- Left: Global Search Input -->
    <div class="flex items-center gap-2">
      <div class="relative">
        <input type="text" id="table-global-search" placeholder="🔍 Cari data..." 
               class="input input-sm input-bordered w-48 sm:w-64 pl-8" />
        <span class="absolute left-2.5 top-2 text-xs text-base-content/40">🔍</span>
      </div>
      <button id="btn-toggle-filter-panel" class="btn btn-sm btn-outline btn-ghost gap-1">
        🌪️ Filter Kolom
      </button>
    </div>

    <!-- Right: Export & Rows per Page -->
    <div class="flex items-center gap-2 text-xs">
      <span id="table-row-count-info" class="text-base-content/60 font-semibold">0 dari 0 baris</span>
      <select id="table-page-size" class="select select-sm select-bordered">
        <option value="50">50 baris</option>
        <option value="100" selected>100 baris</option>
        <option value="250">250 baris</option>
        <option value="500">500 baris</option>
      </select>
      <button id="btn-export-csv" class="btn btn-sm btn-outline btn-accent">📥 Export CSV</button>
    </div>
  </div>

  <!-- 3. CONTAINER GRID TABEL DAISYUI (Sticky Header & Left Stub Column) -->
  <div id="table-scroll-container" class="flex-1 overflow-auto relative">
    <table id="main-daisyui-table" class="table table-sm table-pin-rows table-pin-cols w-full">
      <thead id="table-head">
        <!-- Rendered via JS -->
      </thead>
      <tbody id="table-body">
        <!-- Rendered via JS -->
      </tbody>
    </table>
  </div>

  <!-- 4. PAGINATION FOOTER -->
  <div class="flex items-center justify-between px-4 py-2 bg-base-200 border-t border-base-300 flex-none text-xs">
    <span id="pagination-status">Halaman 1 dari 1</span>
    <div class="join">
      <button id="btn-prev-page" class="join-item btn btn-xs btn-outline">« Prev</button>
      <button id="btn-next-page" class="join-item btn btn-xs btn-outline">Next »</button>
    </div>
  </div>
</div>
```

### A.1 Aturan UI/UX Tab & Ekspor CSV
Untuk menavigasi multi-dataset dan pivot, Top Tab Bar (`#tabulation-tab-bar`) membedakan 3 kategori tab:
1. **Tab Data Mentah (Raw Tab):**
   * **Visual:** Ikon kertas `📄 [Nama Modul] (Raw)`
   * **Toolbar:** Menampilkan tombol `Filter Kolom` & `Global Search`.
   * **Perilaku:** Permanen, tidak memiliki tombol silang (`✕`).
2. **Tab Agregasi Bawaan (Preset Pivot Tab):**
   * **Visual:** Ikon grafik `📊 [Judul Preset]` (berdasarkan konfigurasi `pivotPresets` modul).
   * **Toolbar:** Menyembunyikan tombol filter kolom (karena hasil agregasi statis).
   * **Perilaku:** Otomatis digenerate saat upload sukses. Permanen (tidak bisa ditutup oleh user).
3. **Tab Custom Pivot (User-defined Tab):**
   * **Visual:** Ikon bintang `✨ Custom Pivot [N]`
   * **Toolbar:** Menyembunyikan filter kolom.
   * **Perilaku:** Dinamis. Memiliki tombol silang (`✕`) untuk menutup dan menghapus tab dari RAM.

### A.2 Engine Deteksi Ekspor CSV Dinamis
Tombol **📥 Export CSV** di toolbar secara dinamis mendeteksi jenis tab aktif yang sedang dipilih oleh user:
* **Jika Tab Raw Aktif:** Melakukan ekspor data mentah asinkron yang di-stream langsung dari IndexedDB.
* **Jika Tab Pivot Aktif (Preset / Custom):** Mengekstrak data matriks hasil kalkulasi pivot yang saat itu ada di memori RAM, lalu menyusunnya menjadi struktur CSV terformat untuk diunduh langsung.

---

### B. Layout Modal Builder Pivot (`js/components/pivot-modal.js`)

Saat tombol `➕ Pivot Table` diklik, dialog ini akan dipanggil:

```html
<dialog id="pivot-modal" class="modal modal-open">
  <div class="modal-box max-w-lg rounded-xl border border-base-300 shadow-2xl">
    <h3 class="font-bold text-lg text-accent flex items-center gap-2 mb-3">
      📊 Custom Pivot Table Builder
    </h3>

    <div class="form-control gap-3 text-xs">
      
      <!-- 1. Pilih Sumber Data Dataset -->
      <div>
        <label class="label py-1"><span class="label-text font-bold">1. Pilih Sumber Dataset:</span></label>
        <select id="pivot-select-dataset" class="select select-sm select-bordered w-full">
          <!-- Options populated from Store.tabulationSets (Hanya dataset type 'raw') -->
        </select>
      </div>

      <!-- 2. Pivot Configuration Grid -->
      <div class="grid grid-cols-2 gap-3 mt-1">
        
        <!-- Row Fields -->
        <div class="p-2 border border-base-300 rounded-lg bg-base-50">
          <label class="font-bold text-accent block mb-1">📌 Baris (Rows):</label>
          <select id="pivot-select-rows" class="select select-xs select-bordered w-full" multiple size="4">
            <!-- Populated from columns -->
          </select>
          <span class="text-[10px] text-base-content/50">Tahan Ctrl untuk pilih >1</span>
        </div>

        <!-- Column Fields -->
        <div class="p-2 border border-base-300 rounded-lg bg-base-50">
          <label class="font-bold text-accent block mb-1">📌 Kolom (Columns):</label>
          <select id="pivot-select-cols" class="select select-xs select-bordered w-full">
            <option value="">-- Tanpa Pivot Kolom --</option>
            <!-- Populated from columns -->
          </select>
        </div>

        <!-- Metric Field -->
        <div class="p-2 border border-base-300 rounded-lg bg-base-50">
          <label class="font-bold text-accent block mb-1">📊 Field Nilai (Value):</label>
          <select id="pivot-select-value" class="select select-xs select-bordered w-full">
            <!-- Populated from aggregatable/number columns -->
          </select>
        </div>

        <!-- Aggregator -->
        <div class="p-2 border border-base-300 rounded-lg bg-base-50">
          <label class="font-bold text-accent block mb-1">🧮 Fungsi Agregasi:</label>
          <select id="pivot-select-agg" class="select select-xs select-bordered w-full">
            <option value="COUNT">COUNT (Jumlah Baris)</option>
            <option value="SUM" selected>SUM (Total Penjumlahan)</option>
            <option value="AVG">AVG (Rata-rata)</option>
            <option value="MIN">MIN (Nilai Terkecil)</option>
            <option value="MAX">MAX (Nilai Terbesar)</option>
          </select>
        </div>
      </div>

    </div>

    <div class="modal-action mt-4 gap-2">
      <button id="pivot-btn-cancel" class="btn btn-sm btn-ghost">Batal</button>
      <button id="pivot-btn-generate" class="btn btn-sm btn-accent">🚀 Tampilkan di Tab Baru</button>
    </div>
  </div>
</dialog>
```

---

## 5. Struktur Data & State Management (`js/store.js`)

State untuk tabulasi dikelola dalam **Map** di `Store` agar performa akses $O(1)$ dan memori terisolasi sempurna. Karena ukuran data mentah sangat besar, **RAM tidak menyimpan keseluruhan array baris dataset mentah**. RAM hanya menyimpan metadata dan data halaman aktif saat ini:

```javascript
// js/store.js additions
export const Store = {
  // Map Penyimpanan Dataset Tabulasi
  // Key: datasetId (string), Value: TabContext Object
  tabulationSets: new Map(),
  activeTabId: null,

  /**
   * Menambahkan Tab Baru (dipanggil saat module sidebar aktif atau pivot selesai dibuat)
   */
  addTabulationSet(tabContext) {
    // tabContext structure:
    // {
    //   id: 'tab_' + Date.now(),
    //   type: 'raw' | 'pivot',
    //   title: '📄 SE2026',
    //   parentDatasetId: null, // Berisi id dataset asal jika type === 'pivot'
    //   totalRows: 0,          // Total baris riil di IndexedDB
    //   columns: [ { key, label, type, isStub } ],
    //   filterState: {},       // State filter kolom aktif
    //   sortState: [ { field: 'kecamatan', dir: 'asc' } ],
    //   pagination: { page: 1, pageSize: 100 },
    //   pageData: [ ... ]      // HANYA data halaman aktif saat ini (50-500 baris)
    // }
    this.tabulationSets.set(tabContext.id, tabContext);
    this.activeTabId = tabContext.id;
    this.emit('tabulation:changed');
  },

  /**
   * Memuat data halaman aktif secara asinkron dari IndexedDB berdasarkan state navigasi
   */
  async loadActivePageData() {
    const context = this.getActiveTabContext();
    if (!context || context.type === 'pivot') return;

    // Hitung offset
    const offset = (context.pagination.page - 1) * context.pagination.pageSize;
    const limit = context.pagination.pageSize;

    // Panggil DB helper asinkron untuk mengambil data terbatas (offset, limit, filter, sort)
    const { rows, total } = await DB.getTabulationPage(context.id, {
      offset,
      limit,
      filters: context.filterState,
      sort: context.sortState
    });

    context.pageData = rows;
    context.totalRows = total;
    this.emit('tabulation:page-loaded');
  },

  getActiveTabContext() {
    return this.tabulationSets.get(this.activeTabId) || null;
  },

  removeTabulationSet(id) {
    this.tabulationSets.delete(id);
    if (this.activeTabId === id) {
      const keys = Array.from(this.tabulationSets.keys());
      this.activeTabId = keys.length > 0 ? keys[keys.length - 1] : null;
    }
    this.emit('tabulation:changed');
  }
};
```

---

## 6. Native Custom Pivot Engine (`js/pivot.js`)

Mesin pivot murni Vanilla ES6 (0KB dependency) yang diimpor dan dijalankan **di dalam Web Worker (`js/workers/data-worker.js`)** agar tidak membekukan Main Thread.

```javascript
// js/pivot.js
/**
 * Custom Native ES6 Pivot Engine untuk Xplore 3571 (Dijalankan di Worker)
 */

export const PivotEngine = {
  /**
   * Generate Pivot Matrix
   * @param {Array<Object>} rawData - Flat data yang diambil langsung oleh worker dari IndexedDB
   * @param {Object} config { rowFields: [], colField: '', valueField: '', aggFunc: 'SUM'|'COUNT'|'AVG' }
   */
  generatePivot(rawData, { rowFields, colField, valueField, aggFunc = 'SUM' }) {
    if (!rawData || rawData.length === 0 || !rowFields || rowFields.length === 0) {
      return { columns: [], rows: [] };
    }

    // 1. Dapatkan daftar unik header kolom pivot (jika colField dipilih)
    const colValues = colField 
      ? Array.from(new Set(rawData.map(item => String(item[colField] ?? 'Lainnya')))).sort()
      : [];

    // 2. Kelompokkan data berdasarkan kombinasi Row Fields
    const grouped = new Map();

    rawData.forEach(item => {
      const rowKey = rowFields.map(f => String(item[f] ?? '-')).join('||');
      if (!grouped.has(rowKey)) {
        const rowObj = {};
        rowFields.forEach(f => { rowObj[f] = item[f] ?? '-'; });
        grouped.set(rowKey, { rowObj, buckets: {} });
      }

      const group = grouped.get(rowKey);
      const colKey = colField ? String(item[colField] ?? 'Lainnya') : '_default_';
      if (!group.buckets[colKey]) {
        group.buckets[colKey] = [];
      }

      const val = parseFloat(item[valueField]);
      group.buckets[colKey].push(isNaN(val) ? 1 : val);
    });

    // 3. Hitung Agregasi per Bucket
    const computeAgg = (arr) => {
      if (!arr || arr.length === 0) return 0;
      if (aggFunc === 'COUNT') return arr.length;
      if (aggFunc === 'SUM') return arr.reduce((a, b) => a + b, 0);
      if (aggFunc === 'AVG') return arr.reduce((a, b) => a + b, 0) / arr.length;
      if (aggFunc === 'MIN') return Math.min(...arr);
      if (aggFunc === 'MAX') return Math.max(...arr);
      return 0;
    };

    // 4. Susun Format Output Rows & Columns
    const pivotRows = [];
    grouped.forEach(({ rowObj, buckets }) => {
      const rowData = { ...rowObj };
      let totalRow = 0;

      if (colValues.length > 0) {
        colValues.forEach(cVal => {
          const val = computeAgg(buckets[cVal]);
          rowData[cVal] = val;
          totalRow += val;
        });
        rowData['TOTAL'] = totalRow;
      } else {
        const val = computeAgg(buckets['_default_']);
        rowData[valueField || 'Total'] = val;
      }

      pivotRows.push(rowData);
    });

    // Susun metadata kolom
    const resultColumns = [
      ...rowFields.map((f, idx) => ({ key: f, label: f.toUpperCase(), isStub: idx === 0 })),
      ...(colValues.length > 0 ? colValues.map(c => ({ key: c, label: c, type: 'number' })) : [{ key: valueField || 'Total', label: (valueField || 'Total').toUpperCase(), type: 'number' }]),
      ...(colValues.length > 0 ? [{ key: 'TOTAL', label: 'TOTAL', type: 'number', isBold: true }] : [])
    ];

    return {
      columns: resultColumns,
      rows: pivotRows
    };
  }
};
```

---

## 7. Checklist Implementasi (Urutan Wajib)

- [ ] **STEP 1 — Layout Update (`index.html`):** Tambahkan `#view-table` dengan DaisyUI Top Tab Bar, Toolbar, Table Scroll Container (`<table class="table table-pin-rows table-pin-cols">`), dan Pagination Footer.
- [ ] **STEP 2 — Data Module Template (`data-modules/template-tabulasi.js`):** Buat template standar untuk handler modul tabulasi.
- [ ] **STEP 3 — Database Engine (`js/db.js`):** Implementasikan skema penyimpanan IndexedDB, transaksi bulk write per-batch, dan query paging (`LIMIT`/`OFFSET` + sorting + filtering).
- [ ] **STEP 4 — Web Worker Integration (`js/workers/data-worker.js`):** Integrasikan streaming PapaParse, bulk write ke IndexedDB, BBOX spatial indexer, dan pemicu pivot engine berbasis asinkron.
- [ ] **STEP 5 — State Manager (`js/store.js`):** Tambahkan Map `tabulationSets`, `activeTabId`, asinkronus `loadActivePageData()`, serta event listener untuk merespons perubahan halaman.
- [ ] **STEP 6 — Pivot Engine (`js/pivot.js`):** Selesaikan logic pengelompokan agregasi pivot untuk dieksekusi di background worker.
- [ ] **STEP 7 — Table Engine Controller (`js/table.js`):** Implementasikan rendering tabel, pagination UI navigation, sorting, filtering, and Export CSV.
- [ ] **STEP 8 — Pivot Builder Modal UI (`js/components/pivot-modal.js`):** Buat modal UI untuk konfigurasi pivot dan kirim tugas kalkulasi ke Web Worker, kemudian tampilkan matriks hasilnya di Tab Baru.
- [ ] **STEP 9 — Router & Event Linking (`js/router.js` & `js/app.js`):** Daftarkan hash `#table` pada router dan hubungkan event `explore:flyto` dari baris tabel ke peta Leaflet (`js/map.js`).
- [ ] **STEP 10 — Lazy Map Rendering (`js/map.js`):** Optimalkan pemuatan titik spasial peta agar hanya mengambil koordinat di dalam area BBOX yang aktif dari IndexedDB/Worker.
