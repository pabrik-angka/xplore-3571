// data-modules/se2026-geotag-usaha-dan-keluarga.js
import { BaseDataModule } from './BaseStrategy.js';

class SE2026GeotagUsaha extends BaseDataModule {
  constructor() {
    super({
      id: 'se2026-geotag-usaha',
      name: 'SE2026 Geotag Usaha',
      type: 'building',
      is_spatial_active: true,
      is_tabulasi_active: false,
      is_dashboard_active: false,
      mandatoryFields: ['idsubsls', 'nama_principal', 'no_bang', 'geotag_latitude', 'geotag_longitude']
    });
  }

  // Transformasi objek mentah ke standar konfigurasi Leaflet
  toLayerConfig(rawItem, fileType = 'csv') {
    const p = fileType === 'geojson' ? (rawItem.properties || {}) : rawItem;

    // Fast O(1) lookup map untuk property case-insensitive
    const lowerMap = new Map();
    for (const k in p) {
      lowerMap.set(k.toLowerCase(), p[k]);
    }

    const getProp = (keys) => {
      for (const key of keys) {
        const val = lowerMap.get(key.toLowerCase());
        if (val !== undefined && val !== null && val !== '') return val;
      }
      return '-';
    };

    const lat = parseFloat(getProp(['geotag_latitude', 'latitude', 'lat', 'y']) || NaN);
    const lng = parseFloat(getProp(['geotag_longitude', 'geotag_logitute', 'longitude', 'lng', 'x']) || NaN);

    const idVal = getProp(['assignment_id', 'idsubsls']);
    const namaUsaha = getProp(['nama_principal', 'nama_usaha_bang']);
    const noBangunan = getProp(['no_bang']);
    const kode_bang_label = getProp(['kode_bang_label']);
    const nama_usaha = getProp(['nama_usaha']);
    const nama_komersial = getProp(['nama_komersial']);
    const jenis_usaha_label = getProp(['jenis_usaha_label']);
    const keg_utama = getProp(['keg_utama']);


    const popupHtml = `
      <div class="p-2 text-xs min-w-[220px]">
        <div class="text-center font-bold text-base mb-1">
          ${namaUsaha}
        </div>
        <div class="border-t border-base-300 my-1"></div>
        <div class="space-y-1 mt-1">
          <div><span class="text-base-content/60 font-medium">Nama Usaha/Komersial</span> <span class="font-semibold">${nama_usaha}/${nama_komersial}</span></div>
          <div><span class="text-base-content/60 font-medium">Jenis Usaha:</span> <span class="font-semibold">${jenis_usaha_label}</span></div>
          <div><span class="text-base-content/60 font-medium">Kegiatan Utama:</span> <span class="font-semibold">${keg_utama}</span></div>
        </div>
        <div class="border-t border-base-300 my-2"></div>
        <div class="space-y-1 mt-1">
          <div><span class="text-base-content/60 font-medium">Sumber:</span> <span class="font-semibold">SE2026 Geotag Usaha</span></div>
        </div>
        <div class="border-t border-base-300 my-2"></div>        
        <div class="text-center">
          <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" class="text-blue-600 hover:underline font-medium">
            Buka di Google Maps
          </a>
        </div>
      </div>
    `;

    const searchKeyword = `${namaUsaha}`.toLowerCase();

    return {
      geometry: { lat, lng },
      popupHtml: popupHtml,
      searchKeyword: searchKeyword,
      searchTitle: namaUsaha,
      subcategory: 'SE2026 Geotag Usaha',
      originalData: p // simpan untuk keperluan filter spasial (opsional)
    };
  }

  // Desain opsi penanda marker (seragam)
  getMarkerOptions(rawItem, fileType = 'csv') {
    return {
      radius: 6,
      fillColor: '#ff9900ff', // Hijau seragam
      color: '#ffffff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.95,
      shape: 'round'
    };
  }
}

export const se2026GetagUsaha = new SE2026GeotagUsaha();
