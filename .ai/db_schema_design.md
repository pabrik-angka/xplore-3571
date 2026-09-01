# DB Design: Unified Record Schema — Xplore 3571

> **Tujuan:** Mendefinisikan skema data seragam yang harus diproduksi oleh semua strategy (offline/online),
> sehingga `store.js` tidak peduli datanya dari mana — IndexedDB atau DuckDB — hasilnya sama.
>
> **Menjawab:**
> - **C2** — Standarisasi format koordinat (semua `[lng, lat]` GeoJSON)
> - **G1** — Interface unifikasi dua pipeline data di `store.js`

---

## 1. Entity Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STRATEGY LAYER                              │
│   wilkerstat.strategy  fasih.strategy  sentra.strategy  duckdb...   │
│              │                │              │              │        │
│              └────────────────┴──────────────┘              │        │
│                               │                             │        │
│                    toUnifiedRecord(rawRow)        toUnifiedRecord()  │
│                               │                             │        │
└───────────────────────────────┼─────────────────────────────┘        
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       UNIFIED RECORD                                 │
│                                                                      │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────────┐ │
│  │  BASE (wajib) │   │ GEOMETRY (kond.) │   │ DISPLAY (opsional)   │ │
│  │              │   │                  │   │                      │ │
│  │ id           │   │ geometry.type    │   │ tooltipHtml          │ │
│  │ type ────────┼──▶│ geometry.coords  │   │ styleConfig          │ │
│  │ source       │   │ (GeoJSON only ✅)│   │ clusterGroup         │ │
│  │ moduleId     │   └──────────────────┘   └──────────────────────┘ │
│  │ properties   │                                                    │
│  │ searchKey    │   ┌──────────────────┐                            │
│  │ searchFields │   │ META (opsional)  │                            │
│  └──────────────┘   │                  │                            │
│                     │ _raw             │                            │
│                     │ _importedAt      │                            │
│                     └──────────────────┘                            │
└──────────────────────────────────────────────────────────────────────┘
                                │
                   ┌────────────┴────────────┐
                   ▼                         ▼
          ┌─────────────────┐      ┌──────────────────┐
          │   IndexedDB     │      │  DuckDB RAM       │
          │   (Offline)     │      │  (Online)         │
          │                 │      │                   │
          │  store.getPage()│      │  store.queryDb()  │
          └────────┬────────┘      └────────┬──────────┘
                   └────────────┬────────────┘
                                ▼
                    store.js — unified interface
                    (tidak peduli sumber data)
```

---

## 2. Unified Record Schema

### 2a. Discriminator: `type`

Field `type` adalah **type discriminator** — menentukan field mana yang mandatory dan opsional.

```
type = 'Point'    → data titik bangunan (spatial, has coordinates)
type = 'Polygon'  → data batas wilayah  (spatial, has coordinates)
type = 'Tabular'  → data non-spasial   (no coordinates)
```

### 2b. Base Schema (MANDATORY — semua type, semua source)

| Field | Tipe | Deskripsi |
|---|---|---|
| `id` | `string` | ID unik record. Format: `{moduleId}-{originalId}` atau UUID |
| `type` | `'Point' \| 'Polygon' \| 'Tabular'` | Discriminator schema |
| `source` | `'indexeddb' \| 'duckdb'` | Asal pipeline data |
| `moduleId` | `string` | ID strategy yang memproduksi record ini (e.g. `'wilkerstat'`) |
| `id_region` | `string \| null` | **[INDEXED]** Kode wilayah hierarkis 16 digit BPS. `null` jika data tidak punya info wilayah |
| `region` | `RegionParts \| null` | Pre-parsed level wilayah (kota/kec/kel/sls/subsls) — diturunkan dari `id_region` |
| `properties` | `Record<string, any>` | Semua field data asli + kalkulasi (cast ke tipe yang benar) |
| `searchKey` | `string` | Pre-computed lowercase string gabungan semua searchable field |
| `searchFields` | `string[]` | Key dari `properties` yang dimasukkan ke `searchKey` |

```js
// Contoh Base Schema minimal (Tabular):
{
  id: "wilkerstat-BDG001",
  type: "Tabular",
  source: "indexeddb",
  moduleId: "wilkerstat",
  id_region: "3571001002000000",   // ← Top-level, di-index di IDB
  region: {                        // ← Pre-parsed, siap dipakai filter UI
    kota:   "3571",
    kec:    "3571001",
    kel:    "3571001002",
    sls:    "35710010020000",
    subsls: "3571001002000000"
  },
  properties: {
    kode_bangunan: "BDG001",
    nama_pemilik: "Toko Utama",
    kecamatan: "Mojoroto",
    jumlah_karyawan: 12,
    kategori_skala: "Kecil"
  },
  searchFields: ["nama_pemilik", "kode_bangunan", "kecamatan"],
  searchKey: "toko utama bdg001 mojoroto"
}
```

---

### 2c. Region ID Schema — `id_region` & `region` (MANDATORY jika data berbasis wilayah BPS)

#### Format Kode Wilayah

```
Format: AAAABBBCCCDDDDEE  (16 digit, selalu string)

  AAAA  = Level 2 · Kota/Kabupaten    (4 digit)
  BBB   = Level 3 · Kecamatan         (3 digit)
  CCC   = Level 4 · Kelurahan/Desa    (3 digit)
  DDDD  = Level 5 · SLS               (4 digit)
  EE    = Level 6 · Sub-SLS           (2 digit)

