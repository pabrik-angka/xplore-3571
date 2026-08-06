# Arsitektur Sistem: Xplore 3571

Dokumen ini mendefinisikan arsitektur teknis, pola desain, aliran data, dan struktur navigasi untuk aplikasi **Xplore 3571**—sebuah PWA GIS murni *client-side* berbasis Single Page Application (SPA).

---

## 1. Desain Arsitektur Utama (Client-Side SPA)

Aplikasi dideploy pada **GitHub Pages** (Hosting Statis) tanpa server backend. Semua pemrosesan data, rendering spasial, tabulasi, dan pembuatan grafik dashboard diselesaikan secara lokal di browser pengguna.

### Diagram Arsitektur Komponen (Multithreaded SPA):
```mermaid
graph TD
    UI[index.html & js/ui.js] -->|Mengatur Tampilan View| Router[Hash Router #map, #table, #dashboard]
    UI -->|Trigger File Upload| DataWorker[Web Worker: js/workers/data-worker.js]
    
    subgraph Dedicated Web Worker Thread (Background Processing)
        DataWorker -->|PapaParse / GeoJSON Parse| DataWorker
        DataWorker -->|Transform toTableRows & toLayerConfig| DataWorker
        DataWorker -->|Save Offline Cache| IndexedDB[StorageDB: IndexedDB]
    end

    subgraph Main UI Thread (60 FPS Rendering)
        DataWorker -->|postMessage: Progress %| UI
        DataWorker -->|postMessage: Processed Batch Data| Store[js/store.js]
        
        Store -->|Batch Yielding| MapView[View Spasial: Leaflet.js]
        Store -->|Batch Yielding| TableView[View Tabulasi: DaisyUI Table]
        Store -->|Aggregated Data| DashboardView[View Dashboard: ApexCharts.js]
    end

    Router --> MapView
    Router --> TableView
    Router --> DashboardView
```

### Prinsip Utama Arsitektur Orchestrator:
> **`js/ui.js`**, **`js/table.js`**, **`js/store.js`**, dan **`js/map.js`** **HANYA BERPERAN SEBAGAI ORKESTRATOR SAJA.**
> Modul Orkestrator dilarang berisi fungsi pembantu matematika murni atau manipulasi DOM langsung secara independen. Seluruh fungsi logika murni dipisahkan ke `js/helpers/` (SRP & DRY), dan seluruh antarmuka komponen UI/Modal dipisahkan ke `js/components/`.
>
> **`js/listenerManager.js`** adalah **satu-satunya titik registrasi** untuk seluruh global event listener aplikasi.
> Setiap listener yang berkaitan dengan domain tertentu dipisahkan ke file helper di `js/helpers/listeners/`.
> Tidak ada module-level event listener yang boleh ditulis langsung di dalam orkestrator (ui.js, map.js, store.js, dst).

---

## 2. Struktur Berkas (File Structure)

```text
xplore-3571/
│
├── index.html              # Entry point utama, kontainer layout (SPA Views) & CDN Loader
├── manifest.json           # Konfigurasi PWA (Web App Manifest)
├── sw.js                   # Service Worker (Caching offline aset inti)
│
├── components/             # HTML Templates (Termasuk Navbar & Sidebar Drawer)
│   ├── navbar.html
│   ├── sidebar.html
│   └── table-drawer.html   # Drawer tabulasi yang muncul di halaman spasial
│
└── js/
    ├── app.js              # Inisialisasi awal aplikasi & PWA Service Worker
    ├── router.js           # Hash-based router untuk navigasi antar-view
    ├── store.js            # [ORKESTRATOR] Data State Orchestrator
    ├── db.js               # IndexedDB Storage Helper (PWA Offline Caching)
    ├── map.js              # [ORKESTRATOR] GIS Map Canvas Orchestrator
    ├── table.js            # [ORKESTRATOR] DaisyUI Table View Orchestrator
    ├── dashboard.js        # [ORKESTRATOR] Dashboard View Orchestrator
    ├── ui.js               # [ORKESTRATOR] General UI Event Orchestrator
    ├── moduleRegistry.js   # Registry untuk mendaftarkan handler titik bangunan, polygon wilayah, data tabulasi
    ├── listenerManager.js  # [ORKESTRATOR] Titik registrasi tunggal semua global event listener
    │
    ├── helpers/            # Helper Fungsi Murni (Pure Logic & Math) - DRY & SRP
    │   ├── pivot.js                 # Engine kalkulasi pivot table (COUNT, SUM, AVG, MIN, MAX)
    │   ├── spatial-filter.js        # Math engine Ray-Casting & Fast Bounding Box Pruning
    │   ├── formatters.js            # Helper format angka, teks, dan sanitasi data
    │   ├── resetSpatialFilter.js    # Helper reset DOM dropdown filter wilayah
    │   ├── SpatialFilterManager.js  # Class filter spasial dinamis berbasis konfigurasi hierarki
    │   ├── building-layer-manager.js # Helper manajemen layer titik bangunan Leaflet
    │   ├── filter-index.js          # Helper pembangunan dan pencarian pohon indeks filter wilayah
    │   └── listeners/               # Domain-specific event listener helpers
    │       ├── mapListener.js       # Handler: app:polygon-changed, app:buildings-changed, explore:flyto
    │       └── storeListener.js     # Handler: store:loading, store:toast
    │
    ├── workers/            # Dedicated Web Workers untuk background data processing
    │   └── data-worker.js  # Dedicated Worker: Pure Parsing CSV/GeoJSON → raw data ke Main Thread
    │
    ├── components/         # Komponen UI JS Modular (Modal, Toast & Builders)
    │   ├── toast.js        # Toast notifikasi & loading indicator
    │   ├── modal.js        # Modal upload spatial file
    │   ├── pivot-modal.js  # Modal builder custom pivot table
    │   ├── search.js       # Komponen pencarian titik bangunan lintas layer
    │   └── confirm-modal.js # Modal konfirmasi update/overwrite data
    │
    └── data-modules/       # Handler modular untuk strategy pattern parsing data
        ├── template-tabulasi.js
        ├── wilkerstat-se2026.js
        ├── fasih-se2026.js
        ├── sentra-ekonomi.js
        └── usaha-suplemen.js
```

