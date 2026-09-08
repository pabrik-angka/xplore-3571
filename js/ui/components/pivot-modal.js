// js/ui/components/pivot-modal.js
/**
 * Modal Builder Pivot Table untuk Xplore 3571
 * Dipindahkan ke js/ui/components/ sesuai arsitektur DDS-Lite.
 */
import { Store } from '../../core/store.js';
import { PivotEngine } from '../../helpers/pivot.js';
import { ToastComponent } from './toast.js';

export function openPivotModal() {
  const modalContainer = document.getElementById('modal-container');
  if (!modalContainer) return;

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
      <div class="modal-box max-w-lg rounded-xl border border-base-300 shadow-2xl p-5">
        <h3 class="font-bold text-base text-accent flex items-center gap-2 mb-3">
          📊 Custom Pivot Table Builder
        </h3>

        <div class="form-control gap-3 text-xs">
          <div>
            <label class="label py-1"><span class="label-text font-bold">1. Sumber Dataset:</span></label>
            <select id="pivot-select-dataset" class="select select-xs sm:select-sm select-bordered w-full">
              ${datasetOptionsHtml}
            </select>
          </div>

          <div>
            <label class="label py-1">
              <span class="label-text font-bold text-accent">2. Baris (Rows) — Pilih satu atau lebih:</span>
            </label>
            <div id="pivot-rows-checklist" class="overflow-y-auto max-h-44 border border-base-300 rounded-lg p-2 flex flex-col gap-1 bg-base-50">
            </div>
            <span class="text-[10px] text-base-content/50 mt-1 block">Centang field yang ingin dikelompokkan sebagai baris</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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

        <div class="modal-action mt-4 gap-2">
          <button id="pivot-btn-cancel" class="btn btn-xs sm:btn-sm btn-ghost">Batal</button>
          <button id="pivot-btn-generate" class="btn btn-xs sm:btn-sm btn-accent">🚀 Tampilkan di Tab Baru</button>
        </div>
      </div>
    </dialog>
  `;

  const dialog = document.getElementById('pivot-modal-dialog');
  const datasetSelect = document.getElementById('pivot-select-dataset');
  const colsSelect = document.getElementById('pivot-select-cols');
  const valueSelect = document.getElementById('pivot-select-value');

  const populateFieldOptions = (dsId) => {
    const targetDs = Store.tabulationSets.get(dsId);
    if (!targetDs || !targetDs.rawData || targetDs.rawData.length === 0) return;

    const sampleRow = targetDs.rawData[0];
    const keys = Object.keys(sampleRow);
    const rowsChecklist = document.getElementById('pivot-rows-checklist');

    if (rowsChecklist) {
      rowsChecklist.innerHTML = keys
        .map((k, i) => `
          <label class="label cursor-pointer justify-start gap-2 py-0.5 px-1.5 hover:bg-base-200/60 rounded text-xs">
            <input type="checkbox" value="${k}" class="checkbox checkbox-xs checkbox-primary" ${i === 0 ? 'checked' : ''} />
            <span class="label-text text-xs truncate">${k}</span>
          </label>
        `)
        .join('');
    }

    colsSelect.innerHTML = `<option value="">-- Tanpa Pivot Kolom --</option>` + 
      keys.map(k => `<option value="${k}">${k}</option>`).join('');

    const numericKeys = keys.filter(k => typeof sampleRow[k] === 'number' || !isNaN(parseFloat(sampleRow[k])));
    const defaultNumKey = numericKeys.length > 0 ? numericKeys[0] : keys[0];

    valueSelect.innerHTML = keys
      .map(k => `<option value="${k}" ${k === defaultNumKey ? 'selected' : ''}>${k}</option>`)
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

    const checkedBoxes = document.querySelectorAll('#pivot-rows-checklist input[type="checkbox"]:checked');
    const selectedRows = Array.from(checkedBoxes).map(cb => cb.value);
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
