// js/components/pivot-modal.js
/**
 * Modal Builder Pivot Table untuk Xplore 3571
 * Bertanggung jawab menampilkan dialog konfigurasi pivot dan memicu pembuatan Tab Pivot Baru.
 */
import { Store } from '../store.js';
import { PivotEngine } from '../helpers/pivot.js';
import { ToastComponent } from './toast.js';

export function openPivotModal() {
  const modalContainer = document.getElementById('modal-container');
  if (!modalContainer) return;

  // 1. Ambil daftar dataset bertipe 'raw' dari Store
  const rawDatasets = Array.from(Store.tabulationSets.values()).filter(ds => ds.type === 'raw');

  if (rawDatasets.length === 0) {
    ToastComponent.showToast('⚠️ Muat dataset terlebih dahulu melalui Sidebar!', 'warning');
    return;
  }

  const activeContext = Store.getActiveTabContext();
  const selectedDatasetId = (activeContext && activeContext.type === 'raw') 
    ? activeContext.id 
    : rawDatasets[0].id;

  const datasetOptionsHtml = rawDatasets
    .map(ds => `<option value="${ds.id}" ${ds.id === selectedDatasetId ? 'selected' : ''}>${ds.title}</option>`)
    .join('');

  modalContainer.innerHTML = `
    <dialog id="pivot-modal-dialog" class="modal modal-open">
      <div class="modal-box max-w-md rounded-xl border border-base-300 shadow-2xl p-5">
        <h3 class="font-bold text-base text-accent flex items-center gap-2 mb-3">
          📊 Custom Pivot Table Builder
        </h3>

        <div class="form-control gap-3 text-xs">
          
          <!-- 1. Pilih Sumber Dataset -->
          <div>
            <label class="label py-1"><span class="label-text font-bold">1. Pilih Sumber Dataset:</span></label>
            <select id="pivot-select-dataset" class="select select-xs sm:select-sm select-bordered w-full">
              ${datasetOptionsHtml}
            </select>
          </div>

          <!-- 2. Configuration Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            
            <!-- Row Fields -->
            <div class="p-2.5 border border-base-300 rounded-lg bg-base-50 flex flex-col">
              <label class="font-bold text-accent block mb-1">📌 Baris (Rows):</label>
              <select id="pivot-select-rows" class="select select-xs select-bordered w-full flex-1" multiple size="4">
              </select>
              <span class="text-[10px] text-base-content/50 mt-1">Tahan Ctrl / Cmd untuk multi-pilih</span>
            </div>

            <!-- Column Fields -->
            <div class="p-2.5 border border-base-300 rounded-lg bg-base-50 flex flex-col gap-2">
              <div>
                <label class="font-bold text-accent block mb-1">📌 Kolom (Columns):</label>
                <select id="pivot-select-cols" class="select select-xs select-bordered w-full">
                </select>
              </div>

              <div>
                <label class="font-bold text-accent block mb-1">📊 Field Nilai (Value):</label>
                <select id="pivot-select-value" class="select select-xs select-bordered w-full">
                </select>
              </div>

              <div>
                <label class="font-bold text-accent block mb-1">🧮 Fungsi Agregasi:</label>
                <select id="pivot-select-agg" class="select select-xs select-bordered w-full">
                  <option value="COUNT">COUNT (Jumlah Baris)</option>
                  <option value="SUM" selected>SUM (Total Penjumlahan)</option>
                  <option value="AVG">AVG (Rata-rata)</option>
                  <option value="MIN">MIN (Nilai Terkecil)</option>
                  <option value="MAX">MAX (Nilai Terbesar)</option>
                </select>
              </div>
            </div>

          </div>

        </div>

        <div class="modal-action mt-4 gap-2">
          <button id="pivot-btn-cancel" class="btn btn-xs sm:btn-sm btn-ghost">Batal</button>
          <button id="pivot-btn-generate" class="btn btn-xs sm:btn-sm btn-accent">🚀 Tampilkan di Tab Baru</button>
        </div>
      </div>
    </dialog>
  `;

  const dialog = document.getElementById('pivot-modal-dialog');
  const datasetSelect = document.getElementById('pivot-select-dataset');
  const rowsSelect = document.getElementById('pivot-select-rows');
  const colsSelect = document.getElementById('pivot-select-cols');
  const valueSelect = document.getElementById('pivot-select-value');

  // Populate options berdasarkan dataset yang dipilih
  const populateFieldOptions = (dsId) => {
    const targetDs = Store.tabulationSets.get(dsId);
    if (!targetDs || !targetDs.rawData || targetDs.rawData.length === 0) return;

    const sampleRow = targetDs.rawData[0];
    const keys = Object.keys(sampleRow);

    rowsSelect.innerHTML = keys
      .map((k, i) => `<option value="${k}" ${i === 0 ? 'selected' : ''}>${k.toUpperCase()}</option>`)
      .join('');

    colsSelect.innerHTML = `<option value="">-- Tanpa Pivot Kolom --</option>` + 
      keys.map(k => `<option value="${k}">${k.toUpperCase()}</option>`).join('');

    // Cari field angka pertama untuk default metric
    const numericKeys = keys.filter(k => typeof sampleRow[k] === 'number' || !isNaN(parseFloat(sampleRow[k])));
    const defaultNumKey = numericKeys.length > 0 ? numericKeys[0] : keys[0];

    valueSelect.innerHTML = keys
      .map(k => `<option value="${k}" ${k === defaultNumKey ? 'selected' : ''}>${k.toUpperCase()}</option>`)
      .join('');
  };

  populateFieldOptions(datasetSelect.value);

  datasetSelect.addEventListener('change', () => {
    populateFieldOptions(datasetSelect.value);
  });

  document.getElementById('pivot-btn-cancel').addEventListener('click', () => dialog.remove());

  document.getElementById('pivot-btn-generate').addEventListener('click', () => {
    const targetDsId = datasetSelect.value;
    const targetDs = Store.tabulationSets.get(targetDsId);
    if (!targetDs) return;

    const selectedRows = Array.from(rowsSelect.selectedOptions).map(opt => opt.value);
    const selectedCol = colsSelect.value;
    const selectedVal = valueSelect.value;
    const selectedAgg = document.getElementById('pivot-select-agg').value;

    if (selectedRows.length === 0) {
      ToastComponent.showToast('Pilih setidaknya 1 field Baris (Rows)!', 'warning');
      return;
    }

    const { columns, rows } = PivotEngine.generatePivot(targetDs.rawData, {
      rowFields: selectedRows,
      colField: selectedCol,
      valueField: selectedVal,
      aggFunc: selectedAgg
    });

    if (rows.length === 0) {
      ToastComponent.showToast('Gagal menghasilkan pivot. Pastikan data valid!', 'warning');
      return;
    }

    const pivotTabId = `pivot_${targetDsId}_${Date.now()}`;
    const colName = selectedCol ? ` x ${selectedCol}` : '';

    Store.addTabulationSet({
      id: pivotTabId,
      type: 'pivot',
      parentDatasetId: targetDsId,
      title: `📊 Pivot: ${targetDs.title.replace('📄 ', '')} (${selectedRows.join(', ')}${colName})`,
      rawData: rows,
      columns: columns,
      pivotConfig: {
        rowFields: selectedRows,
        colField: selectedCol,
        valueField: selectedVal,
        aggFunc: selectedAgg
      }
    });

    dialog.remove();
  });
}
