// data-modules/wilkerstat.strategy.js
import { BaseDataModule } from './BaseStrategy.js';
import { Store } from '../js/core/store.js'; // Import Store dari location baru core/

class WilkerstatSE2026 extends BaseDataModule {
  constructor() {
    super({
      id: 'wilkerstat-se2026',
      name: 'Wilkerstat SE2026',
      type: 'polygon',
      is_spatial_active: true,
      is_tabulasi_active: false,
      is_dashboard_active: false,
      mandatoryFields: ['idsubsls', 'kdkec', 'nmkec', 'kddesa', 'nmdesa', 'kdsls', 'nmsls', 'pml', 'ppl']
    });
    this.maxDepth = 'sls';

    /**
     * Konfigurasi Filter Spasial Dinamis untuk SpatialFilterManager.
     */
    this.filterConfig = [
      { id: 'filter-sel-kec', props: ['nmkec', 'Nama_Kec', 'kecamatan'], placeholder: '-- KECAMATAN --' },
      { id: 'filter-sel-desa', props: ['nmdesa', 'Nama_Desa', 'desa'], placeholder: '-- DESA --' },
      { id: 'filter-sel-sls', props: ['nmsls', 'NMSLS', 'Nama_SLS'], placeholder: '-- SLS --' }
    ];
  }

  /**
   * Ekstraksi data filter & kompilasi tooltip spesifik kebutuhan Wilkerstat
   */
  extract(properties) {
    const p = this.normalizeProperties(properties);

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
  }

  /**
   * Mengatur skema DOM untuk filter dinamis di sidebar dengan performa O(1) Cache
   */
  renderFilterUI(container, uniqueFilterData, onFilterChange) {
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

    selKec.addEventListener('change', () => {
      const kecVal = selKec.value;
      selDesa.innerHTML = '<option value="">-- DESA --</option>';
      selSls.innerHTML = '<option value="">-- SLS --</option>';
      selSls.disabled = true;

      if (kecVal) {
        const desas = Store.getFilterOptions([kecVal]).sort();
        desas.forEach(d => selDesa.insertAdjacentHTML('beforeend', `<option value="${d}">${d}</option>`));
        selDesa.disabled = false;
      } else {
        selDesa.disabled = true;
      }
      onFilterChange({ kec: kecVal, desa: '', sls: '' });
    });

    selDesa.addEventListener('change', () => {
      const kecVal = selKec.value;
      const desaVal = selDesa.value;
      selSls.innerHTML = '<option value="">-- SLS --</option>';

      if (desaVal) {
        const slss = Store.getFilterOptions([kecVal, desaVal]).sort();
        slss.forEach(s => selSls.insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`));
        selSls.disabled = false;
      } else {
        selSls.disabled = true;
      }
      onFilterChange({ kec: kecVal, desa: desaVal, sls: '' });
    });

    selSls.addEventListener('change', () => {
      onFilterChange({ kec: selKec.value, desa: selDesa.value, sls: selSls.value });
    });
  }

  getStyle() {
    return {
      color: '#059669',
      weight: 2.5,
      fillColor: '#a7f3d0',
      fillOpacity: 0.25,
      dashArray: '3'
    };
  }
}

export const wilkerstatSE2026 = new WilkerstatSE2026();
