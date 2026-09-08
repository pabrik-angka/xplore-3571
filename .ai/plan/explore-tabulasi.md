# Plan: Fitur Explorasi Data Tabulasi & Custom Pivot Engine

**Versi:** 2.1 (Aligned with DDS-Lite Architecture & UnifiedRecord Schema)  
**Tanggal:** 2026-09-08  
**Status:** Siap Implementasi  
**Referensi Utama:**
- [`architecture.md`](./../architecture.md) — DDS-Lite Layer Stack & EventBus Contract
- [`db_schema_design.md`](./../db_schema_design.md) — UnifiedRecord Schema & IDB Index Design

---

## 1. Ringkasan Fitur & Perubahan Arsitektur

Fitur **"Explorasi Data Tabulasi"** dikembangkan sebagai salah satu pilar utama aplikasi PWA GIS **Xplore 3571** pada hash route `#table`. Fitur ini memungkinkan pengguna untuk memuat data mentah (CSV/GeoJSON) ukuran besar (50-100MB / 1.000.000 baris) tanpa membuat browser crash (OOM) atau lag. Data dialirkan (stream) langsung ke IndexedDB, diakses secara paginasi (lazy-loading), dan agregasi berat (Pivot) dijalankan sepenuhnya di background worker.

### Perubahan Utama dari Plan v2.0 (Alignment ke DDS-Lite):
- ✅ **Arsitektur DDS-Lite:** File path & layer selaras penuh dengan struktur `js/core/`, `js/domains/`, `js/strategies/`, `js/ui/`, `js/helpers/`.
- ✅ **`BaseStrategy.js` (bukan `BaseDataModule`):** Template modul tabulasi mengimplementasikan `BaseStrategy` dari `js/strategies/BaseStrategy.js`.
- ✅ **`toUnifiedRecord()` (bukan `toTableRows()`):** Setiap strategy menghasilkan `UnifiedRecord` berformat standar sesuai `db_schema_design.md`.
- ✅ **`getTableSchema()` (bukan `this.tableSchema`):** Skema kolom dikembalikan via method `getTableSchema()` → `ColumnDef[]`.
- ✅ **`js/core/store.js` — Unified Store:** State tabulasi dikelola di store tunggal bersama state peta & dashboard.
- ✅ **Worker path selaras:** `pivot.worker.js` ada di `js/domains/table/workers/`, bukan `js/workers/`.
- ✅ **Pivot Engine di `js/helpers/pivot.js`:** Pure helper, diimport oleh `pivot.worker.js` — bukan modul standalone.
- ✅ **EventBus (bukan `this.emit`):** Seluruh komunikasi antar-domain via `EventBus.emit()` dari `js/core/event-bus.js`.

---

## 2. Keputusan Arsitektur

| Aspek | Keputusan | Alasan |
|---|---|---|
| **UI Table** | DaisyUI v5 Table + CSS Sticky | Light, 0KB extra, responsif, seragam |
| **Freeze Header & Stub** | `table-pin-rows table-pin-cols` | Native CSS3, performa render browser maksimal |
| **Orkestrasi Tabulasi** | `js/domains/table/table.module.js` | Domain Orchestrator sesuai DDS-Lite |
| **Strategy Parser** | `js/strategies/*.strategy.js` implements `BaseStrategy` | SRP — parser terpisah dari orchestrator |
| **State Management** | `js/core/store.js` — `Map tabulationSets` | Terpusat, O(1) akses, memori terisolasi |
| **Multi-Dataset Navigation** | Top Tab Bar (`div class="tabs tabs-lifted"`) | Pengguna bisa membuka beberapa dataset berdampingan |
| **Tombol Aksi Utama Tab** | `➕ Pivot Table` | Membuka Pivot Builder untuk membuat agregasi |
| **Hasil Pivot** | Tab Baru (`type: 'pivot'`) | Mengisolasi data agregasi tanpa merusak data mentah |
| **Parsing CSV 100k+ Baris** | `parser.worker.js` (shared core) + PapaParse `step` streaming | Streaming langsung ke IndexedDB tanpa OOM |
| **Paging Data** | Lazy Loading `LIMIT` & `OFFSET` via `db.service.js` | RAM hanya muat halaman aktif (50-500 baris) |
| **Eksekusi Pivot** | `pivot.worker.js` di `js/domains/table/workers/` | Mengamankan Main Thread, isolasi domain |
| **Pivot Math Engine** | `js/helpers/pivot.js` (pure function, 0 dependency) | Diimport oleh worker — SRP & DRY |
| **Cross-View Link** | `EventBus.emit('explore:flyto')` | Leaflet fly-to via `mapListener.js` |
| **Filter Wilayah** | Prefix-range IDB (`idsubsls`) jika `hasRegionId`, Ray-Casting fallback | Sesuai `db_schema_design.md` §2c |

