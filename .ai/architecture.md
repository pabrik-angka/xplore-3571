# Arsitektur Sistem: Xplore 3571

Dokumen ini mendefinisikan arsitektur teknis, pola desain, aliran data, dan struktur navigasi untuk aplikasi **Xplore 3571**—sebuah PWA GIS murni *client-side* berbasis Single Page Application (SPA).

---

## 1. Desain Arsitektur Utama (Client-Side SPA)

Aplikasi dideploy pada **GitHub Pages** (Hosting Statis) tanpa server backend. Semua pemrosesan data, rendering spasial, tabulasi, dan pembuatan grafik dashboard diselesaikan secara lokal di browser pengguna.

### Diagram Arsitektur Komponen:
```mermaid
graph TD
    UI[index.html & js/ui.js] -->|Mengatur Tampilan View| Router[Hash Router #map, #table, #dashboard]
    UI -->|Trigger Upload/Filter| Store[js/store.js]
    
    subgraph Data Layer
        Store -->|Pilih Handler| SourceReg[js/sourceRegistry.js]
        Store -->|Pilih Handler Poligon| PolyReg[js/polygonRegistry.js]
        SourceReg -->|Eksekusi Parsing| Handlers[js/map-modules/*Handler.js]
    end

    subgraph Views (Views Switcher)
        MapView[View Spasial: Leaflet.js]
        TableView[View Tabulasi: DaisyUI Table]
        DashboardView[View Dashboard: ApexCharts.js]
    end

    Router --> MapView
    Router --> TableView
    Router --> DashboardView

    Store -->|Kirim Unified Data| MapView
    Store -->|Kirim Unified Data| TableView
    Store -->|Kirim Unified Data| DashboardView
```

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
    ├── store.js            # State Management: Memori penyimpanan data ter-parsing
    ├── map.js              # Mesin Peta: Leaflet.js wrapper & Layer Manager
    ├── table.js            # Mesin Tabulasi: Render grid, search, filter, & pagination
    ├── dashboard.js        # Mesin Dashboard: ApexCharts wrapper & data agregator
    ├── ui.js               # UI Orchestrator: Event listener & manipulasi DOM umum
    ├── sourceRegistry.js   # Registry untuk mendaftarkan handler titik bangunan
    ├── polygonRegistry.js  # Registry untuk mendaftarkan handler poligon wilayah
    │
    └── map-modules/        # Handler modular untuk strategy pattern parsing data
        ├── wilkerstat-se2026.js
        ├── sourceAHandler.js
        ├── sourceBHandler.js
        └── sourceCHandler.js
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

## 4. Aliran & Manajemen Data (`js/store.js`)

Keamanan data terjaga karena **seluruh data tetap berada di memori RAM browser selama sesi aktif**.

1. **Upload / Input:** Pengguna mengunggah berkas (CSV / GeoJSON) melalui antarmuka UI.
2. **Parsing & Standardisasi (Strategy Pattern):**
   - `store.js` membaca file dan meneruskannya ke `sourceRegistry.js` or `polygonRegistry.js`.
   - Registry mencocokkan tipe data dengan handler yang sesuai di `map-modules/`.
   - Handler mengembalikan format objek seragam (*Unified Schema*):
     ```javascript
     {
       id: "unique-id",
       coordinates: [lat, lng],
       properties: { ...rawData },
       tooltipHtml: "<strong>Nama:</strong> ...",
       searchKey: "nama_bangunan_atau_wilayah"
     }
     ```
3. **Penyimpanan State:** Data seragam disimpan dalam variabel global modul `store.js` (misalnya `const appState = { buildings: [], polygons: [] }`).
4. **Distribusi:** Modul `map.js`, `table.js`, dan `dashboard.js` memanggil `store.getData()` untuk memperbarui visualisasi masing-masing tanpa perlu melakukan parser ulang.

---

## 5. Integrasi Fitur Spesifik

### A. Drawer Tabulasi di Halaman Spasial
Halaman Spasial (`#map`) memiliki tombol melayang (*floating button*) untuk membuka lembaran drawer dari kanan/bawah (`table-drawer.html`). Drawer ini memanggil sub-modul dari `table.js` untuk me-render tabel mini berisi data ringkas dari titik yang ada pada cakupan peta saat itu.

### B. Sinkronisasi Aksi (Cross-View Interaction)
* **Peta Ke Tabel:** Mengklik pin di peta dapat memicu aksi untuk menyorot (*highlight*) baris data yang bersangkutan di halaman tabulasi (`#table`).
* **Tabel Ke Peta:** Mengklik baris pada halaman tabulasi akan otomatis memindahkan view ke `#map`, melakukan pergerakan halus (`.flyTo()`), dan membuka popup info di koordinat tersebut.

---

## 6. Mekanisme Reaktivitas State (`Store Events`)

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

## 7. Strategi Performa Skala Besar (Anti-Lag & Responsif)

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

## 8. Batasan PWA Offline
* **Cache Statis (Offline Aman):** Berkas kode HTML, CSS DaisyUI, JS utama, manifest, dan ikon internal di-cache secara permanen oleh `sw.js`. Aplikasi bisa dibuka tanpa internet.
* **Map Tiles (Online Diperlukan):** Tile gambar peta dasar (OSM dan Google Satellite) tidak di-cache oleh Service Worker untuk menghindari kuota penyimpanan penuh. Pengguna memerlukan internet untuk memuat visual peta baru.

---

## 9. Stack Teknologi & CDN

Untuk mendukung performa tinggi pada GitHub Pages tanpa build-step:
* **CSS Framework:** DaisyUI v5 (melalui CDN) + Tailwind CSS v4 (Browser compiler via CDN).
* **GIS Engine:** Leaflet.js v1.9.4 (CDN) + Leaflet.markercluster (untuk performa ribuan titik bangunan).
* **Visualisasi:** ApexCharts.js v6 (CDN) untuk dashboard grafik yang responsif.
* **PWA Capability:** Native Service Worker (`sw.js`) dengan strategi Cache-First untuk aset statis lokal.