---

## 3. Router Berbasis Hash (`js/router.js`)

Untuk memberikan pengalaman halaman terpisah tanpa kehilangan state data di memori, navigasi menggunakan sistem hash:
- `index.html#map` atau `/#map` : Tampilan Peta Spasial (Full screen GIS).
- `index.html#table` atau `/#table` : Tampilan Tabulasi Data (Grid & Filter).
- `index.html#dashboard` atau `/#dashboard` : Tampilan Dashboard (Statistik & Grafik).

### Cara Kerja Router:
1. Saat aplikasi dimuat, `router.js` membaca `window.location.hash` (default ke `#map`).
2. Sembunyikan semua elemen kontainer view (`<div id="view-map">`, dsb) dengan kelas utility DaisyUI/Tailwind `hidden`.
3. Tampilkan view aktif dengan menghapus kelas `hidden` dan berikan animasi transisi halus.
4. Perbarui status tombol navigasi aktif pada Navbar/Sidebar.

---

## 4. Listener Manager (`js/listenerManager.js`)

`listenerManager.js` adalah **satu-satunya titik registrasi** untuk seluruh global `document.addEventListener()` di aplikasi.
Dipanggil sekali oleh `app.js` setelah MapEngine dan UI siap.

### Aturan Wajib:
> Tidak boleh ada module-level `document.addEventListener()` di dalam file orkestrator (`map.js`, `ui.js`, `store.js`, dst).
> Semua listener harus didaftarkan melalui `listenerManager.js`.

### Struktur Helper Listener:
```text
js/helpers/listeners/
  ├── mapListener.js    ← app:polygon-changed, app:buildings-changed, explore:flyto
  └── storeListener.js  ← store:loading, store:toast
```

### Event Contract (Peta Event Aplikasi):

| Event Name | Pengirim | Penerima | Payload |
|---|---|---|---|
| `app:polygon-changed` | `store.js` | `mapListener.js` | `{ polygonData, handler, filterMetadata }` |
| `app:buildings-changed` | `store.js` | `mapListener.js` | `{ buildingLayerSet }` |
| `explore:flyto` | `table.js` | `mapListener.js` | `{ lat, lng }` |
| `store:loading` | `store.js` | `storeListener.js` | `{ show, text, percent }` |
| `store:toast` | `store.js` | `storeListener.js` | `{ message, type }` |
| `tabulation:changed` | `store.js` | `table.js` | `{ activeTabId, action }` |
| `app:modules-changed` | `moduleManager.js` | `ui.js` | `{ modules, capabilities }` |

---

## 5. Aliran & Manajemen Data (`js/store.js`)

Keamanan data terjaga karena **seluruh data tetap berada di memori RAM browser selama sesi aktif**.