---

## 3. Template Strategy untuk Modul Tabulasi

Template standar berbasis **`BaseStrategy`** untuk membuat modul data baru yang mendukung kapabilitas tabulasi (`js/strategies/template-tabulasi.strategy.js`):

> **Perubahan dari v2.0:** Kelas mewarisi `BaseStrategy` (bukan `BaseDataModule`), method `toUnifiedRecord()` menggantikan `toTableRows()`, `getTableSchema()` menggantikan `this.tableSchema`, dan koordinat GeoJSON wajib `[lng, lat]`.

```javascript
// js/strategies/template-tabulasi.strategy.js
import { BaseStrategy } from './BaseStrategy.js';

/**
 * Template Strategy Tabulasi untuk Xplore 3571
 * Menghasilkan UnifiedRecord sesuai db_schema_design.md
 */
class TemplateTabulasiStrategy extends BaseStrategy {

  get moduleId()   { return 'template-tabulasi'; }
  get moduleName() { return 'Nama Modul Tabulasi'; }
  get dataType()   { return 'Tabular'; } // 'Point' | 'Polygon' | 'Tabular'

  /**
   * Definisi kolom tabel untuk DaisyUI Table & Pivot Engine
   * isDimension: cocok sebagai Row/Column di pivot builder
   * isMeasure: cocok sebagai Value (number) di pivot builder
   * @returns {ColumnDef[]}
   */
  getTableSchema() {
    return [
      { key: 'id',             label: 'ID Record',    type: 'string', isStub: true },
      { key: 'kecamatan',      label: 'Kecamatan',    type: 'string', isDimension: true, filterable: true },
      { key: 'desa',           label: 'Desa / Kel',   type: 'string', isDimension: true, filterable: true },
      { key: 'sektor',         label: 'Sektor Usaha', type: 'string', isDimension: true, filterable: true },
      { key: 'jumlah_usaha',   label: 'Jml Usaha',    type: 'number', isDimension: false, isMeasure: true },
      { key: 'kategori_skala', label: 'Skala Usaha',  type: 'string', isDimension: true }, // Calculated field
      { key: 'latitude',       label: 'Latitude',     type: 'number' },
      { key: 'longitude',      label: 'Longitude',    type: 'number' }
    ];
  }

  /**
   * Preset agregasi bawaan — dikalkulasi otomatis saat upload selesai
   * @returns {PivotPreset[]}
   */
  getPivotPresets() {
    return [
      {
        id: 'preset-per-kec',
        title: 'Jumlah Usaha per Kecamatan',
        rowFields: ['kecamatan'],
        colField: null,
        valueField: 'jumlah_usaha',
        aggFunc: 'SUM'
      }
    ];
  }

  /**
   * Konversi raw row → UnifiedRecord (sesuai db_schema_design.md §2)
   * SATU-SATUNYA tempat: cast tipe, calculated fields, build geometry & searchKey
   * @param {object} rawRow - baris mentah dari CSV/DuckDB
   * @param {string} source - 'indexeddb' | 'duckdb'
   * @returns {UnifiedRecord}
   */
  toUnifiedRecord(rawRow, source = 'indexeddb') {
    // Normalisasi key ke lowercase
    const p = Object.fromEntries(
      Object.entries(rawRow).map(([k, v]) => [k.toLowerCase().trim(), v])
    );

    const getProp = (...keys) => {
      for (const k of keys) {
        if (p[k] !== undefined && p[k] !== '') return p[k];
      }
      return null;
    };

    const jmlUsaha  = parseInt(getProp('jumlah_usaha', 'jumlah', 'jml'), 10) || 0;
    const rawLat    = parseFloat(getProp('latitude', 'lat', 'y') ?? NaN);
    const rawLng    = parseFloat(getProp('longitude', 'lng', 'lon', 'x') ?? NaN);
    const idsubsls  = getProp('idsubsls') ?? null;

    const properties = {
      ...p,                             // Passthrough semua field asli
      id:             getProp('id', 'ids', 'kode') ?? `ROW-${Date.now()}`,
      kecamatan:      getProp('kecamatan', 'nmkec', 'kec') ?? '-',
      desa:           getProp('desa', 'nmdesa', 'kelurahan') ?? '-',
      sektor:         getProp('sektor', 'sektor_usaha', 'kategori') ?? '-',
      jumlah_usaha:   jmlUsaha,
      kategori_skala: jmlUsaha > 10 ? 'Menengah/Besar' : 'Kecil', // Calculated field
    };

    const searchableFields = ['kecamatan', 'desa', 'sektor'];
    const searchKey = searchableFields
      .map(k => String(properties[k] ?? '').toLowerCase())
      .join(' ');

    const record = {
      // BASE — mandatory (db_schema_design.md §2b)
      id:           `${this.moduleId}-${properties.id}`,
      type:         this.dataType,
      source,
      moduleId:     this.moduleId,
      idsubsls,
      region:       null, // isi jika data memiliki idsubsls valid
      properties,
      searchFields: searchableFields,
      searchKey,
    };

    // GEOMETRY — aktifkan jika data memiliki koordinat (type override ke 'Point')
    if (!isNaN(rawLat) && !isNaN(rawLng)) {
      record.type     = 'Point';
      record.geometry = {
        type: 'Point',
        coordinates: [rawLng, rawLat] // GeoJSON [lng, lat] ✅ — JANGAN dibalik!
      };
      record.tooltipHtml   = `<div class="p-2 text-xs"><strong>${properties.kecamatan}</strong> - ${properties.desa}<br>Sektor: ${properties.sektor}<br>Jumlah Usaha: ${jmlUsaha}</div>`;
      record.clusterGroup  = this.moduleId;
    }

    return record;
  }
}

export const templateTabulasiStrategy = new TemplateTabulasiStrategy();
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

## 5. State Management (`js/core/store.js`)

State tabulasi dikelola via `Map` di `store.js` yang sudah ada. RAM **tidak menyimpan seluruh baris dataset mentah** — hanya metadata + data halaman aktif.

> **Perubahan dari v2.0:** Bukan `Store` terpisah. Semua masuk ke `js/core/store.js`, menggunakan `EventBus.emit()` bukan `this.emit()`. TabContext menyimpan `idbStoreName` & `moduleId` untuk referensi query.

```javascript
// Tambahan ke js/core/store.js
import { EventBus } from './event-bus.js';
import * as dbService from './services/db.service.js';

