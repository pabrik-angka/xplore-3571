// map-modules/wilayah-blank-template.js

export const wilayahTemplateHandler = {
  // 1. Definisikan field/kolom apa saja yang ingin ditampilkan saat di-render
  // Ini berguna jika nanti Anda ingin membuat tabel informasi otomatis atau detail panel
  displayFields: [
    { field: 'kec', label: 'Nama Kecamatan' },
    { field: 'kel', label: 'Nama Kelurahan/Desa' },
    { field: 'sls', label: 'Nama SLS / RT-RW' }
  ],

  // 2. Ekstraksi atribut wajib untuk kebutuhan inti sistem (dropdown cascade & tooltip)
  extractProperties(feature) {
    const p = feature.properties || {};
    
    // Ambil nilai mentah dari berkas GeoJSON baru
    const kecVal = p.NAMA_KECAMATAN || p.kec || '-';
    const kelVal = p.NAMA_KELURAHAN || p.kel || '-';
    const slsVal = p.NAMA_SLS || p.sls || '-';

    // Susun isi Tooltip secara dinamis memanfaatkan array displayFields di atas
    const tooltipHtml = `
      <div class="p-1 space-y-1 text-xs">
        <div class="font-bold border-b border-base-300 pb-1 text-secondary">Detail Wilayah</div>
        ${this.displayFields.map(f => {
          let val = f.field === 'kec' ? kecVal : f.field === 'kel' ? kelVal : slsVal;
          return `<div><span class="opacity-60">${f.label}:</span> <b>${val}</b></div>`;
        }).join('')}
      </div>
    `;

    return {
      kec: kecVal,
      kel: kelVal,
      sls: slsVal,
      tooltipHtml: tooltipHtml
    };
  },

  // 3. Desain gaya visual (styling) area map
  getStyle() {
    return {
      color: "#4A5568",
      weight: 1.5,
      opacity: 0.8,
      fillColor: "#3182CE",
      fillOpacity: 0.15
    };
  }
};