Contoh: 3571001002000101
  → 3571        = Kota Kediri
  → 3571001     = Kec. Mojoroto
  → 3571001002  = Kel. Mojoroto
  → 35710010020001  = SLS 0001
  → 3571001002000101 = Sub-SLS 01
```

#### Aturan Padding untuk Data Parsial

Jika data hanya diketahui sampai level tertentu, level di bawahnya **dipad dengan nol**:

| Data diketahui sampai | `id_region` |
|---|---|
| Kota saja | `3571000000000000` |
| Kecamatan | `3571001000000000` |
| Kelurahan | `3571001002000000` |
| SLS | `3571001002000100` |
| Sub-SLS (full) | `3571001002000101` |

> ⚠️ **Tidak boleh menggunakan string pendek/truncated** (e.g. `"3571001"`). Selalu 16 digit penuh dengan padding nol — ini memastikan `id_region` bisa di-prefix-query secara konsisten di IndexedDB.

#### Field `region` — Pre-Parsed Hierarchy

Field `region` adalah hasil parsing `id_region` yang dilakukan **sekali di strategy saat produksi record**, bukan setiap kali filtering:

```js
// helpers/region-parser.js — pure function, dipanggil oleh strategy
export function parseRegion(id_region) {
  if (!id_region || id_region.length !== 16) return null;
  return {
    kota:   id_region.substring(0, 4),   // "3571"
    kec:    id_region.substring(0, 7),   // "3571001"
    kel:    id_region.substring(0, 10),  // "3571001002"
    sls:    id_region.substring(0, 14),  // "35710010020001"
    subsls: id_region.substring(0, 16),  // "3571001002000101" (full)
  };
}
```

#### Bagaimana `id_region` Mempercepat Filtering

Dengan `id_region` sebagai **indexed field di IndexedDB**, filter wilayah menggunakan **prefix-range query** — tanpa Ray-Casting:

```js
// db.service.js — filter by wilayah menggunakan IDBKeyRange
async function getByRegion(storeName, levelPrefix) {
  // Contoh: levelPrefix = "3571001" → ambil semua record di Kec. Mojoroto
  const range = IDBKeyRange.bound(
    levelPrefix,          // lower bound: "3571001"
    levelPrefix + '\uffff'  // upper bound: "3571001" + max char (prefix query)
  );
  return getAllFromIndex(storeName, 'id_region', range);
  // Hasil: O(log n) lookup via B-tree index ✅
  // Bukan: O(n) scan + Ray-Casting ❌
}
```

#### Strategi Filtering Dual-Mode

| Kondisi Data | Strategi Filter | Kecepatan |
|---|---|---|
| `id_region` tersedia (data BPS) | **Prefix-range query** via IDB index | ✅ O(log n) |
| `id_region = null` (data custom/upload) | **Ray-Casting** via `spatial.worker.js` | ⚠️ O(n) |

`filter-index.js` atau `spatial-filter-manager.js` perlu mengecek `meta.hasRegionId` untuk memilih strategi:

```js
// domains/map/spatial-filter-manager.js
async function filterByWilayah(moduleId, levelPrefix) {
  const meta = store.getDatasetMeta(moduleId);

  if (meta.hasRegionId) {
    // Fast path: prefix query ke IDB
    return db.service.getByRegion(meta.idbStoreName, levelPrefix);
  } else {
    // Fallback: kirim ke spatial worker untuk Ray-Casting
    spatialWorker.postMessage({ type: 'filter-by-polygon', polygonId: levelPrefix });
  }
}
```

#### `id_region` pada Polygon Record

Untuk data **Polygon wilayah**, `id_region` adalah identitas polygon itu sendiri:

```js
// Polygon kecamatan Mojoroto:
{
  id: "wilayah-3571001000000000",
  type: "Polygon",
  id_region: "3571001000000000",  // ID polygon ini sendiri
  region: {
    kota: "3571",
    kec:  "3571001",
    kel:  "3571001000",   // padding nol — level kel tidak relevan untuk polygon kec
    sls:  "35710010000000",
    subsls: "3571001000000000"
  },
  ...
}
```

Ini memungkinkan join logis: **titik bangunan yang `region.kec === polygon.region.kec`** adalah titik yang berada di dalam polygon tersebut — tanpa perlu Ray-Casting sama sekali.

---

### 2d. Geometry Schema (MANDATORY jika `type = 'Point' | 'Polygon'`)

> ✅ **Fix C2:** Semua koordinat menggunakan **GeoJSON standard `[lng, lat]`** tanpa pengecualian.
> Konversi ke Leaflet `[lat, lng]` HANYA dilakukan di `building-layer-manager.js` saat render.

| Field | Tipe | Mandatory untuk |
|---|---|---|
| `geometry` | `GeometryObject` | `'Point'`, `'Polygon'` |
| `geometry.type` | `'Point' \| 'Polygon' \| 'MultiPolygon'` | `'Point'`, `'Polygon'` |
| `geometry.coordinates` | GeoJSON coordinate array | `'Point'`, `'Polygon'` |

```js
// GeoJSON format untuk Point: [lng, lat]
geometry: {
  type: "Point",
  coordinates: [112.0123, -7.8123]   // ← [lng, lat], bukan [lat, lng]
}

