// js/components/toast.js
/**
 * Toast Component - Komponen UI Notifikasi & Loading Indicator DaisyUI v5
 */

export const ToastComponent = {
  /**
   * Menampilkan Toast Notifikasi Sementara (Posisi Kanan Atas / top-end)
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} type
   */
  showToast(message, type = 'info') {
    const alertClasses = {
      info: 'alert-info',
      success: 'alert-success',
      warning: 'alert-warning',
      error: 'alert-error'
    };

    const toastDiv = document.createElement('div');
    toastDiv.className = 'toast toast-end toast-top z-[9999] toast-container mt-16';
    toastDiv.innerHTML = `
      <div class="alert ${alertClasses[type] || 'alert-info'} shadow-lg text-sm font-medium">
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(toastDiv);
    setTimeout(() => toastDiv.remove(), 4000);
  },

  /**
   * Toast Loading dengan indikator progress (Posisi Kanan Atas / top-end)
   * @param {boolean} show
   * @param {string} text
   * @param {number|null} percent - Persentase 0-100 atau null jika indeterminate
   */
  showLoading(show = true, text = 'Memproses data...', percent = null) {
    let loadingToast = document.getElementById('loading-toast');

    if (!show) {
      if (loadingToast) {
        loadingToast.remove();
      }
      return;
    }

    const progressAttr = (percent !== null && !isNaN(percent))
      ? `value="${Math.min(100, Math.max(0, Math.round(percent)))}" max="100"`
      : '';

    if (!loadingToast) {
      loadingToast = document.createElement('div');
      loadingToast.id = 'loading-toast';
      loadingToast.className = 'toast toast-end toast-top z-[9999] mt-16';
      loadingToast.innerHTML = `
        <div class="alert shadow-xl text-sm font-medium flex flex-col items-start gap-2 min-w-[280px]">
          <div class="flex items-center gap-2">
            <span class="loading loading-spinner loading-xs text-primary"></span>
            <span id="loading-toast-text">${text}</span>
          </div>
          <progress id="loading-toast-progress" class="progress progress-primary w-full h-1" ${progressAttr}></progress>
        </div>
      `;
      document.body.appendChild(loadingToast);
    } else {
      const textEl = loadingToast.querySelector('#loading-toast-text');
      if (textEl) textEl.textContent = text;

      const progressEl = loadingToast.querySelector('#loading-toast-progress');
      if (progressEl) {
        if (percent !== null && !isNaN(percent)) {
          progressEl.setAttribute('value', Math.min(100, Math.max(0, Math.round(percent))));
          progressEl.setAttribute('max', '100');
        } else {
          progressEl.removeAttribute('value');
        }
      }
    }
  }
};
