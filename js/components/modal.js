/**
 * Xplore 3571 - Spatial Modal Component
 */
// PASTIKAN ADA KATA 'export' DI DEPAN 'function'
export function openSpatialModal({ title, options, accept, onProcess, onError }) {
  const modalContainer = document.getElementById('modal-container');
  if (!modalContainer) return;

  modalContainer.innerHTML = `
    <dialog id="spatial-dialog" class="modal modal-open">
      <div class="modal-box max-w-sm rounded-xl border border-base-300 shadow-2xl">
        <h3 class="font-bold text-lg text-secondary mb-4">📂 ${title}</h3>
        
        <div class="form-control gap-3">
          <div>
            <label class="label"><span class="label-text font-semibold">1. Pilih Jenis Format Skema Data</span></label>
            <select id="modal-schema-select" class="select select-bordered select-sm w-full">
              <option value="" disabled selected>Pilih Skema...</option>
              ${options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="label"><span class="label-text font-semibold">2. Pilih File Spasial</span></label>
            <input type="file" id="modal-file-input" accept="${accept}" class="file-input file-input-bordered file-input-sm w-full" />
          </div>
        </div>

        <div class="modal-action mt-6 gap-2">
          <button id="modal-cancel" class="btn btn-sm btn-ghost cursor-pointer">Batal</button>
          <button id="modal-submit" class="btn btn-sm btn-primary cursor-pointer">Proses & Peta</button>
        </div>
      </div>
    </dialog>
  `;

  const dialog = document.getElementById('spatial-dialog');

  document.getElementById('modal-cancel').addEventListener('click', () => {
    dialog.remove();
  });

  document.getElementById('modal-submit').addEventListener('click', () => {
    const schemaSelect = document.getElementById('modal-schema-select').value;
    const fileInput = document.getElementById('modal-file-input').files[0];

    if (!schemaSelect || !fileInput) {
      if (typeof onError === 'function') {
        onError('Lengkapi skema dan file terlebih dahulu!', 'warning');
      }
      return;
    }

    onProcess(fileInput, schemaSelect);
    dialog.remove();
  });
}