// GeoJSON format untuk Polygon: [[[lng, lat], ...]]
geometry: {
  type: "Polygon",
  coordinates: [[[112.01, -7.81], [112.02, -7.81], [112.02, -7.82], [112.01, -7.81]]]
}
```

**Aturan konversi di rendering layer:**
```js
// building-layer-manager.js — SATU-SATUNYA tempat konversi
function toLeafletLatLng(geoJsonCoords) {
  return [geoJsonCoords[1], geoJsonCoords[0]]; // [lat, lng]
}
L.marker(toLeafletLatLng(record.geometry.coordinates));
```

---

### 2e. Display Schema (OPSIONAL — tergantung context rendering)

| Field | Tipe | Mandatory untuk | Deskripsi |
|---|---|---|---|
| `tooltipHtml` | `string` | - | Pre-rendered HTML string untuk popup Leaflet / tooltip tabel |
| `styleConfig` | `PolygonStyle` | `'Polygon'` | Warna, opacity, dll untuk rendering polygon |
| `clusterGroup` | `string` | `'Point'` | Nama cluster group untuk Leaflet.markercluster |

```js
// Optional Display fields:
tooltipHtml: "<strong>Toko Utama</strong><br>Mojoroto · 12 karyawan",
styleConfig: {                    // hanya untuk Polygon
  color: "#3b82f6",
  fillOpacity: 0.15,
  weight: 2
},
clusterGroup: "wilkerstat"        // hanya untuk Point
```

---

### 2f. Meta Schema (OPSIONAL — debugging & audit trail)

| Field | Tipe | Deskripsi |
|---|---|---|
| `_importedAt` | `number` | `Date.now()` saat record diproduksi |
| `_raw` | `object` | Data mentah sebelum transformasi (DEV only, strip di production) |

---

## 3. Contoh Lengkap per Type

```js
// ─────────────────────────────────────────────────────
// A. type: 'Point'  (dari IndexedDB, strategy wilkerstat)
// ─────────────────────────────────────────────────────
{
  // BASE — mandatory
  id: "wilkerstat-B001",
  type: "Point",
  source: "indexeddb",
  moduleId: "wilkerstat",
  properties: {
    id_bangunan: "B001",
    nama_pemilik: "Toko Utama",
    kecamatan: "Mojoroto",
    jumlah_karyawan: 12,
    kategori_skala: "Kecil"
  },
  searchFields: ["nama_pemilik", "id_bangunan", "kecamatan"],
  searchKey: "toko utama b001 mojoroto",

  // GEOMETRY — mandatory karena type = 'Point'
  geometry: {
    type: "Point",
    coordinates: [112.0123, -7.8123]   // GeoJSON [lng, lat] ✅
  },

  // DISPLAY — opsional
  tooltipHtml: "<strong>Toko Utama</strong><br>Jl. Pemuda No. 1",
  clusterGroup: "wilkerstat"
}

