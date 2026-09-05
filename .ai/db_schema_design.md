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
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
        ┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐
        │   IndexedDB     │ │  DuckDB RAM  │ │  Supabase Cloud  │
        │   (Offline)     │ │  (Online)    │ │  (R/W Database)  │
        └────────┬────────┘ └──────┬───────┘ └────────┬─────────┘
                 └─────────────────┼──────────────────┘
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
| `source` | `'indexeddb' \| 'duckdb' \| 'supabase'` | Asal pipeline data |
| `moduleId` | `string` | ID strategy yang memproduksi record ini (e.g. `'wilkerstat'`) |
| `idsubsls` | `string \| null` | **[INDEXED]** 16 digit ID region unik BPS (`OOAABBBCCCDDDDEE`). `null` jika data tidak punya info wilayah |
| `region` | `RegionParts \| null` | Object identitas wilayah lengkap (`nmprov`, `kdprov`, `nmkab`, `kdkab`, `nmkec`, `kdkec`, `nmdesa`, `kddesa`, `nmsls`, `kdsls`, `idsubsls`, `kdsubsls`) |
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
  idsubsls: "3571001002000000",   // ← Top-level 16 digit ID region, di-index di IDB
  region: {                        // ← Pre-parsed 12 field identitas region
    kdprov:   "35",
    nmprov:   "Jawa Timur",
    kdkab:    "71",
    nmkab:    "Kota Kediri",
    kdkec:    "001",
    nmkec:    "Mojoroto",
    kddesa:   "002",
    nmdesa:   "Mojoroto",
    kdsls:    "0000",
    nmsls:    "Non SLS",
    kdsubsls: "00",
    idsubsls: "3571001002000000"
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

### 2c. Region Identity Schema — `idsubsls` & `region` (MANDATORY jika data berbasis wilayah BPS)

#### Field Identitas Wilayah (12 Field Wajib)

Setiap record yang berhubungan dengan region **wajib** memiliki 12 field identitas wilayah berikut:

| Field | Tipe | Deskripsi | Contoh / Detail |
|---|---|---|---|
| `kdprov` | `string` | Kode Provinsi (2 digit) | `"35"` |
| `nmprov` | `string` | Nama Provinsi | `"Jawa Timur"` |
| `kdkab` | `string` | Kode Kabupaten/Kota (2 digit) | `"71"` |
| `nmkab` | `string` | Nama Kabupaten/Kota | `"Kota Kediri"` |
| `kdkec` | `string` | Kode Kecamatan (3 digit) | `"001"` |
| `nmkec` | `string` | Nama Kecamatan | `"Mojoroto"` |
| `kddesa` | `string` | Kode Desa/Kelurahan (3 digit) | `"002"` |
| `nmdesa` | `string` | Nama Desa/Kelurahan | `"Mojoroto"` |
| `kdsls` | `string` | Kode SLS (4 digit) | `"0001"` |
| `nmsls` | `string` | Nama SLS | `"SLS 0001"` |
| `kdsubsls` | `string` | Kode Sub-SLS (2 digit) | `"01"` |
| `idsubsls` | `string` | 16 digit ID region unik (`OOAABBBCCCDDDDEE`) | `"3571001002000101"` |

---

#### Format `idsubsls` (16 Digit Unique Region ID)

```
Format: OOAABBBCCCDDDDEE  (16 digit, selalu string)

  OO    = Level 1 · Provinsi          (2 digit) --> kdprov
  AA    = Level 2 · Kota/Kabupaten    (2 digit) --> kdkab 
  BBB   = Level 3 · Kecamatan         (3 digit) --> kdkec 
  CCC   = Level 4 · Kelurahan/Desa    (3 digit) --> kddesa
  DDDD  = Level 5 · SLS               (4 digit) --> kdsls
  EE    = Level 6 · Sub-SLS           (2 digit) --> kdsubsls

Contoh Breakdown: 3571001002000101
  → OO   = 35             (Prov. Jawa Timur · kdprov="35")
  → AA   = 71             (Kota Kediri · kdkab="71")
  → BBB  = 001            (Kec. Mojoroto · kdkec="001")
  → CCC  = 002            (Kel. Mojoroto · kddesa="002")
  → DDDD = 0001           (SLS 0001 · kdsls="0001")
  → EE   = 01             (Sub-SLS 01 · kdsubsls="01")

Hierarki Prefix String:
  → 35                = Prov. Jawa Timur (kdprov="35")
  → 3571              = Kota Kediri (kdprov+kdkab)
  → 3571001           = Kec. Mojoroto
  → 3571001002        = Kel. Mojoroto
  → 35710010020001    = SLS 0001
  → 3571001002000101  = Sub-SLS 01 (idsubsls full)
```

#### Aturan Padding untuk Data Parsial

Jika data hanya diketahui sampai level tertentu, level di bawahnya **dipad dengan nol**:

| Data diketahui sampai | `idsubsls` |
|---|---|
| Provinsi saja | `3500000000000000` |
| Kota/Kabupaten | `3571000000000000` |
| Kecamatan | `3571001000000000` |
| Kelurahan | `3571001002000000` |
| SLS | `3571001002000100` |
| Sub-SLS (full) | `3571001002000101` |

> ⚠️ **Tidak boleh menggunakan string pendek/truncated** (e.g. `"3571001"`). Selalu 16 digit penuh dengan padding nol — ini memastikan `idsubsls` bisa di-prefix-query secara konsisten di IndexedDB.

#### Field `region` — Pre-Parsed Hierarchy & Identity

Field `region` memuat 12 field identitas wilayah dan prefix level hierarki untuk kemudahan filter UI:

```js
// helpers/region-parser.js — pure function, dipanggil oleh strategy
export function parseRegion(rawRegion) {
  const {
    idsubsls,
    nmprov = "", nmkab = "", nmkec = "", nmdesa = "", nmsls = ""
  } = rawRegion;

  if (!idsubsls || idsubsls.length !== 16) return null;

  const kdprov   = idsubsls.substring(0, 2);
  const kdkab    = idsubsls.substring(2, 4);
  const kdkec    = idsubsls.substring(4, 7);
  const kddesa   = idsubsls.substring(7, 10);
  const kdsls    = idsubsls.substring(10, 14);
  const kdsubsls = idsubsls.substring(14, 16);

  return {
    // 12 Field Identitas Wajib
    kdprov, nmprov,
    kdkab, nmkab,
    kdkec, nmkec,
    kddesa, nmdesa,
    kdsls, nmsls,
    kdsubsls,
    idsubsls,

    // Prefix Helpers untuk Hierarchical Query
    provPrefix: kdprov,                               // "35"
    kabPrefix:  kdprov + kdkab,                       // "3571"
    kecPrefix:  kdprov + kdkab + kdkec,               // "3571001"
    kelPrefix:  kdprov + kdkab + kdkec + kddesa,        // "3571001002"
    slsPrefix:  kdprov + kdkab + kdkec + kddesa + kdsls, // "35710010020001"
  };
}
```

#### Bagaimana `idsubsls` Mempercepat Filtering

Dengan `idsubsls` sebagai **indexed field di IndexedDB**, filter wilayah menggunakan **prefix-range query** — tanpa Ray-Casting:

```js
// db.service.js — filter by wilayah menggunakan IDBKeyRange
async function getByRegion(storeName, levelPrefix) {
  // Contoh: levelPrefix = "3571001" → ambil semua record di Kec. Mojoroto
  const range = IDBKeyRange.bound(
    levelPrefix,          // lower bound: "3571001"
    levelPrefix + '\uffff'  // upper bound: "3571001" + max char (prefix query)
  );
  return getAllFromIndex(storeName, 'idsubsls', range);
  // Hasil: O(log n) lookup via B-tree index ✅
  // Bukan: O(n) scan + Ray-Casting ❌
}
```

#### Strategi Filtering Dual-Mode

| Kondisi Data | Strategi Filter | Kecepatan |
|---|---|---|
| `idsubsls` tersedia (data BPS) | **Prefix-range query** via IDB index | ✅ O(log n) |
| `idsubsls = null` (data custom/upload) | **Ray-Casting** via `spatial.worker.js` | ⚠️ O(n) |

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

#### `idsubsls` pada Polygon Record

Untuk data **Polygon wilayah**, `idsubsls` adalah identitas polygon itu sendiri:

```js
// Polygon kecamatan Mojoroto:
{
  id: "wilayah-3571001000000000",
  type: "Polygon",
  idsubsls: "3571001000000000",  // ID polygon ini sendiri
  region: {
    kdprov: "35", nmprov: "Jawa Timur",
    kdkab: "71", nmkab: "Kota Kediri",
    kdkec: "001", nmkec: "Mojoroto",
    kddesa: "000", nmdesa: "-",
    kdsls: "0000", nmsls: "-",
    kdsubsls: "00",
    idsubsls: "3571001000000000"
  },
  ...
}
```

Ini memungkinkan join logis: **titik bangunan yang `region.kecPrefix === polygon.region.kecPrefix`** adalah titik yang berada di dalam polygon tersebut — tanpa perlu Ray-Casting sama sekali.

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
| 4 | `idsubsls` WAJIB 16 digit string (`OOAABBBCCCDDDDEE`) dengan padding nol, atau `null` | Semua strategy |
| 5 | Field `region` WAJIB memuat 12 field identitas (`nmprov`, `kdprov`, `nmkab`, `kdkab`, `nmkec`, `kdkec`, `nmdesa`, `kddesa`, `nmsls`, `kdsls`, `idsubsls`, `kdsubsls`) & prefix helpers | Strategy layer |
| 6 | `searchKey` wajib lowercase dan pre-computed saat produksi record | Semua strategy |
| 7 | `properties` wajib sudah di-cast ke tipe yang benar (number/boolean) | Worker/strategy |
| 8 | `geometry` wajib ada jika `type = 'Point'` atau `'Polygon'` | Spatial strategy |
| 9 | `tooltipHtml` boleh dihasilkan di strategy — tapi rendering-nya di `building-layer-manager.js` | Separation of concern |
| 10 | `store.js` TIDAK BOLEH membaca `source` untuk logika bisnis — hanya untuk routing ke service | Interface abstraction |
| 11 | Filter wilayah **wajib gunakan prefix-range IDB** jika `hasRegionId = true`, Ray-Casting hanya fallback | Filtering layer |

---

## 8. IDB Index Design

Untuk mengaktifkan prefix-range query, IndexedDB store harus membuat index pada `idsubsls`:

```js
// db.service.js — saat createObjectStore
store.createIndex('idsubsls', 'idsubsls', { unique: false });
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
| `idsubsls` | `idsubsls` | `false` | Prefix filter wilayah |
| `moduleId` | `moduleId` | `false` | Isolasi per dataset |
| `by_module_region` | `[moduleId, idsubsls]` | `false` | Filter wilayah dalam satu dataset spesifik |

> Compound index `by_module_region` penting agar query tidak mencampur record dari dataset berbeda yang kebetulan punya `idsubsls` yang sama.

---

## 9. Skema Tabel Cloud Annotation (Supabase PostgreSQL)

Entitas `annotations` disimpan secara terpisah di Supabase PostgreSQL untuk mencatat temuan/anotasi enumerator lapangan per titik bangunan.

### Database Schema Table: `public.annotations`

| Field | Tipe Data | Mandatory | Constraints / Default | Deskripsi |
|---|---|---|---|---|
| `id` | `UUID` | ✅ | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique ID anotasi |
| `record_id` | `TEXT` | ✅ | `NOT NULL` | Referensi ID `UnifiedRecord.id` (e.g. `"wilkerstat-B001"`) |
| `module_id` | `TEXT` | ✅ | `NOT NULL` | ID strategy sumber dataset (e.g. `"wilkerstat"`) |
| `idsubsls` | `VARCHAR(16)` | opsional | `NULL` | 16 digit ID region BPS untuk penyaringan wilayah |
| `enumerator_name` | `TEXT` | ✅ | `DEFAULT 'Anonim'` | Nama petugas enumerator |
| `catatan` | `TEXT` | ✅ | `NOT NULL` | Isi catatan / hasil verifikasi lapangan |
| `status` | `TEXT` | ✅ | `DEFAULT 'pending'` | Status anotasi (`'pending'`, `'verified'`, `'rejected'`) |
| `created_at` | `TIMESTAMPTZ` | ✅ | `DEFAULT NOW()` | Timestamp dibuat |
| `updated_at` | `TIMESTAMPTZ` | ✅ | `DEFAULT NOW()` | Timestamp terakhir diperbarui |

### SQL DDL Statement (Supabase Editor):

```sql
CREATE TABLE public.annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    idsubsls VARCHAR(16),
    enumerator_name TEXT DEFAULT 'Anonim',
    catatan TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing untuk query berkinerja tinggi
CREATE INDEX idx_annotations_record_id ON public.annotations(record_id);
CREATE INDEX idx_annotations_idsubsls ON public.annotations(idsubsls);

-- Row Level Security (RLS)
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read/write access" ON public.annotations FOR ALL USING (true) WITH CHECK (true);
```