// Map: Key = tabId (string), Value = TabContext
tabulationSets: new Map(),
activeTabId: null,

/**
 * TabContext structure:
 * {
 *   id: 'tab_' + Date.now(),
 *   type: 'raw' | 'pivot',
 *   tabType: 'raw' | 'preset' | 'custom',   // untuk UI Tab Bar
 *   title: '📄 SE2026',
 *   moduleId: 'wilkerstat',                  // ID strategy
 *   parentTabId: null,                       // tabId raw asal jika type === 'pivot'
 *   idbStoreName: 'wilkerstat_records',      // nama IDB store untuk query
 *   totalRows: 0,
 *   columns: ColumnDef[],                    // dari strategy.getTableSchema()
 *   filterState: {},
 *   sortState: [{ field, dir }],
 *   pagination: { page: 1, pageSize: 100 },
 *   pageData: UnifiedRecord[],               // HANYA halaman aktif
 *   // Jika type === 'pivot':
 *   pivotConfig: { rowFields, colField, valueField, aggFunc },
 *   pivotMatrix: { columns: [], rows: [] }   // hasil dari pivot.worker.js
 * }
 */

addTabulationSet(tabContext) {
  this.tabulationSets.set(tabContext.id, tabContext);
  this.activeTabId = tabContext.id;
  EventBus.emit('tabulation:changed', { activeTabId: tabContext.id });
},

async loadActivePageData() {
  const ctx = this.getActiveTabContext();
  if (!ctx || ctx.type === 'pivot') return;

  const offset = (ctx.pagination.page - 1) * ctx.pagination.pageSize;
  const { rows, total } = await dbService.getPage(ctx.idbStoreName, {
    offset,
    limit: ctx.pagination.pageSize,
    filters: ctx.filterState,
    sort: ctx.sortState
  });

  ctx.pageData  = rows;
  ctx.totalRows = total;
  EventBus.emit('tabulation:page-loaded', { rows, totalRows: total, page: ctx.pagination.page });
},

