# Rencana Implementasi: Perbaikan Routing, Event-Driven State, & Marker Cluster

Rencana ini memaparkan langkah-langkah teknis untuk menyelaraskan aplikasi **Xplore 3571** dengan arsitektur SPA yang disepakati, mengimplementasikan reaktivitas berbasis event, serta meningkatkan performa pemuatan data spasial besar menggunakan Leaflet Markercluster.

---

## Proposed Changes

### 1. Leaflet Markercluster & Kontainer SPA

#### [MODIFY] [index.html](file:///p:/My%20Drive/%60NGODING%60/Web/xplore-3571/index.html)
* Tambahkan stylesheet & script **Leaflet.markercluster** via CDN di dalam `<head>`:
  * CSS: `https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css`
  * CSS Theme: `https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css`
  * JS: `https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js`
* Restrukturisasi kontainer halaman utama di dalam `<main>` agar mendukung 3 view SPA terpisah secara bersih menggunakan kelas Tailwind:
  * `<div id="view-map" class="w-full h-full">` (berisi `#map-container`)
  * `<div id="view-table" class="hidden w-full h-full p-4">` (tampilan tabulasi data explorer masa depan)
  * `<div id="view-dashboard" class="hidden w-full h-full p-4">` (tampilan ApexCharts dashboard masa depan)

---

### 2. Hash-Based Router

#### [NEW] [router.js](file:///p:/My%20Drive/%60NGODING%60/Web/xplore-3571/js/router.js)
* Implementasikan sistem router sederhana berbasis `window.location.hash`:
  * Rute yang didukung: `#map`, `#table`, `#dashboard`.
  * Lakukan toggle kelas `.hidden` pada kontainer view terkait.
  * Picu `MapEngine.resize()` otomatis saat berpindah kembali ke rute `#map` untuk mencegah peta menjadi abu-abu (blank).
  * Sinkronisasikan status aktif tombol navigasi di Navbar/Sidebar.

---

### 3. Event-Driven State Management

#### [MODIFY] [store.js](file:///p:/My%20Drive/%60NGODING%60/Web/xplore-3571/js/store.js)
* Pada akhir fungsi `processPolygonFile` dan `processBuildingFile`, picu Custom Event pada level `document`:
  * Event `app:polygon-changed` yang membawa data poligon terverifikasi.
  * Event `app:buildings-changed` yang membawa kumpulan data titik bangunan baru.

#### [MODIFY] [map.js](file:///p:/My%20Drive/%60NGODING%60/Web/xplore-3571/js/map.js)
* Tambahkan event listener di bagian bawah inisialisasi / modul peta:
  * Dengarkan event `app:polygon-changed` -> Panggil `renderPolygon()`.
  * Dengarkan event `app:buildings-changed` -> Panggil `renderBuilding()`.
* Integrasikan **Leaflet.markercluster**:
  * Ganti `L.featureGroup()` pada `buildingLayerGroups` dengan `L.markerClusterGroup({ chunkedLoading: true })` untuk rendering titik bangunan skala besar yang anti-lag.

#### [MODIFY] [ui.js](file:///p:/My%20Drive/%60NGODING%60/Web/xplore-3571/js/ui.js)
* Hapus pemanggilan render langsung (`MapEngine.renderPolygon` dan `MapEngine.renderBuilding`) dari fungsi internal `processPolygonFile` dan `processBuildingFile`. UI hanya bertugas me-load file dan memanggil Store; rendering diserahkan sepenuhnya secara reaktif kepada event listener di `map.js`.

#### [MODIFY] [app.js](file:///p:/My%20Drive/%60NGODING%60/Web/xplore-3571/js/app.js)
* Impor `js/router.js` dan panggil fungsi inisialisasi router setelah komponen Navbar & Sidebar selesai dimuat ke DOM.

---

## Verification Plan

### Manual Verification
1. Jalankan aplikasi secara lokal.
2. Unggah file Poligon Wilayah (GeoJSON): Pastikan poligon ter-render di peta dan filter wilayah dinamis muncul di sidebar.
3. Unggah file Titik Bangunan (CSV): Pastikan titik berkerumun (clustered) menggunakan markercluster saat di-zoom out, dan menyebar saat di-zoom in.
4. Ganti hash URL di address bar browser menjadi `/#table` atau `/#dashboard`: Pastikan tampilan berganti kontainer secara instan tanpa lag dan tanpa reload halaman.
5. Klik navigasi kembali ke `/#map`: Pastikan peta ter-render utuh (tidak abu-abu).
