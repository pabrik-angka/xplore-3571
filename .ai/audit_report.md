# Audit Arsitektur: Xplore 3571
**Auditor:** Senior Full-Stack Engineer (Strict Mode)
**Tanggal:** 2026-08-22
**Scope:** Architecture doc + actual codebase cross-check

---

## Ringkasan Eksekutif

Arsitektur Xplore 3571 secara konseptual **solid** — ada pemisahan concern yang jelas, EventBus yang terdokumentasi, dan strategi performa yang benar. Namun terdapat **gap serius antara dokumen BARU dan implementasi aktual**, ditambah beberapa celah teknis yang bisa menjadi bom waktu di skala besar.

---

## 🔴 CELAH KRITIS (Harus Diperbaiki)

### C1 — Arsitektur "BARU" Hanya di Atas Kertas, Implementasi Masih "LAMA"

**Bukti:**
```
Arsitektur dokumen "BARU" mendefinisikan:
  js/core/event-bus.js       ← TIDAK ADA di filesystem
  js/services/db.service.js  ← TIDAK ADA (masih js/db.js)
  js/modules/*.module.js     ← TIDAK ADA (masih js/store.js, js/map.js, dll)
  js/workers/parser.worker.js  ← TIDAK ADA (masih data-worker.js)
  js/workers/pivot.worker.js   ← TIDAK ADA
  js/workers/spatial.worker.js ← TIDAK ADA
  js/ui/ (folder)             ← TIDAK ADA (masih js/ui.js tunggal)
  assets/vendor/              ← TIDAK ADA (masih andalkan CDN remote)
```

**Dampak:** Dokumen architecture.md berfungsi sebagai *aspirational roadmap*, bukan *source of truth*. Ini menyebabkan cognitive overhead saat onboarding dan potensi keputusan coding yang salah berdasarkan dokumen usang.

**Rekomendasi:** Pisahkan dokumen menjadi `architecture-current.md` dan `architecture-target.md`, atau tambahkan status `[IMPLEMENTED]` / `[PLANNED]` per komponen.

---

### C2 — Pelanggaran Aturan EventBus: `document.dispatchEvent` Masih Dipakai di Orkestrator

**Bukti (store.js):**
```javascript
// store.js line 70 — MELANGGAR aturan EventBus
document.dispatchEvent(new CustomEvent('app:polygon-changed', { ... }));

// store.js line 148, 193, 204, 209, 217, 218, 307, 320, 363, 382, 390
document.dispatchEvent(new CustomEvent('store:loading', { ... }));
document.dispatchEvent(new CustomEvent('tabulation:changed', { ... }));
```

**Bukti (mapListener.js):**
```javascript
// mapListener.js line 33, 40, 48 — subscriber via document, bukan EventBus.on()
document.addEventListener('explore:flyto', ...);
document.addEventListener('app:polygon-changed', ...);
document.addEventListener('app:buildings-changed', ...);
```

**Dampak:** EventBus yang didokumentasikan di Section 4 **tidak diimplementasikan sama sekali**. Seluruh sistem komunikasi antar-modul masih via Custom DOM Events — tidak traceable, tidak ada `off()` cleanup, rawan memory leak dari listener yang terus menumpuk.

**Celah spesifik:** `store.js` melakukan `import('./map.js')` **secara dinamis di dalam loop CHUNK handler** (line 200). Ini berarti setiap chunk data mentrigger dynamic import — meskipun browser cache-nya, ini pola yang rapuh dan tidak efisien.

---

### C3 — Memory Leak Potensial: Worker Tidak Punya Timeout/Abort

**Bukti (store.js):**
```javascript
// store.js line 153
const worker = new Worker('./js/workers/data-worker.js');
// ... tidak ada AbortController, tidak ada timeout
// worker.terminate() hanya dipanggil di COMPLETE dan ERROR
```

**Dampak:** Jika user menutup tab, navigasi pergi, atau network timeout terjadi selama parsing — worker terus hidup di background tanpa cleanup. Untuk file 1juta+ baris ini sangat bermasalah.

**Rekomendasi:**
```javascript
// Tambahkan timeout guard
const timeoutId = setTimeout(() => {
  worker.terminate();
  reject('Worker timeout — file terlalu besar atau proses hang.');
}, 5 * 60 * 1000); // 5 menit

worker.onmessage = (e) => {
  if (msg.type === 'COMPLETE') {
    clearTimeout(timeoutId);
    worker.terminate();
    resolve(...);
  }
};
```

---

### C4 — SQL Injection via String Interpolasi di `duckdb.service.js`

**Bukti (architecture.md, Section 5.2):**
```javascript
// KODE BERBAHAYA — password di-inject langsung ke SQL string
await conn.query(`ATTACH 'secure.duckdb' AS secure_db (ENCRYPTION_KEY '${password}');`);
```

**Dampak:** Meskipun ini client-side dan "security realism" sudah didokumentasikan, jika password mengandung karakter `'` (single quote), query akan crash atau bisa dimanipulasi untuk menjalankan SQL arbitrary. Contoh: password `a'; DROP TABLE bangunan; --` akan merusak query.

