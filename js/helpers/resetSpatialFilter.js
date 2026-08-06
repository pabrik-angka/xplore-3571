// js/helpers/resetSpatialFilter.js
/**
 * Pure Helper: Reset tampilan dropdown filter wilayah spasial ke kondisi awal.
 * Digunakan setelah dataset bangunan baru berhasil dimuat agar filter tidak menggantung.
 * SRP: satu fungsi, satu tanggung jawab DOM reset.
 */

/**
 * Mereset semua dropdown filter wilayah (kecamatan, desa, SLS) ke posisi kosong/disabled.
 * @returns {void}
 */
export function resetSpatialFilterDropdowns() {
  const selKec = document.getElementById('filter-sel-kec');
  const selDesa = document.getElementById('filter-sel-desa');
  const selSls = document.getElementById('filter-sel-sls');

  if (selKec) selKec.value = '';
  if (selDesa) {
    selDesa.innerHTML = '<option value="">-- DESA --</option>';
    selDesa.disabled = true;
  }
  if (selSls) {
    selSls.innerHTML = '<option value="">-- SLS --</option>';
    selSls.disabled = true;
  }
}
