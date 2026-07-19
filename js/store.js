// js/store.js
import { getHandler } from './sourceRegistry.js'; // <-- Di dalam folder yang sama

export async function parseGeoJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        resolve(json);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof Papa === 'undefined') {
      reject(new Error('PapaParse library belum dimuat.'));
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error)
    });
  });
}

export function processBuildingsData(rawData, sourceId, format = 'geojson') {
  try {
    const handler = getHandler(sourceId);
    if (!handler) throw new Error(`Handler data tidak ditemukan untuk ID: ${sourceId}`);

    let features = [];
    if (format === 'geojson') {
      features = rawData.features || [];
    } else if (format === 'csv') {
      features = rawData.map(row => ({ type: 'Feature', properties: row }));
    }

    return features.map(feat => handler.toLayerConfig(feat));
  } catch (error) {
    console.error('[Store Module - processBuildingsData Error]:', error);
    return [];
  }
}