getActiveTabContext() {
  return this.tabulationSets.get(this.activeTabId) ?? null;
},

removeTabulationSet(id) {
  this.tabulationSets.delete(id);
  if (this.activeTabId === id) {
    const keys = [...this.tabulationSets.keys()];
    this.activeTabId = keys.length > 0 ? keys.at(-1) : null;
  }
  EventBus.emit('tabulation:changed', { activeTabId: this.activeTabId });
}
```

### EventBus Contract — Tabulation Events

Sesuai `architecture.md` §4:

| Event Name | Emitter | Subscriber | Payload |
|---|---|---|---|
| `tabulation:changed` | `core/store.js` | `table.module.js` | `{ activeTabId }` |
| `tabulation:page-loaded` | `core/store.js` | `table.module.js` | `{ rows, totalRows, page }` |
| `table:active-tab-changed` | `table.module.js` | `navbar.ui.js` | `{ tabId, tabType: 'raw'\|'preset'\|'custom' }` |
| `worker:pivot-result` | `pivot.worker.js` | `table.module.js` | `{ matrix, presetId? }` |
| `worker:parse-progress` | `parser.worker.js` | `store.js` | `{ percent, totalParsed }` |
| `explore:flyto` | `table.module.js` | `mapListener.js` | `{ lat, lng, zoom? }` |

---

## 6. Native Custom Pivot Engine (`js/helpers/pivot.js`)

Pure ES6 helper (0KB dependency) — **diimport oleh `js/domains/table/workers/pivot.worker.js`**. Worker membaca data langsung dari IDB (tidak via postMessage rawData).

> **Perubahan dari v2.0:** File ada di `js/helpers/pivot.js` (bukan `js/pivot.js`). Fungsi `getVal()` membaca dari `UnifiedRecord.properties` sesuai schema baru.

```javascript
// js/helpers/pivot.js
/**
 * Custom Native ES6 Pivot Engine untuk Xplore 3571 (Dijalankan di Worker)
 */

