# xplore-3571

```
xplore-3571/
├── index.html                 # Entry point aplikasi (Responsive UI dengan FlyonUI)
├── manifest.json              # Manifest PWA
├── sw.js                      # Service Worker (Caching & Offline Support)
├── assets/
│   ├── css/
│   │   └── app.css            # Custom CSS overrides (FlyonUI Soft theme di-load di HTML)
│   └── icons/                 # Icon aplikasi untuk PWA (sizes: 192, 512, dll)
│       ├── icon-192.png
│       └── icon-512.png
└── js/
    ├── app.js                 # Entry point JS (Inisialisasi & bootstrap app)
    ├── config.js              # Konfigurasi global (API Keys, Map settings, Layer sources)
    ├── components/            # UI Components (Manipulasi DOM lokal)
    │   ├── map.js             # Logika inisialisasi & interaksi Peta (Leaflet/MapLibre)
    │   ├── sidebar.js         # Logika interaksi panel samping
    │   └── toast.js           # Sistem notifikasi/toast UI
    ├── services/              # Logika Bisnis & Data Fetching (SRP)
    │   ├── geojson-loader.js  # Fetch & validasi Polygon Wilayah & Titik Bangunan
    │   └── storage.js         # Wrapper LocalStorage / IndexedDB (KISS & DRY)
    └── utils/                 # Helper murni (Pure functions)
        └── helpers.js         # Helper fungsi umum (formatters, validator)
```
