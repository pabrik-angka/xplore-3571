// js/components/confirm-modal.js
/**
 * Modal Dialog Konfirmasi Generic berbasis DaisyUI v5
 */

export function openConfirmModal({
  title = '⚠️ Konfirmasi',
  message = 'Apakah Anda yakin ingin melanjutkan?',
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  confirmClass = 'btn-warning',
  onConfirm,
  onCancel
}) {
  const modalContainer = document.getElementById('modal-container');
  if (!modalContainer) return;

  const dialogId = 'confirm-dialog-' + Date.now();

  modalContainer.innerHTML = `
    <dialog id="${dialogId}" class="modal modal-open">
      <div class="modal-box max-w-sm rounded-xl border border-base-300 shadow-2xl p-5">
        <h3 class="font-bold text-base text-warning flex items-center gap-2 mb-2">
          ${title}
        </h3>
        <p class="text-xs text-base-content/80 leading-relaxed mb-4">
          ${message}
        </p>

        <div class="modal-action gap-2 mt-2">
          <button id="${dialogId}-cancel" class="btn btn-xs sm:btn-sm btn-ghost">
            ${cancelText}
          </button>
          <button id="${dialogId}-confirm" class="btn btn-xs sm:btn-sm ${confirmClass}">
            ${confirmText}
          </button>
        </div>
      </div>
    </dialog>
  `;

  const dialog = document.getElementById(dialogId);
  const btnCancel = document.getElementById(`${dialogId}-cancel`);
  const btnConfirm = document.getElementById(`${dialogId}-confirm`);

  btnCancel?.addEventListener('click', () => {
    dialog.remove();
    if (typeof onCancel === 'function') onCancel();
  });

  btnConfirm?.addEventListener('click', () => {
    dialog.remove();
    if (typeof onConfirm === 'function') onConfirm();
  });
}
