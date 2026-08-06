# Plan: Fitur Explorasi Data Tabulasi & Custom Pivot Engine

**Versi:** 2.0 (Refactored & Aligned)  
**Tanggal:** 2026-08-06  
**Status:** Siap Implementasi  

---

## 1. Ringkasan Fitur & Perubahan Arsitektur

Fitur **"Explorasi Data Tabulasi"** dikembangkan sebagai salah satu pilar utama aplikasi PWA GIS **Xplore 3571** pada hash route `#table`. Fitur ini memungkinkan pengguna untuk memuat data mentah (CSV/GeoJSON), melihatnya dalam tampilan grid interaktif yang cepat, melakukan pencarian, pengurutan multi-kolom, penyaringan dinamis, serta melakukan **Custom Pivot Table** yang hasilnya disajikan dalam **Tab Baru**.

### Perubahan Utama dari Plan v1:
- ❌ **Menghapus Luckysheet CDN:** Digantikan dengan **DaisyUI Table (`<table class="table">`)** native yang ringan dan seragam secara estetika.
- ✅ **CSS Sticky Positioning:** Sticky Header (`sticky top-0`) dan Sticky Column/Stub Kolom (`sticky left-0`).
- ✅ **Integrasi Sidebar Flag (`is_tabulasi_active: true`):** Setiap modul/data yang diaktifkan melalui Sidebar akan otomatis muncul sebagai **Tab Data Mentah (Raw Tab)** di View Tabulasi.
- ✅ **Tombol "➕ Pivot Table":** Memanggil Modal/Drawer Builder Pivot untuk membuat agregasi kustom dan membuka hasilnya di **Tab Baru**.
- ✅ **Non-blocking PapaParse Web Worker:** Parsing CSV puluhan ribu baris di background thread.
- ✅ **0 Dependency Native Pivot Engine (`js/pivot.js`):** Menggunakan JavaScript ES6+ (`Map`, `Array.reduce`) tanpa library eksternal tua.

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
| **Parsing CSV 100k+ Baris** | `Papa.parse(file, { worker: true })` | UI tidak freeze saat upload file besar |
| **Cross-View Link** | Klik baris tabel → Event `explore:flyto` | Leaflet otomatis fly-to ke titik koordinat |

---

## 3. Template Data Module untuk Explorasi Tabulasi

Berikut adalah template standar untuk membuat modul JS baru yang mendukung kapabilitas tabulasi (`data-modules/template-tabulasi.js`):

```javascript
// data-modules/template-tabulasi.js
/**
 * Template Data Module untuk Xplore 3571
 * Mendukung Explorasi Tabulasi, Spasial, dan Dashboard
 */

export const templateTabulasiHandler = {
  id: 'template-tabulasi',
  name: 'Nama Modul Tabulasi',
  type: 'tabulation', // 'tabulation' | 'building' | 'polygon'

  // ─── KAPABILITAS FITUR MODUL ──────────────────────────────────
  is_spatial_active: true,    // true jika data memiliki koordinat lat/lng
  is_tabulasi_active: true,   // true agar otomatis menambah Tab di View Tabulasi
  is_dashboard_active: false, // true jika memiliki preset chart

  // Field wajib yang harus ada dalam data mentah
  mandatoryFields: ['id', 'kecamatan', 'desa', 'jumlah_usaha'],

  /**
   * Definition Skema Kolom Tabel untuk DaisyUI Table & Pivot Engine
   */
  tableSchema: [
    { key: 'id',           label: 'ID Record',      type: 'string', isStub: true },
    { key: 'kecamatan',    label: 'Kecamatan',      type: 'string', filterable: true },
    { key: 'desa',         label: 'Desa / Kel',     type: 'string', filterable: true },
    { key: 'sektor',       label: 'Sektor Usaha',   type: 'string', filterable: true },
    { key: 'jumlah_usaha', label: 'Jumlah Usaha',   type: 'number', aggregatable: true },
    { key: 'latitude',     label: 'Latitude',       type: 'number' },
    { key: 'longitude',    label: 'Longitude',      type: 'number' }
  ],

  /**
   * Validasi format properti data mentah
   */
  validate(properties) {
    const keys = Object.keys(properties).map(k => k.toLowerCase());
    return this.mandatoryFields.every(field => keys.includes(field));
  },

  /**
   * Transformasi data mentah CSV/GeoJSON menjadi Array of Objects seragam untuk Tabulasi
   */
  toTableRows(rawData, fileType = 'csv') {
    return rawData.map((item, index) => {
      const p = fileType === 'geojson' ? (item.properties || {}) : item;
      
      const getProp = (keys) => {
        for (const key of keys) {
          for (const k in p) {
            if (k.toLowerCase() === key.toLowerCase()) return p[k];
          }
        }
        return '-';
      };

      return {
        id:           getProp(['id', 'ids', 'kode']) || `ROW-${index + 1}`,
        kecamatan:    getProp(['kecamatan', 'nmkec', 'kec']),
        desa:         getProp(['desa', 'nmdesa', 'kelurahan']),
        sektor:       getProp(['sektor', 'sektor_usaha', 'kategori']),
        jumlah_usaha: parseInt(getProp(['jumlah_usaha', 'jumlah', 'jml']), 10) || 0,
        latitude:     parseFloat(getProp(['latitude', 'lat', 'y']) || NaN),
        longitude:    parseFloat(getProp(['longitude', 'lng', 'lon', 'x']) || NaN)
      };
    });
  },

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
};
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

State untuk tabulasi dikelola dalam **Map** di `Store` agar performa akses $O(1)$ dan memori terisolasi sempurna:

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
    //   rawData: [ ... ],
    //   columns: [ { key, label, type, isStub } ],
    //   filterState: {},
    //   sortState: [ { field: 'kecamatan', dir: 'asc' } ],
    //   pagination: { page: 1, pageSize: 100 }
    // }
    this.tabulationSets.set(tabContext.id, tabContext);
    this.activeTabId = tabContext.id;
    this.emit('tabulation:changed');
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

Mesin pivot murni Vanilla ES6 (0KB dependency) yang menerima data flat dan mengembalikan matriks tabel pivot:

```javascript
// js/pivot.js
/**
 * Custom Native ES6 Pivot Engine untuk Xplore 3571
 */

export const PivotEngine = {
  /**
   * Generate Pivot Matrix
   * @param {Array<Object>} rawData 
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
        // Simpan bucket penampung nilai
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
- [ ] **STEP 3 — State Manager (`js/store.js`):** Tambahkan Map `tabulationSets`, `activeTabId`, serta helper `addTabulationSet()` dan `removeTabulationSet()`.
- [ ] **STEP 4 — Native Pivot Engine (`js/pivot.js`):** Implementasikan `PivotEngine.generatePivot()` untuk agregasi data multi-dimensi.
- [ ] **STEP 5 — Table Engine Controller (`js/table.js`):** Implementasikan rendering DaisyUI Table, Sticky Header/Column CSS, Paginasi (50-500 baris), Multi-Column Sorting, dan Export CSV.
- [ ] **STEP 6 — Pivot Builder Modal UI (`js/components/pivot-modal.js`):** Buat modal interaktif untuk memilih dimensi pivot (Rows, Columns, Values, Aggregators) yang menambahkan tab baru ke `Store`.
- [ ] **STEP 7 — Router & Event Linking (`js/router.js` & `js/app.js`):** Daftarkan hash `#table` pada router dan hubungkan event `explore:flyto` dari baris tabel ke peta Leaflet (`js/map.js`).
