// map-modules/wilkerstat-se2026.js
import { Store } from '../js/store.js'; // Import Store untuk optimasi Tree Indexing

export const wilkerstatSE2026 = {
  id: 'wilkerstat-se2026',
  name: "Wilkerstat SE2026",
  maxDepth: 'sls',
  
  // Daftar field mandatori yang wajib ada di properti objek spasial
  mandatoryFields: ['idsubsls', 'kdkec', 'nmkec', 'kddesa', 'nmdesa', 'kdsls', 'nmsls', 'pml', 'ppl'],

  /**
   * Konfigurasi Filter Spasial Dinamis untuk SpatialFilterManager.
   */
  filterConfig: [
    { id: 'filter-sel-kec', props: ['nmkec', 'Nama_Kec', 'kecamatan'], placeholder: '-- KECAMATAN --' },
    { id: 'filter-sel-desa', props: ['nmdesa', 'Nama_Desa', 'desa'], placeholder: '-- DESA --' },
    { id: 'filter-sel-sls', props: ['nmsls', 'NMSLS', 'Nama_SLS'], placeholder: '-- SLS --' }
  ],

  /**
   * Validasi keberadaan seluruh field mandatori secara case-insensitive
   */
  validate(properties) {
    const keys = Object.keys(properties).map(k => k.toLowerCase());
    return this.mandatoryFields.every(field => keys.includes(field));
  },

  /**
   * Ekstraksi data filter & kompilasi tooltip spesifik kebutuhan Wilkerstat
   */
  extract(properties) {
    // Normalisasi properti menjadi lowercase agar aman dari variasi ekspor data BPS
    const p = {};
    for (const key in properties) {
      p[key.toLowerCase()] = properties[key];
    }

    const tooltipHtml = `
      <div class="p-1 font-mono text-xs">
        <strong>ID:</strong> ${p.idsubsls || '-'}<br>
        <strong>KEC:</strong> [${p.kdkec || '-'}] ${p.nmkec || '-'}<br>
        <strong>KEL:</strong> [${p.kddesa || '-'}] ${p.nmdesa || '-'}<br>
        <strong>SLS:</strong> [${p.kdsls || '-'}] ${p.nmsls || '-'}<br>
        <div class="border-t border-dashed my-1 border-base-content/30"></div>
        <span class="font-bold text-neutral-600">PETUGAS:</span><br>
        <strong>PML:</strong> ${p.pml || '-'}<br>
        <strong>PPL:</strong> ${p.ppl || '-'}
      </div>
    `;

    return {
      filterData: {
        kec: String(p.nmkec).trim(),
        desa: String(p.nmdesa).trim(),
        sls: String(p.nmsls).trim()
      },
      tooltipHtml
    };
  },

  /**
   * Mengatur skema DOM untuk filter dinamis di sidebar dengan performa O(1) Cache
   */
  renderFilterUI(container, uniqueFilterData, onFilterChange) {
    // Mengambil opsi Kecamatan awal langsung dari Store Cache Tree
    const initialKecamatans = Store.getFilterOptions([]).sort();

    container.innerHTML = `
      <select id="filter-sel-kec" class="select select-bordered select-sm w-full">
        <option value="">-- KECAMATAN --</option>
        ${initialKecamatans.map(k => `<option value="${k}">${k}</option>`).join('')}
      </select>
      <select id="filter-sel-desa" class="select select-bordered select-sm w-full" disabled>
        <option value="">-- DESA --</option>
      </select>
      <select id="filter-sel-sls" class="select select-bordered select-sm w-full" disabled>
        <option value="">-- SLS --</option>
      </select>
    `;

    const selKec = container.querySelector('#filter-sel-kec');
    const selDesa = container.querySelector('#filter-sel-desa');
    const selSls = container.querySelector('#filter-sel-sls');

    // Event Listener Dropdown Kecamatan
    selKec.addEventListener('change', () => {
      const kecVal = selKec.value;
      selDesa.innerHTML = '<option value="">-- DESA --</option>';
      selSls.innerHTML = '<option value="">-- SLS --</option>';
      selSls.disabled = true;

      if (kecVal) {
        // PERBAIKAN: Direct lookup opsi Desa menggunakan Store Tree Cache (Instant)
        const desas = Store.getFilterOptions([kecVal]).sort();
        desas.forEach(d => selDesa.insertAdjacentHTML('beforeend', `<option value="${d}">${d}</option>`));
        selDesa.disabled = false;
      } else {
        selDesa.disabled = true;
      }
      onFilterChange({ kec: kecVal, desa: '', sls: '' });
    });

    // Event Listener Dropdown Desa
    selDesa.addEventListener('change', () => {
      const kecVal = selKec.value;
      const desaVal = selDesa.value;
      selSls.innerHTML = '<option value="">-- SLS --</option>';

      if (desaVal) {
        // PERBAIKAN: Direct lookup opsi SLS menggunakan Store Tree Cache tingkat 2 (Instant)
        const slss = Store.getFilterOptions([kecVal, desaVal]).sort();
        slss.forEach(s => selSls.insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`));
        selSls.disabled = false;
      } else {
        selSls.disabled = true;
      }
      onFilterChange({ kec: kecVal, desa: desaVal, sls: '' });
    });

    // Event Listener Dropdown SLS
    selSls.addEventListener('change', () => {
      onFilterChange({ kec: selKec.value, desa: selDesa.value, sls: selSls.value });
    });
  },

  getStyle() {
    return {
      color: '#4f46e5',
      weight: 2.5,
      fillColor: '#818cf8',
      fillOpacity: 0.15,
      dashArray: '3'
    };
  }
};