export const PivotEngine = {
  /**
   * Generate Pivot Matrix dari flat UnifiedRecord[]
   * @param {UnifiedRecord[]} records - dibaca langsung dari IDB oleh pivot.worker.js
   * @param {{ rowFields: string[], colField: string|null, valueField: string, aggFunc: string }} config
   * @returns {{ columns: ColumnDef[], rows: object[] }}
   */
  generatePivot(records, { rowFields, colField, valueField, aggFunc = 'SUM' }) {
    if (!records?.length || !rowFields?.length) return { columns: [], rows: [] };

    // Ambil nilai dari UnifiedRecord.properties (source of truth)
    const getVal = (rec, field) => rec.properties?.[field] ?? rec[field] ?? null;

    // 1. Nilai unik kolom pivot (jika colField dipilih)
    const colValues = colField
      ? [...new Set(records.map(r => String(getVal(r, colField) ?? 'Lainnya')))].sort()
      : [];

    // 2. Kelompokkan berdasarkan kombinasi rowFields
    const grouped = new Map();

    records.forEach(rec => {
      const rowKey = rowFields.map(f => String(getVal(rec, f) ?? '-')).join('||');
      if (!grouped.has(rowKey)) {
        const rowObj = Object.fromEntries(rowFields.map(f => [f, getVal(rec, f) ?? '-']));
        grouped.set(rowKey, { rowObj, buckets: {} });
      }

      const group  = grouped.get(rowKey);
      const colKey = colField ? String(getVal(rec, colField) ?? 'Lainnya') : '_default_';
      (group.buckets[colKey] ??= []).push(parseFloat(getVal(rec, valueField)) || 1);
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

## 7. Mapping File Path — Lama vs Baru (DDS-Lite)

| Plan v2.0 (LAMA) | Plan v2.1 DDS-Lite (BARU) | Layer |
|---|---|---|
| `js/store.js` | `js/core/store.js` | Core |
| `js/db.js` | `js/core/services/db.service.js` | Repository |
| `js/workers/data-worker.js` | `js/core/workers/parser.worker.js` | Core Worker |
| `js/pivot.js` | `js/helpers/pivot.js` | Helper |
| _(tidak ada)_ | `js/domains/table/workers/pivot.worker.js` | Domain Worker |
| `js/table.js` | `js/domains/table/table.module.js` | Domain Orchestrator |
| `js/components/pivot-modal.js` | `js/ui/components/pivot-modal.js` | UI Component |
| _(tidak ada)_ | `js/ui/modal.ui.js` | UI Controller |
| `js/router.js` | `js/core/router.js` | Core |
| `js/app.js` | `js/app.js` (tetap di root) | Bootstrapper |
| `data-modules/BaseModule.js` | `js/strategies/BaseStrategy.js` | Strategy |
| `data-modules/template-tabulasi.js` | `js/strategies/template-tabulasi.strategy.js` | Strategy |

---

## 8. Checklist Implementasi (Urutan Wajib)

- [ ] **STEP 1 — Layout Update (`index.html`):** Tambahkan `#view-table` dengan DaisyUI Top Tab Bar, Toolbar, Table Scroll Container (`<table class="table table-pin-rows table-pin-cols">`), dan Pagination Footer.

- [ ] **STEP 2 — Strategy Template (`js/strategies/template-tabulasi.strategy.js`):** Buat strategy standar yang mengimplementasikan `BaseStrategy`: `toUnifiedRecord()`, `getTableSchema()`, `getPivotPresets()`.

- [ ] **STEP 3 — DB Service (`js/core/services/db.service.js`):** Implementasikan skema IDB store, transaksi bulk write per-batch (10k baris), index `idsubsls` & `by_module_region`, dan query paging (`LIMIT`/`OFFSET` + sorting + filtering via `IDBKeyRange`).

- [ ] **STEP 4 — Parser Worker (`js/core/workers/parser.worker.js`):** Integrasikan streaming PapaParse (`step`), panggil `strategy.toUnifiedRecord()`, bulk write ke IDB, kirim `parse-progress` & `parse-done` via `postMessage`.

- [ ] **STEP 5 — Store Update (`js/core/store.js`):** Tambahkan `tabulationSets Map`, `activeTabId`, `addTabulationSet()`, `loadActivePageData()`, `removeTabulationSet()`. Semua state change emit via `EventBus`.

- [ ] **STEP 6 — Pivot Helper (`js/helpers/pivot.js`):** Implementasikan `PivotEngine.generatePivot()` sebagai pure function — membaca nilai dari `UnifiedRecord.properties`.

- [ ] **STEP 7 — Pivot Worker (`js/domains/table/workers/pivot.worker.js`):** Import `PivotEngine` dari `helpers/pivot.js`. Worker membaca data langsung dari IDB. Emit via `postMessage({ type: 'pivot-result', matrix, presetId })`.

- [ ] **STEP 8 — Table Module (`js/domains/table/table.module.js`):** Orkestrator domain tabulasi. Subscribe `EventBus.on('tabulation:page-loaded')` & `EventBus.on('tabulation:changed')`. Handle rendering tab bar, tabel DaisyUI (`DocumentFragment`), pagination, sorting, filtering, Export CSV, dan `EventBus.emit('explore:flyto')`.

- [ ] **STEP 9 — Pivot Modal UI (`js/ui/components/pivot-modal.js` + `js/ui/modal.ui.js`):** Modal builder pivot. Saat submit, kirim `pivotConfig` ke `pivot.worker.js`. Hasil `worker:pivot-result` diterima `table.module.js` → Tab Pivot baru.

- [ ] **STEP 10 — EventBus Listener (`js/core/listeners/`):** Tambahkan handler `tabulation:changed` dan `tabulation:page-loaded` di listener yang sesuai. Tidak boleh ada EventBus handler langsung di dalam orchestrator.

- [ ] **STEP 11 — Router & App Bootstrap (`js/core/router.js` & `js/app.js`):** Daftarkan hash `#table` pada router. Hubungkan `explore:flyto` ke `mapListener.js`. Pastikan `table.module.js` diinisialisasi saat view `#table` aktif.

- [ ] **STEP 12 — Lazy Map Rendering (`js/domains/map/map.module.js`):** Pastikan event `map:viewport-changed` → `spatial.worker.js` terhubung sehingga hanya koordinat dalam BBOX viewport yang di-render di Leaflet.
