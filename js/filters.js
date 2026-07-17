// js/filters.js
// Struktur baru: { "Kecamatan A": { "Desa A1": Set(["SLS 001", "SLS 002"]), ... } }
let wilayahHierarchy = {}; 
let currentSLSLayer = null;

const selectKec = document.getElementById('filterKec');
const selectDesa = document.getElementById('filterDesa');
const selectSLS = document.getElementById('filterSLS');

/**
 * Ekstrak daftar Kecamatan, Desa, dan SLS dari GeoJSON secara dinamis
 */
export function initWilayahFilter(geojson, leafletGeoJsonLayer) {
  currentSLSLayer = leafletGeoJsonLayer;
  wilayahHierarchy = {};

  // Reset semua dropdown
  selectKec.innerHTML = '<option value="">-- Pilih Kecamatan --</option>';
  selectDesa.innerHTML = '<option value="">-- Pilih Desa/Kelurahan --</option>';
  selectSLS.innerHTML = '<option value="">-- Pilih SLS --</option>';
  
  selectKec.disabled = true;
  selectDesa.disabled = true;
  selectSLS.disabled = true;

  let kecKey = null;
  let desaKey = null;
  let slsKey = null;

  if (geojson.features.length > 0) {
    const props = geojson.features[0].properties;
    const keys = Object.keys(props);
    
    // Deteksi kolom secara cerdas
    kecKey = keys.find(k => k.toLowerCase().includes('kec') || k.toLowerCase().includes('district') && !k.toLowerCase().includes('sub'));
    desaKey = keys.find(k => k.toLowerCase().includes('des') || k.toLowerCase().includes('kel') || k.toLowerCase().includes('subdist'));
    // Deteksi SLS (mencari kata 'sls', 'rt', 'rw', 'lingkungan', atau 'dusun')
    slsKey = keys.find(k => k.toLowerCase().includes('sls') || k.toLowerCase().includes('rt') || k.toLowerCase().includes('rw') || k.toLowerCase().includes('nm_sls') || k.toLowerCase().includes('nsls'));
  }

  if (!kecKey || !desaKey || !slsKey) {
    console.warn("Kolom wilayah (Kecamatan/Desa/SLS) tidak lengkap terdeteksi otomatis.");
    alert(`Deteksi kolom otomatis:\n- Kecamatan: ${kecKey || '❌'}\n- Desa: ${desaKey || '❌'}\n- SLS: ${slsKey || '❌'}\nHarap pastikan nama kolom di GeoJSON sesuai.`);
    return;
  }

  // Bangun struktur hierarki 3 tingkat
  geojson.features.forEach(feature => {
    const kecName = feature.properties[kecKey]?.trim();
    const desaName = feature.properties[desaKey]?.trim();
    const slsName = feature.properties[slsKey]?.trim();

    if (kecName && desaName && slsName) {
      if (!wilayahHierarchy[kecName]) {
        wilayahHierarchy[kecName] = {};
      }
      if (!wilayahHierarchy[kecName][desaName]) {
        wilayahHierarchy[kecName][desaName] = new Set();
      }
      wilayahHierarchy[kecName][desaName].add(slsName);
    }
  });

  // Isi dropdown Kecamatan pertama kali
  Object.keys(wilayahHierarchy).sort().forEach(kec => {
    const opt = document.createElement('option');
    opt.value = kec;
    opt.textContent = kec;
    selectKec.appendChild(opt);
  });

  selectKec.disabled = false;

  // Pasang event listener interaksi
  setupFilterEvents(kecKey, desaKey, slsKey);
}

/**
 * Mengatur interaksi berantai antar Dropdown & Filter Peta
 */
function setupFilterEvents(kecKey, desaKey, slsKey) {
  
  // 1. KETIKA KECAMATAN DIPILIH
  selectKec.onchange = (e) => {
    const selectedKec = e.target.value;
    
    // Reset tingkat di bawahnya
    selectDesa.innerHTML = '<option value="">-- Pilih Desa/Kelurahan --</option>';
    selectSLS.innerHTML = '<option value="">-- Pilih SLS --</option>';
    selectDesa.disabled = true;
    selectSLS.disabled = true;

    if (selectedKec && wilayahHierarchy[selectedKec]) {
      Object.keys(wilayahHierarchy[selectedKec]).sort().forEach(desa => {
        const opt = document.createElement('option');
        opt.value = desa;
        opt.textContent = desa;
        selectDesa.appendChild(opt);
      });
      selectDesa.disabled = false;
    }

    applyGeoJsonFilter(kecKey, desaKey, slsKey);
  };

  // 2. KETIKA DESA DIPILIH
  selectDesa.onchange = (e) => {
    const selectedKec = selectKec.value;
    const selectedDesa = e.target.value;

    // Reset dropdown SLS
    selectSLS.innerHTML = '<option value="">-- Pilih SLS --</option>';
    selectSLS.disabled = true;

    if (selectedKec && selectedDesa && wilayahHierarchy[selectedKec]?.[selectedDesa]) {
      Array.from(wilayahHierarchy[selectedKec][selectedDesa]).sort().forEach(sls => {
        const opt = document.createElement('option');
        opt.value = sls;
        opt.textContent = sls;
        selectSLS.appendChild(opt);
      });
      selectSLS.disabled = false;
    }

    applyGeoJsonFilter(kecKey, desaKey, slsKey);
  };

  // 3. KETIKA SLS DIPILIH
  selectSLS.onchange = () => {
    applyGeoJsonFilter(kecKey, desaKey, slsKey);
  };
}

/**
 * Menyaring tampilan polygon di peta berdasarkan 3 kriteria & melakukan Auto-Zoom
 */
function applyGeoJsonFilter(kecKey, desaKey, slsKey) {
  if (!currentSLSLayer) return;

  const targetKec = selectKec.value;
  const targetDesa = selectDesa.value;
  const targetSLS = selectSLS.value;

  let bounds = L.latLngBounds([]);

  currentSLSLayer.eachLayer((layer) => {
    const props = layer.feature.properties;
    
    // Evaluasi kecocokan filter
    const matchKec = !targetKec || props[kecKey] === targetKec;
    const matchDesa = !targetDesa || props[desaKey] === targetDesa;
    const matchSLS = !targetSLS || props[slsKey] === targetSLS;

    if (matchKec && matchDesa && matchSLS) {
      // Tampilkan polygon terpilih
      layer.setStyle({ opacity: 1, fillOpacity: 0.4 });
      bounds.extend(layer.getBounds());
    } else {
      // Sembunyikan yang tidak cocok
      layer.setStyle({ opacity: 0, fillOpacity: 0 });
    }
  });

  // Zoom otomatis ke wilayah terseleksi
  if (bounds.isValid()) {
    const mapInstance = currentSLSLayer._map;
    mapInstance.fitBounds(bounds, { padding: [20, 20] });
  }
}