// ─────────────────────────────────────────────────────
// B. type: 'Polygon'  (dari IndexedDB, strategy wilayah)
// ─────────────────────────────────────────────────────
{
  // BASE — mandatory
  id: "wilayah-357101",
  type: "Polygon",
  source: "indexeddb",
  moduleId: "wilayah",
  properties: {
    kode_wilayah: "357101",
    nama_wilayah: "Mojoroto"
  },
  searchFields: ["nama_wilayah", "kode_wilayah"],
  searchKey: "mojoroto 357101",

  // GEOMETRY — mandatory karena type = 'Polygon'
  geometry: {
    type: "Polygon",
    coordinates: [[[112.01, -7.81], [112.02, -7.81], [112.02, -7.82], [112.01, -7.81]]]
    // GeoJSON [lng, lat] ✅ — konsisten dengan Point
  },

  // DISPLAY — opsional
  tooltipHtml: "<strong>Kec. Mojoroto</strong>",
  styleConfig: { color: "#3b82f6", fillOpacity: 0.15, weight: 2 }
}

// ─────────────────────────────────────────────────────
// C. type: 'Point'  (dari DuckDB, source: 'duckdb')
// ─────────────────────────────────────────────────────
{
  // BASE — mandatory (format SAMA dengan offline)
  id: "fasih-F042",
  type: "Point",
  source: "duckdb",          // ← satu-satunya perbedaan dari offline
  moduleId: "fasih",
  properties: {
    id_sampel: "F042",
    nama_usaha: "Warung Sari",
    kecamatan: "Pesantren",
    omset_bulan: 4500000,
    kategori: "Mikro"
  },
  searchFields: ["nama_usaha", "id_sampel", "kecamatan"],
  searchKey: "warung sari f042 pesantren",

  // GEOMETRY — mandatory
  geometry: {
    type: "Point",
    coordinates: [111.9987, -7.8241]   // GeoJSON [lng, lat] ✅
  },

  tooltipHtml: "<strong>Warung Sari</strong><br>Pesantren"
}
```

---

## 4. Dataset Metadata Schema (per-dataset, bukan per-record)

Disimpan terpisah di IndexedDB store `datasets_meta` (untuk offline) atau di RAM (untuk DuckDB).

| Field | Tipe | Mandatory | Deskripsi |
|---|---|---|---|
| `moduleId` | `string` | ✅ | Unique ID strategy |
| `moduleName` | `string` | ✅ | Display name |
| `dataType` | `'Point' \| 'Polygon' \| 'Tabular'` | ✅ | Discriminator di level dataset |
| `source` | `'indexeddb' \| 'duckdb'` | ✅ | Pipeline asal |
| `totalRows` | `number` | ✅ | Jumlah total record |
| `importedAt` | `number` | ✅ | Timestamp upload/fetch |
| `tableSchema` | `ColumnDef[]` | ✅ | Definisi kolom untuk tabel UI |
| `hasRegionId` | `boolean` | ✅ | Apakah dataset punya `id_region` valid — menentukan strategi filter |
| `regionDepth` | `2 \| 3 \| 4 \| 5 \| 6` | opsional | Level terdalam yang valid di dataset ini |
| `pivotPresets` | `PivotPreset[]` | opsional | Preset agregasi bawaan |
| `duckdbTable` | `string` | opsional (DuckDB only) | Nama tabel di DuckDB |
| `idbStoreName` | `string` | opsional (IndexedDB only) | Nama store di IndexedDB |

```js
// Contoh tableSchema (ColumnDef[]):
tableSchema: [
  { key: "nama_pemilik",    label: "Nama Pemilik",   type: "string",  isDimension: true,  isMeasure: false },
  { key: "kecamatan",       label: "Kecamatan",      type: "string",  isDimension: true,  isMeasure: false },
  { key: "jumlah_karyawan", label: "Jml. Karyawan",  type: "number",  isDimension: false, isMeasure: true  },
  { key: "kategori_skala",  label: "Skala",          type: "string",  isDimension: true,  isMeasure: false }
]
```

---

## 5. Strategy Contract (Interface Wajib `BaseStrategy.js`)

Setiap strategy **wajib** mengimplementasikan method berikut:

```js
// js/strategies/BaseStrategy.js
export class BaseStrategy {