1. **Upload / Input:** Pengguna mengunggah berkas (CSV / GeoJSON) melalui antarmuka UI.
2. **Parsing & Standardisasi (Strategy Pattern):**
   - `store.js` membaca file dan meneruskannya ke `moduleRegistry.js`.
   - Registry mencocokkan tipe data dengan handler yang sesuai di `data-modules/`.
   - Handler mengembalikan format objek seragam (*Unified Schema*):
     ```javascript
     // A. Format Unified Schema untuk Titik Bangunan (Point)
    {
      id: "bldg-101",
      type: "Point",
      coordinates: [-7.8123, 112.0123], // Format Leaflet: [lat, lng]
      properties: { 
        id_bangunan: "B-001",
        nama_pemilik: "Toko Utama", 
        alamat: "Jl. Pemuda No. 1",
        kecamatan: "Mojoroto" 
      },
      // Daftar kolom spesifik yang didaftarkan sebagai acuan pencarian
      searchFields: ["nama_pemilik", "alamat", "id_bangunan"],
      // String siap pakai (di-generate parser saat upload demi performa anti-lag)
      searchKey: "toko utama jl. pemuda no. 1 b-001", 
      tooltipHtml: "<strong>Toko Utama</strong><br>Jl. Pemuda No. 1"
    }

    // B. Format Unified Schema untuk Poligon Wilayah (Polygon)
    {
      id: "poly-357101",
      type: "Polygon",
      geometry: {
        type: "Polygon",
        coordinates: [ [ [112.01, -7.81], [112.02, -7.81], [112.02, -7.82], [112.01, -7.81] ] ] // GeoJSON [lng, lat]
      },
      properties: { 
        kode_wilayah: "357101", 
        nama_wilayah: "Mojoroto" 
      },
      searchFields: ["nama_wilayah", "kode_wilayah"],
      searchKey: "mojoroto 357101",
      tooltipHtml: "<strong>Kec. Mojoroto</strong>"
    }
     ```
3. **Penyimpanan State:** Data seragam disimpan dalam variabel global modul `store.js` (misalnya `const appState = { buildings: [], polygons: [] }`).
4. **Distribusi:** Modul `map.js`, `table.js`, dan `dashboard.js` memanggil `store.getData()` untuk memperbarui visualisasi masing-masing tanpa perlu melakukan parser ulang.

---

### 5.1 Pemisahan Thread Sempurna (Main UI Thread vs Dedicated Data Worker Thread)

Untuk menjamin UI browser tetap **Smooth 60 FPS (bebas freeze/lag)** saat pengguna mengunggah file data raksasa (50.000–500.000 baris):

1. **Dedicated Data Web Worker (`js/workers/data-worker.js`):**
   * **Scope & Responsibility:** Berjalan 100% di background thread terpisah.
   * **Beban Kerja:** File reading (`FileReader`), PapaParse CSV streaming parsing, GeoJSON parsing, komputasi transformasi `toTableRows` & `toLayerConfig`, penentuan koordinat valid, pembuatan string pencarian (`searchKeyword`), serta penyimpanan offline caching ke `IndexedDB`.
   * **Komunikasi:** Mengirim pesan `postMessage` bertahap per-batch (misal 5.000 baris/tick) ke Main Thread:
     - `{ type: 'progress', percent, totalParsed }`
     - `{ type: 'chunk', pointsBatch, tableRowsBatch, isFirstBatch }`
     - `{ type: 'complete', totalParsed, layerId }`

2. **Main UI Thread (Rendering Only):**
   * **Scope & Responsibility:** HANYA menangani event listener UI, animasi penanda Leaflet, rendering DaisyUI Table, dan pembaruan persentase Progress Bar Toast.
   * **Micro-Yielding (`requestAnimationFrame`):** Penyuntikan batch marker ke Leaflet dibungkus dengan `requestAnimationFrame` agar browser memiliki jeda waktu untuk menggambar ulang frame UI (*repaint/layout*) tanpa membekukan thread utama.

---

## 6. Integrasi Fitur Spesifik

### A. Drawer Tabulasi di Halaman Spasial
Halaman Spasial (`#map`) memiliki tombol melayang (*floating button*) untuk membuka lembaran drawer dari kanan/bawah (`table-drawer.html`). Drawer ini memanggil sub-modul dari `table.js` untuk me-render tabel mini berisi data ringkas dari titik yang ada pada cakupan peta saat itu.

### B. Sinkronisasi Aksi (Cross-View Interaction)
* **Peta Ke Tabel:** Mengklik pin di peta dapat memicu aksi untuk menyorot (*highlight*) baris data yang bersangkutan di halaman tabulasi (`#table`).
* **Tabel Ke Peta:** Mengklik baris pada halaman tabulasi akan otomatis memindahkan view ke `#map`, melakukan pergerakan halus (`.flyTo()`), dan membuka popup info di koordinat tersebut.

