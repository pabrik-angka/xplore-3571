// map-modules/sentra-ekonomi.js

export const sentraEkonomiHandler = {
  // 1. Definisikan informasi/field apa saja yang akan ditampilkan
  mandatoryFields: ['id', 'nama_usaha', 'deskripsi', 'sektor', 'latitude', 'longitude'],
  
  // 2. Transformasi objek mentah ke standar konfigurasi Leaflet
  toLayerConfig(rawItem, fileType = 'csv') {
    const p = fileType === 'geojson' ? (rawItem.properties || {}) : rawItem;
    
    // Pencarian case-insensitive untuk property
    const getProp = (keys) => {
      for (const key of keys) {
        for (const k in p) {
          if (k.toLowerCase() === key.toLowerCase()) return p[k];
        }
      }
      return '-';
    };

    const lat = parseFloat(getProp(['latitude', 'lat', 'y']) || NaN);
    const lng = parseFloat(getProp(['longitude', 'lng', 'lon', 'long', 'x']) || NaN);

    const idVal = getProp(['id', 'ids', 'idsbr']);
    const namaUsaha = getProp(['nama_usaha', 'nama']);
    const deskripsi = getProp(['deskripsi', 'desc']);
    const sektor = getProp(['sektor']);

    const popupHtml = `
      <div class="p-2 text-xs min-w-[220px]">
        <div class="text-center font-bold text-base mb-1">
          ${namaUsaha}
        </div>
        <div class="border-t border-base-300 my-1"></div>
        <div class="space-y-1 mt-1">
          <div><span class="text-base-content/60 font-medium">Deskripsi:</span> <span class="font-semibold">${deskripsi}</span></div>
          <div><span class="text-base-content/60 font-medium">Sektor:</span> <span class="font-semibold">${sektor}</span></div>
        </div>
        <div class="border-t border-base-300 my-2"></div>
        <div class="space-y-1 mt-1">
          <div><span class="text-base-content/60 font-medium">Sumber:</span> <span class="font-semibold">Sentra Ekonomi (SWMAPS)</span></div>
        </div>
        <div class="border-t border-base-300 my-1"></div>
        <div class="text-center">
          <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" class="text-blue-600 hover:underline font-medium">
            Buka di Google Maps
          </a>
        </div>
      </div>
    `;

    const searchKeyword = `${namaUsaha} ${deskripsi} ${sektor}`.toLowerCase();

    return {
      geometry: { lat, lng },
      popupHtml: popupHtml,
      searchKeyword: searchKeyword,
      searchTitle: namaUsaha,
      originalData: p // simpan untuk keperluan filter spasial (opsional)
    };
  },

  // 3. Desain opsi penanda marker (seragam)
  getMarkerOptions(rawItem, fileType = 'csv') {
    return {
      radius: 6,
      fillColor: '#f97316', // Orange seragam
      color: '#ffffff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.95
    };
  }
};