  /** ID unik strategy — digunakan sebagai prefix ID record */
  get moduleId()   { throw new Error('moduleId() wajib diimplementasikan'); }

  /** Nama tampilan dataset */
  get moduleName() { throw new Error('moduleName() wajib diimplementasikan'); }

  /** Discriminator type — menentukan field geometry mandatory atau tidak */
  get dataType()   { throw new Error('dataType() wajib diimplementasikan'); }  // 'Point'|'Polygon'|'Tabular'

  /**
   * Konversi satu raw row → UnifiedRecord
   * INI adalah satu-satunya tempat yang boleh:
   *   - Cast tipe data (string → number)
   *   - Menghitung calculated fields
   *   - Membangun geometry.coordinates (SELALU dalam GeoJSON [lng, lat])
   *   - Membangun searchKey & tooltipHtml
   * @param {object} rawRow - baris mentah dari CSV/DuckDB
   * @param {string} source - 'indexeddb' | 'duckdb'
   * @returns {UnifiedRecord}
   */
  toUnifiedRecord(rawRow, source) { throw new Error('toUnifiedRecord() wajib diimplementasikan'); }

  /**
   * Definisi kolom untuk rendering tabel UI & konfigurasi pivot
   * @returns {ColumnDef[]}
   */
  getTableSchema() { throw new Error('getTableSchema() wajib diimplementasikan'); }

  // ── OPSIONAL — override jika strategy mendukung ──────────────────────

  /** Preset agregasi bawaan (untuk Tab Agregasi otomatis) */
  getPivotPresets() { return []; }

  /** Style polygon — hanya diimplementasikan jika dataType = 'Polygon' */
  getPolygonStyle() { return { color: '#3b82f6', fillOpacity: 0.15, weight: 2 }; }

  /** Nama cluster group Leaflet — hanya untuk type = 'Point' */
  getClusterGroup() { return this.moduleId; }
}
```

---

## 6. Bagaimana `store.js` Menggunakan Unified Record (Fix G1)

```js
// js/core/store.js
// store.js TIDAK PERLU TAHU apakah data dari IndexedDB atau DuckDB
// Karena hasilnya sama-sama UnifiedRecord[]

