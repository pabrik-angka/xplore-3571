Tentu, ini adalah file rencana arsitektur dan desain komprehensif (`plan.md`) untuk **Xplore 3571**. Rencana ini disusun secara modular dengan mematuhi semua prinsip teknik yang telah kita sepakati (SRP, KISS, DRY, Strategy Pattern, dan Mobile-First Design).

Anda bisa langsung menyalin berkas markdown di bawah ini sebagai _Single Source of Truth_ sebelum kita melangkah ke tahap penulisan kode.

````markdown
# Blueprint Rencana Arsitektur & Desain PWA: Xplore 3571

Dokumen ini berfungsi sebagai panduan arsitektur, struktur data, dan desain antarmuka untuk pengembangan aplikasi **Xplore 3571**—sebuah aplikasi PWA GIS murni _client-side_ yang responsif, modular, dan siap dikembangkan secara berkelanjutan.

---

## 1. Arsitektur Kode & Struktur Berkas

Aplikasi ini menggunakan pendekatan **Vanilla Web Development** murni memanfaatkan **Native ES6 Modules** langsung di browser tanpa bantuan _bundler_ atau _compiler_. Logika bisnis, manajemen data, manipulasi DOM, dan mesin peta dipisahkan secara tegas berdasarkan prinsip _Single Responsibility Principle_ (SRP).

```text
xplore-3571/
│
├── index.html              # Struktur DOM Semantik, Layout DaisyUI & Kontainer Peta
├── manifest.json           # Manifes PWA untuk instalasi aplikasi
├── sw.js                   # Service Worker untuk manajemen cache & kapabilitas offline
│
└── js/
    ├── app.js              # Entry Point: Orkestrator inisialisasi aplikasi
    ├── map.js              # Mesin GIS: Inisialisasi Peta, Layer Management, & Render Grafis
    ├── store.js            # Data Store: Fetching data (GeoJSON/CSV), Parser, & State Management
    ├── ui.js               # DOM Controller: Event Listener, Sinkronisasi State ke Komponen
    ├── components/
    │   ├── navbar.js
    │   ├── drawer.js
    │   ├── polygonModal.js
    │   └── buildingsModal.js
    │
    └── map-modules/                <-- Khusus Modul Strategi Atribut Data
        ├── wilkerstat-se2026.js
        ├── sourceAHandler.js
        ├── sourceBHandler.js
        └── sourceCHandler.js)
```
````

---

## 2. Rencana Manajemen Data (Data Layer Plan)

Untuk mengakomodasi perbedaan _behavior_ data antar-sumber yang dinamis dan dapat bertambah di kemudian hari, diimplementasikan **Strategy Pattern**.

```
[store.js] (Fetch GeoJSON/CSV)
       │
       ▼
[sourceRegistry.js] (Pilih Handler berdasarkan Source ID)
       │
       ├──► [sourceAHandler.js] ──► Output Standar (Koordinat + Tooltip HTML A)
       └──► [sourceBHandler.js] ──► Output Standar (Koordinat + Tooltip HTML B)
       │
       ▼
[map.js] (Render ke Peta secara seragam tanpa tahu asal-usul struktur asli data)

```

### Spesifikasi Logika Data (`store.js` & Handlers):

- **Fungsi `fetchData(url, type)**`: Mendukung pemuatan file `.geojson`dan`.csv`.
- **CSV to GeoJSON Parser**: Fungsi internal untuk mereduksi baris teks CSV yang memiliki kolom `latitude`, `longitude`, atau `lat`, `lng` menjadi objek data spasial internal yang seragam.
- **Interface Handler Standar**: Setiap berkas di dalam `data-handlers/` wajib mengimplementasikan fungsi `toLayerConfig(rawData)` yang mengembalikan skema data terpadu untuk dikonsumsi oleh `map.js`:
- `geometry`: Data spasial (titik koordinat atau array poligon).
- `tooltipHtml`: String HTML hasil kompilasi atribut spesifik sumber (Contoh Sumber A: properti a, b, c; Sumber B: properti a, d, e, f).

---

## 3. Rencana Mesin GIS (Map Layer Plan)

Mesin utama peta menggunakan **Leaflet.js** via CDN dengan spesifikasi kebutuhan sebagai berikut:

- **Dual Base Maps**:

1. _OpenStreetMap (OSM)_: Default peta jalanan standar yang ringan.
2. _Google Hybrid_: Citra satelit dengan overlay label jalan menggunakan tile URL `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}`.

- **Dukungan Zoom Maksimal**: Untuk mencegah masalah _blank screen_ (tile abu-abu) saat pengguna melakukan zoom-in ekstrem pada Google Hybrid, konfigurasi layer diatur dengan:
- `maxNativeZoom: 19` (Batas ketersediaan tile asli dari server provider).
- `maxZoom: 22` (Bantuan kompresi/perbesaran visual via kanvas Leaflet).