**Rekomendasi:** Sanitasi password sebelum interpolasi:
```javascript
const safePassword = password.replace(/'/g, "''"); // SQL escape
await conn.query(`ATTACH 'secure.duckdb' AS secure_db (ENCRYPTION_KEY '${safePassword}');`);
```

---

### C5 — GeoJSON Diparsing di Main Thread, Bukan Worker

**Bukti (store.js line 32–87):**
```javascript
// processPolygonFile() menggunakan FileReader di Main Thread
const reader = new FileReader();
reader.onload = (e) => {
  const geojsonData = JSON.parse(e.target.result); // ← di main thread
  // ... proses ribuan feature di main thread
};
```

**Dampak:** Untuk polygon wilayah kabupaten/kota dengan ribuan koordinat (file GeoJSON >5MB), `JSON.parse()` di main thread akan **membekukan UI** selama beberapa detik. Ini bertentangan dengan prinsip "60 FPS" yang didokumentasikan.

**Rekomendasi:** `processPolygonFile` harus didelegasikan ke Worker, mirip seperti `processBuildingFile`.

---

## 🟡 CELAH SEDANG (Perlu Perhatian)

### M1 — `searchBuildings()` O(n×m) — Tidak Skalabel

**Bukti (store.js line 264–288):**
```javascript
searchBuildings(keyword) {
  // Linear scan seluruh activeBuildingData
  this.activeBuildingData.forEach(layerSet => {
    layerSet.points.forEach((pt, index) => { // ← O(n) per layer
      if (pt.config.searchKeyword && pt.config.searchKeyword.includes(kw)) { ... }
    });
  });
}
```

**Dampak:** 500.000 titik bangunan = 500.000 string `.includes()` per keystroke. Ini akan hang browser bahkan dengan debounce 300ms.

**Rekomendasi:** Bangun inverted index atau Trie saat data selesai di-load. Gunakan `spatial.worker.js` untuk pencarian teks background.

---

### M2 — `loadStoredDatasets()` Tidak Me-restore `handler` dari IndexedDB

**Bukti (store.js line 387–394):**
```javascript
for (const bSet of storedBuildings) {
  this.activeBuildingData.push(bSet); // ← bSet dari IndexedDB tidak punya .handler (tidak serializable)
  document.dispatchEvent(new CustomEvent('app:buildings-changed', {
    detail: { buildingLayerSet: bSet }
  }));
}
```

**Dampak:** Class/object handler (dengan method `toLayerConfig()`, `getMarkerOptions()`, dll) tidak bisa di-serialize ke IndexedDB. Saat app di-restore dari offline cache, `bSet.handler` akan `undefined` atau `null`. Ini akan menyebabkan error silent di `map.js` saat mencoba render ulang titik.

**Rekomendasi:** Simpan `handler.id` (string) ke IndexedDB, lalu resolve kembali ke object handler via `moduleRegistry` saat hydrate.

---

### M3 — `data-worker.js` Masih Load PapaParse via `importScripts` CDN Remote

**Bukti (data-worker.js line 16):**
```javascript
importScripts('https://unpkg.com/papaparse@5.4.1/papaparse.min.js');
```

**Dampak:** Worker gagal total jika offline. Ini bertentangan dengan strategi "True Offline-First" yang didokumentasikan di Section 9.1. Vendor-local CDN sudah direncanakan tapi tidak diaplikasikan ke worker.

---

### M4 — Inkonsistensi Koordinat: Leaflet `[lat, lng]` vs GeoJSON `[lng, lat]`

**Bukti (architecture.md, Schema bangunan vs polygon):**
```javascript
// Point: coordinates: [-7.8123, 112.0123]  ← [lat, lng] (Leaflet format)
// Polygon: coordinates: [ [ [112.01, -7.81] ] ] ← [lng, lat] (GeoJSON standard)
```

**Dampak:** Konvensi yang berbeda di dua schema ini adalah sumber bug yang sangat sulit di-debug. Developer baru (atau AI assistant) akan salah menginterpretasi koordinat.

**Rekomendasi:** Standardkan SEMUA koordinat internal ke GeoJSON standard `[lng, lat]`, lalu lakukan konversi ke `[lat, lng]` hanya di layer Leaflet saat render.

---

### M5 — `tabContext.rawData` Disimpan ke RAM dengan Copy-by-Reference Semua Chunk

**Bukti (store.js line 183):**
```javascript
tabContext.rawData.push(...tableRowsBatch);
```

**Dampak:** Untuk 1 juta baris, `tabContext.rawData` di RAM tumbuh sebesar keseluruhan dataset. Ini bertentangan dengan prinsip "RAM hanya menyimpan subset aktif" yang didokumentasikan di Section 3. IndexedDB dipakai untuk persistence tapi raw data tetap di-keep di RAM.

---

## 🟢 TITIK PENGEMBANGAN (Peluang)