export const store = {

  /** Ambil halaman record — abstrak dari source */
  async getPage(moduleId, page, limit) {
    const meta = this._getDatasetMeta(moduleId);

    if (meta.source === 'indexeddb') {
      // Query IndexedDB dengan OFFSET/LIMIT
      return db.service.getPage(meta.idbStoreName, page * limit, limit);
    }

    if (meta.source === 'duckdb') {
      // Query DuckDB dengan SQL LIMIT/OFFSET
      const rows = await dbQuery(conn, `SELECT * FROM ${meta.duckdbTable} LIMIT ${limit} OFFSET ${page * limit}`);
      // Konversi ke UnifiedRecord menggunakan strategy yang sama
      const strategy = moduleRegistry.get(moduleId);
      return rows.map(row => strategy.toUnifiedRecord(row, 'duckdb'));
    }
  },

  /** Ambil semua koordinat Point untuk spatial index — abstrak dari source */
  async getAllCoordinates(moduleId) {
    const meta = this._getDatasetMeta(moduleId);

    if (meta.source === 'indexeddb') {
      return db.service.getAllCoords(meta.idbStoreName);  // baca langsung dari IDB
    }

    if (meta.source === 'duckdb') {
      // Ambil kolom koordinat dari DuckDB — efisien karena SELECT spesifik kolom
      const rows = await dbQuery(conn, `SELECT id, lng, lat FROM ${meta.duckdbTable}`);
      return rows.map(r => ({ id: r.id, coordinates: [r.lng, r.lat] }));
    }
  }
};
```

---

## 7. Ringkasan: Aturan Wajib Schema

| # | Aturan | Scope |
|---|---|---|
| 1 | Semua koordinat WAJIB `[lng, lat]` (GeoJSON) | Semua strategy, semua type |
| 2 | Konversi ke Leaflet `[lat, lng]` HANYA di `building-layer-manager.js` | Rendering layer only |
| 3 | Field `source` wajib ada — nilai `'indexeddb'` atau `'duckdb'` | Semua record |
| 4 | `id_region` WAJIB 16 digit string dengan padding nol, atau `null` | Semua strategy |
| 5 | Field `region` (parsed hierarchy) wajib diproduksi di strategy, bukan di filter layer | Strategy layer |
| 6 | `searchKey` wajib lowercase dan pre-computed saat produksi record | Semua strategy |
| 7 | `properties` wajib sudah di-cast ke tipe yang benar (number/boolean) | Worker/strategy |
| 8 | `geometry` wajib ada jika `type = 'Point'` atau `'Polygon'` | Spatial strategy |
| 9 | `tooltipHtml` boleh dihasilkan di strategy — tapi rendering-nya di `building-layer-manager.js` | Separation of concern |
| 10 | `store.js` TIDAK BOLEH membaca `source` untuk logika bisnis — hanya untuk routing ke service | Interface abstraction |
| 11 | Filter wilayah **wajib gunakan prefix-range IDB** jika `hasRegionId = true`, Ray-Casting hanya fallback | Filtering layer |

---

## 8. IDB Index Design

Untuk mengaktifkan prefix-range query, IndexedDB store harus membuat index pada `id_region`:

```js
// db.service.js — saat createObjectStore
store.createIndex('id_region', 'id_region', { unique: false });
// unique: false karena bisa ada banyak titik di satu wilayah yang sama
```

### Query Pattern Contoh

```js
// Filter semua bangunan di Kec. Mojoroto (prefix "3571001")
const range = IDBKeyRange.bound('3571001', '3571001\uffff');
index.getAll(range);

// Filter semua bangunan di Kel. tertentu (prefix "3571001002")
const range = IDBKeyRange.bound('3571001002', '3571001002\uffff');
index.getAll(range);

// Count per kecamatan (untuk dashboard agregasi)
const range = IDBKeyRange.bound('3571001', '3571001\uffff');
index.count(range);
```

### Tabel Index yang Dibutuhkan per IDB Store

| Index Name | Field | unique | Digunakan untuk |
|---|---|---|---|
| `id_region` | `id_region` | `false` | Prefix filter wilayah |
| `moduleId` | `moduleId` | `false` | Isolasi per dataset |
| `by_module_region` | `[moduleId, id_region]` | `false` | Filter wilayah dalam satu dataset spesifik |

> Compound index `by_module_region` penting agar query tidak mencampur record dari dataset berbeda yang kebetulan punya `id_region` yang sama.