- **Layer Management**: Pemisahan `FeatureGroup` antara Layer Polygon Wilayah dan Layer Titik Bangunan agar proses `.clearLayers()` saat filter aktif dapat berjalan parsial tanpa mengganggu kestabilan _instance_ peta utama.

---

## 4. Desain Antarmuka & Responsivitas UI (DaisyUI v5 & Tailwind v4)

Desain mengedepankan **Lega Viewport** (ruang peta maksimal) dengan memanfaatkan komponen `Drawer` dari DaisyUI.

### Perilaku Responsif:

- **Desktop View**: Panel menu (Sidebar) menetap di sisi kiri layar dengan opsi tombol _collapse_ untuk menyembunyikannya secara penuh demi kelegaan area peta.
- **Mobile View**: Panel menu tersembunyi secara default. Muncul berupa lembaran _overlay drawer_ dari sisi kiri saat tombol burger menu di pojok kiri atas di-tap oleh pengguna.

### Hierarki Komponen Panel Menu:

1. **Header PWA**: Nama Aplikasi "Xplore 3571" + Indikator Status Jaringan (Online/Offline) memanfaatkan `badge` DaisyUI.
2. **Base Map Switcher**: Menggunakan `join` button atau `tabs` untuk perpindahan cepat antar-peta dasar.
3. **Polygon Region Manager**: Kontrol bertipe _checkbox_ untuk memuat, menampilkan, atau menyembunyikan poligon wilayah.
4. **Multi-Source Building Points Loader**: Input seleksi berupa _dropdown_ atau _radio group_ untuk memilih sumber data aktif sebelum mengeksekusi tombol _Load Data_.
5. **Dynamic Region Filter**: Menu seleksi bertingkat (Provinsi $\rightarrow$ Kota $\rightarrow$ Kecamatan) yang opsi pilihannya diisi secara dinamis oleh `ui.js` sesaat setelah data geojson wilayah berhasil dimuat ke memori.
6. **Fuzzy Search Building Bar**: Kotak pencarian berbasis teks yang terintegrasi dengan hasil daftar instan (_live result list_). Mengetuk salah satu hasil pencarian akan memicu peta untuk melakukan pergerakan halus (`.flyTo()`) langsung ke lokasi objek tersebut dan membuka tooltip informasinya.

---

## 5. Kapabilitas PWA & Penanganan Error

- **Offline Mode (`sw.js`)**: Mekanisme caching aset krusial web (`index.html`, berkas JS, CSS DaisyUI, serta aset ikon internal) untuk memastikan aplikasi tetap dapat dibuka tanpa koneksi internet. _Catatan: Tile peta eksternal hanya akan mengandalkan cache bawaan browser (HTTP cache)._
- **Rencana Defensif (Error Handling)**: Setiap proses kritis seperti `fetch` file eksternal dari repositori lokal/publik atau modifikasi `localStorage` wajib dibungkus dalam blok `try...catch` dengan format pencatatan log yang rapi: `console.error('[Nama Modul - Nama Fungsi Error]:', error)`.

---

## 6. Alur Kerja Implementasi Bertahap

Langkah pengerjaan akan dieksekusi secara bertahap untuk memastikan fondasi aplikasi stabil sebelum ditumpuk fitur baru:

- [ ] **Fase 1**: Penulisan manifes PWA, `sw.js`, dan pembuatan struktur dasar `index.html` (Layout Drawer, Container Map, CSS DaisyUI).
- [ ] **Fase 2**: Inisialisasi mesin GIS utama di `js/map.js` beserta konfigurasi dual base map dan penanganan batas zoom maksimal.
- [ ] **Fase 3**: Pembuatan modul core data parser `js/store.js` yang mendukung pembacaan format `.geojson` dan `.csv`.
- [ ] **Fase 4**: Implementasi arsitektur modul `js/map-modules/` untuk penanganan _Strategy Pattern_ multi-sumber data.
- [ ] **Fase 5**: Pembuatan pengontrol interaksi UI di `js/ui.js` untuk mengakomodasi fitur pencarian lokal, penyaringan dinamis tingkat wilayah, dan sinkronisasi status PWA.

```

---

Plan ini sudah mencakup seluruh aspek teknis yang Anda butuhkan. Jika tidak ada poin yang ingin dikoreksi dari berkas `plan.md` di atas, beri tahu saya agar kita bisa langsung mengeksekusi **Fase 1** (Pembuatan file `index.html` beserta struktur layout DaisyUI dan konfigurasi dasar PWA).

```