### P1 — Implementasi `EventBus` (js/core/event-bus.js) → Prioritas Tinggi

EventBus sudah terdokumentasi lengkap dengan implementasi kode, Event Contract, dan aturan. Ini adalah **refactor dengan ROI paling tinggi** karena langsung menggantikan semua `document.dispatchEvent` yang tersebar dan menambah traceability debug.

**Langkah konkret:**
1. Buat `js/core/event-bus.js` (kode sudah ada di docs)
2. Ganti `document.dispatchEvent(new CustomEvent(X))` → `EventBus.emit(X)`
3. Ganti `document.addEventListener(X)` → `EventBus.on(X)` di semua listener

---

### P2 — Pecah Worker Monolitik → 3 Dedicated Workers

Saat ini `data-worker.js` melakukan parsing + transformasi. Arsitektur target mendefinisikan 3 worker terpisah:
- `parser.worker.js` — PapaParse stream + IndexedDB bulk write
- `pivot.worker.js` — Aggregasi pivot, terpisah dari UI thread
- `spatial.worker.js` — Flatbush/RBush index + BBOX query

**Impact:** Pivot calculation saat ini terjadi di main thread (lihat `js/pivot.js` 107 bytes — placeholder?). Memindahkan pivot ke worker akan menghilangkan freeze saat kalkulasi dataset besar.

---

### P3 — Implementasi Virtual Scrolling untuk Tabel

Arsitektur mendokumentasikan paginasi 50–100 baris. Namun `tabContext.rawData` berisi seluruh data di RAM. Peluang: implementasi **virtual scrolling** (IntersectionObserver-based) untuk render hanya baris yang terlihat — eliminasi paginasi tradisional yang perlu tombol navigasi.

---

### P4 — Offline Search Index (Fuse.js atau Custom Trie)

Gantikan `searchBuildings()` linear scan dengan:
- **Option A:** Fuse.js (fuzzy search, ~24KB, bisa di-vendor-local)
- **Option B:** Custom inverted index dibangun di `spatial.worker.js` saat load selesai

---

### P5 — Service Worker Cache Versioning + Update Flow

**Celah saat ini di `sw.js` (1.2KB — sangat minimal):** Tidak ada mekanisme auto-invalidation saat app di-update. User yang sudah cache versi lama tidak akan mendapat update sampai manual clear cache.

**Rekomendasi:** Implementasi `SKIP_WAITING` + `CLIENTS.CLAIM` + cache versioning dengan hash nama file (misal: `app.v2.0.1.js`).

---

### P6 — DuckDB-WASM Mode: Loading UX Problem

File `.duckdb` terenkripsi bisa sangat besar (>50MB untuk dataset penuh). Saat ini tidak ada:
- Progress bar download (hanya single `fetch()`)
- Cancel/abort mechanism
- Estimasi ukuran sebelum download

**Rekomendasi:** Gunakan `fetch` dengan `ReadableStream` + `Content-Length` header untuk progress bar download DuckDB file.

---

### P7 — `config.js` Saat Ini Sangat Minimal

**Bukti (`config.js` — 337 bytes):** Hanya berisi konstanta dasar. Potensi sentralisasi:
- Tile layer URLs (saat ini hardcoded di map.js?)
- IndexedDB store names dan quota limits
- Worker chunk sizes
- Pagination default sizes
- DuckDB file URLs per dataset

---

## 📊 Scorecard Audit

| Dimensi | Nilai | Keterangan |
|---|---|---|
| **Konsistensi Dok ↔ Kode** | 4/10 | Arsitektur "BARU" belum diimplementasikan |
| **Kepatuhan Aturan EventBus** | 2/10 | `document.dispatchEvent` masih dominan |
| **Memory Safety** | 5/10 | Worker timeout hilang, rawData di RAM |
| **Offline-First Readiness** | 5/10 | PapaParse masih CDN remote di worker |
| **Keamanan** | 6/10 | SQL injection risk pada password input |
| **Skalabilitas** | 5/10 | Linear search, rawData di RAM |
| **Arsitektur Konseptual** | 8/10 | Sangat solid di level design |
| **SRP / DRY Adherence** | 7/10 | Cukup baik, beberapa pelanggaran di store.js |

---

## Prioritas Perbaikan

| Prioritas | Item | Effort |
|---|---|---|
| 🔴 P0 | C2: Implementasi EventBus (ganti document events) | Medium |
| 🔴 P0 | C5: Pindah polygon parsing ke Worker | Low |
| 🔴 P0 | C3: Worker timeout/abort | Low |
| 🟡 P1 | M2: Handler restore dari IndexedDB via registry | Medium |
| 🟡 P1 | M3: Vendor-local PapaParse di worker | Low |
| 🟡 P1 | C4: Sanitasi SQL password | Low |
| 🟢 P2 | P2: Pecah menjadi 3 workers | High |
| 🟢 P2 | P5: SW cache versioning | Medium |
| 🟢 P3 | P1: EventBus full migration | High |