---

## 7. Mekanisme Reaktivitas State (`Store Events`)

Untuk menjaga koordinasi sinkronisasi antar-pilar tanpa framework eksternal, digunakan pola Event-Driven:
1. Setelah data berhasil di-upload, di-parse, dan disimpan di `store.js`, modul memicu Custom Event pada level `document`:
   ```javascript
   document.dispatchEvent(new CustomEvent('app:data-changed', { 
     detail: { type: 'buildings', data: store.getData('buildings') } 
   }));
   ```
2. Modul `map.js`, `table.js`, dan `dashboard.js` mendaftarkan listener untuk merespons perubahan secara otomatis:
   ```javascript
   document.addEventListener('app:data-changed', (e) => {
     if (e.detail.type === 'buildings') {
       // Render ulang komponen masing-masing
     }
   });
   ```

---

## 8. Strategi Performa Skala Besar (Anti-Lag & Responsif)

Ketika aplikasi memproses puluhan ribu baris data secara *client-side*, performa browser akan menurun drastis jika DOM dimanipulasi secara berlebihan. Berikut adalah panduan performa:

### ⚠️ DOs (Lakukan Ini):
* **Peta (GIS):**
  * Gunakan **Leaflet.markercluster** untuk menggabungkan ribuan marker titik menjadi cluster dinamis berdasarkan zoom level. Ini mengurangi beban elemen DOM di browser.
  * Aktifkan opsi `preferCanvas: true` pada inisialisasi peta Leaflet. Poligon wilayah akan di-render menggunakan satu elemen HTML5 Canvas, bukan ratusan tag SVG terpisah.
* **Tabulasi (Tabel):**
  * Terapkan **Paginasi Ketat** (maksimal 50–100 baris per halaman) atau **Virtual Scrolling** saat merender data. Jangan pernah menampilkan seluruh data ke DOM tabel sekaligus.
  * Gunakan `DocumentFragment` ketika me-render ulang baris tabel secara dinamis guna meminimalkan *reflow/repaint* browser.
* **Pencarian & Filter:**
  * Gunakan teknik **Debouncing** (tunda pencarian selama 300ms setelah pengetikan terakhir) pada input fuzzy search untuk mencegah overload pemrosesan regex di RAM.
* **Dashboard (Grafik):**
  * Lakukan **Agregasi Data** di `store.js` sebelum dikirim ke ApexCharts (contoh: hitung jumlah bangunan per kecamatan terlebih dahulu, lalu kirim hasil agregat ke chart). Jangan plot data mentah individual ke chart.

### 🚫 DONTs (Jangan Lakukan Ini):
* **Jangan** merender ribuan elemen penanda (`L.marker`) secara mentah di Leaflet tanpa clustering atau canvas renderer.
* **Jangan** menulis ulang/mereset seluruh isi DOM tabel (`table.innerHTML = ...`) berulang kali pada setiap ketikan karakter pencarian tanpa *debounce*.
* **Jangan** melakukan operasi pencarian berat langsung pada data mentah saat pengguna masih mengetik aktif (*real-time keypress* tanpa delay).
* **Jangan** menyimpan data spasial GeoJSON yang sangat besar di `localStorage` karena batas ukuran `localStorage` hanya 5MB dan bersifat sinkronus (memblokir UI thread). Gunakan memori RAM (variabel JS) atau **IndexedDB**.

---

## 9. Batasan PWA Offline
* **Cache Statis (Offline Aman):** Berkas kode HTML, CSS DaisyUI, JS utama, manifest, dan ikon internal di-cache secara permanen oleh `sw.js`. Aplikasi bisa dibuka tanpa internet.
* **Map Tiles (Online Diperlukan):** Tile gambar peta dasar (OSM dan Google Satellite) tidak di-cache oleh Service Worker untuk menghindari kuota penyimpanan penuh. Pengguna memerlukan internet untuk memuat visual peta baru.

---

## 10. Stack Teknologi & CDN

Untuk mendukung performa tinggi pada GitHub Pages tanpa build-step:
* **CSS Framework:** DaisyUI v5 (melalui CDN) + Tailwind CSS v4 (Browser compiler via CDN).
* **GIS Engine:** Leaflet.js v1.9.4 (CDN) + Leaflet.markercluster (untuk performa ribuan titik bangunan).
* **Visualisasi:** ApexCharts.js v6 (CDN) untuk dashboard grafik yang responsif.
* **PWA Capability:** Native Service Worker (`sw.js`) dengan strategi Cache-First untuk aset statis lokal.
