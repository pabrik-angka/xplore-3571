// map-modules/bangunan-blank-template.js

export const bangunanTemplateHandler = {
  // 1. Definisikan informasi/field apa saja yang akan ditampilkan di dalam POPUP marker
  displayFields: [
    { field: 'id_bgn', label: 'ID Bangunan' },
    { field: 'nama_pemilik', label: 'Nama Kepala Keluarga / Pemilik' },
    { field: 'fungsi', label: 'Fungsi Bangunan' },
    { field: 'catatan', label: 'Keterangan Lapangan' }
  ],

  // 2. Transformasi objek mentah (baik dari baris CSV atau feature GeoJSON) ke standar konfigurasi Leaflet
  toLayerConfig(rawItem, fileType = 'geojson') {
    // Standardisasi pengambilan properti/kolom berdasarkan tipe berkas
    const p = fileType === 'geojson' ? (rawItem.properties || {}) : rawItem;
    
    // Ekstraksi Koordinat secara fleksibel (mencegah salah nama kolom lintang/bujur)
    const lat = parseFloat(p.latitude || p.lat || p.y || NaN);
    const lng = parseFloat(p.longitude || p.longitude || p.lng || p.x || NaN);

    // Ambil nilai fungsional fields
    const idBgn = p.ID_BANGUNAN || p.id || '-';
    const pemilik = p.NAMA_PENGHUNI || p.nama || '-';
    const fungsiBgn = p.FUNGSI_BANGUNAN || p.jenis || '-';
    const note = p.KETERANGAN || p.note || '-';

    // Susun isi Popup secara dinamis memanfaatkan array displayFields di atas
    const popupHtml = `
      <div class="p-2 space-y-1.5 text-xs min-w-[200px]">
        <div class="font-bold border-b border-base-300 pb-1 text-accent flex justify-between items-center">
          <span>📍 Informasi Bangunan</span>
          <span class="badge badge-outline badge-xs opacity-70">${fungsiBgn}</span>
        </div>
        <div class="space-y-1">
          ${this.displayFields.map(f => {
            let val = '-';
            if (f.field === 'id_bgn') val = idBgn;
            if (f.field === 'nama_pemilik') val = pemilik;
            if (f.field === 'fungsi') val = fungsiBgn;
            if (f.field === 'catatan') val = note;
            
            return `<div><span class="text-base-content/60 font-medium">${f.label}:</span> <br><span class="text-base-content font-semibold">${val}</span></div>`;
          }).join('')}
        </div>
      </div>
    `;

    // Keyword pencarian fuzzy live-search gabungan nama pemilik & fungsi bangunan
    const searchKeyword = `${pemilik} ${fungsiBgn} ${idBgn}`.toLowerCase();
    const searchTitle = pemilik !== '-' ? pemilik : (idBgn !== '-' ? `ID: ${idBgn}` : 'Bangunan Tanpa Nama');

    return {
      geometry: { lat, lng },
      popupHtml: popupHtml,
      searchKeyword: searchKeyword,
      searchTitle: searchTitle
    };
  },

  // 3. Desain opsi penanda marker (misal: warna icon leaflet, ukuran bulatan, dsb)
  getMarkerOptions(rawItem, fileType = 'geojson') {
    const p = fileType === 'geojson' ? (rawItem.properties || {}) : rawItem;
    const fungsi = p.FUNGSI_BANGUNAN || p.jenis || '';

    // Contoh pewarnaan marker dinamis berdasarkan fungsi bangunan
    let color = '#3b82f6'; // Biru default (Rumah Tangga)
    if (fungsi.includes('Usaha')) color = '#ef4444'; // Merah
    if (fungsi.includes('Kosong')) color = '#9ca3af'; // Abu-abu

    return {
      radius: 5,
      fillColor: color,
      color: '#ffffff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9
    };
  }
};