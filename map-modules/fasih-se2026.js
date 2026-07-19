// map-modules/fasih-se2026.js

export const FasihSE2026 = {
  id: 'fasih-se2026',
  name: 'Fasih SE2026',
  type: 'building',

  getMarkerOptions(p, fileType = 'csv') {
    const isDitemukan = String(p["is_ditemukan"]).toUpperCase() === "TRUE";
    const isPrelistUsaha = String(p["is_prelist_usaha"]).toUpperCase() === "TRUE";
    const isPrelist = String(p["is_prelist"]).toUpperCase() === "TRUE";
    const jumlahUsaha = parseInt(p["Jumlah.Usaha"], 10) || 0;

    let keterangan = "Lainnya";
    if (isDitemukan && isPrelistUsaha) {
      if (jumlahUsaha > 0 && jumlahUsaha < 10) keterangan = "Prelist Usaha - Berusaha";
      else if (jumlahUsaha < 1) keterangan = "Prelist Usaha - 0 Usaha";
    } 
    else if (isDitemukan && !isPrelist) {
      if (jumlahUsaha > 0 && jumlahUsaha < 10) keterangan = "Assign Baru - Berusaha";
      else if (jumlahUsaha < 1) keterangan = "Assign Baru - 0 Usaha";
    }
    else if (isDitemukan && !isPrelistUsaha) {
      if (jumlahUsaha > 0 && jumlahUsaha < 10) keterangan = "Prelist Keluarga - Berusaha";
      else if (jumlahUsaha < 1) keterangan = "Prelist Keluarga - 0 Usaha";
    }

    let fillColor = '#64748b'; // Default abu-abu
    switch (keterangan) {
      case "Prelist Usaha - Berusaha": fillColor = "#22c55e"; break; // hijau
      case "Prelist Usaha - 0 Usaha": fillColor = "#ef4444"; break; // merah
      case "Prelist Keluarga - Berusaha": fillColor = "#3b82f6"; break; // biru
      case "Prelist Keluarga - 0 Usaha": fillColor = "#f59e0b"; break; // orange
      case "Assign Baru - Berusaha": fillColor = "#8b5cf6"; break; // ungu
      case "Assign Baru - 0 Usaha": fillColor = "#ec4899"; break; // pink
    }

    return {
      radius: 6,
      fillColor: fillColor,
      color: '#fff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.95
    };
  },

  toLayerConfig(p) {
    const lat = parseFloat(p["latitude"] || p["lat"]);
    const lng = parseFloat(p["longitude"] || p["long"] || p["lng"]);
    
    if (isNaN(lat) || isNaN(lng)) return null;

    const nama = p["Nama.Keluarga/Bangunan/Usaha"] || '-';
    const alamat = p["Alamat.Prelist"] || '-';
    const skala = p["Skala.Usaha./.Jenis.Prelist"] || '-';
    const jumlahUsahaStr = p["Jumlah.Usaha"];
    const jumlahUsaha = parseInt(jumlahUsahaStr, 10) || 0;

    const isDitemukan = String(p["is_ditemukan"]).toUpperCase() === "TRUE";
    const isPrelistUsaha = String(p["is_prelist_usaha"]).toUpperCase() === "TRUE";
    const isPrelist = String(p["is_prelist"]).toUpperCase() === "TRUE";

    let keterangan = "Lainnya";

    // Prioritas logika IF sesuai deskripsi pengguna
    if (isDitemukan && isPrelistUsaha) {
      if (jumlahUsaha > 0 && jumlahUsaha < 10) keterangan = "Prelist Usaha - Berusaha";
      else if (jumlahUsaha < 1) keterangan = "Prelist Usaha - 0 Usaha";
    } 
    else if (isDitemukan && !isPrelist) {
      if (jumlahUsaha > 0 && jumlahUsaha < 10) keterangan = "Assign Baru - Berusaha";
      else if (jumlahUsaha < 1) keterangan = "Assign Baru - 0 Usaha";
    }
    else if (isDitemukan && !isPrelistUsaha) {
      if (jumlahUsaha > 0 && jumlahUsaha < 10) keterangan = "Prelist Keluarga - Berusaha";
      else if (jumlahUsaha < 1) keterangan = "Prelist Keluarga - 0 Usaha";
    }

    const popupHtml = `
      <div class="p-1 font-sans text-xs min-w-[200px]">
        <div class="text-center font-bold mb-1 w-full bg-base-200 p-1 rounded">${nama}</div>
        <hr class="my-1 border-base-content/30 border-dashed">
        <strong>Alamat:</strong> ${alamat}<br>
        <strong>Skala Usaha/Jenis Prelist:</strong> ${skala}<br>
        <strong>Jumlah Usaha:</strong> ${jumlahUsahaStr || '0'}<br>
        <hr class="my-1 border-base-content/30 border-dashed">
        <strong>Keterangan:</strong> ${keterangan}<br>
        <strong>is_ditemukan:</strong> ${p["is_ditemukan"]}<br>
        <strong>is_prelist:</strong> ${p["is_prelist"]}<br>
        <strong>is_prelist_usaha:</strong> ${p["is_prelist_usaha"]}<br>
      </div>
    `;

    const searchKeyword = `${nama} ${alamat} ${skala}`.toLowerCase();

    return {
      geometry: { lat, lng },
      popupHtml: popupHtml,
      searchKeyword: searchKeyword,
      searchTitle: nama,
      subcategory: keterangan, // Ini akan memicu MapEngine membuat Layer Control subgroup
      originalData: p
    };
  }
};
