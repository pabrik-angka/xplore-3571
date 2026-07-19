// js/polygonRegistry.js
import { wilkerstatSE2026 } from '../map-modules/wilkerstat-se2026.js';
// import { modulLain } from '../map-modules/modul-lain.js'; <-- jika ada modul baru besok-besok

// Objek penampung utama
const polygonRegistry = {};

/**
 * Mendaftarkan handler polygon secara dinamis
 * @param {Object} module Config object dari spatial module
 */
export function registerPolygon(module) {
  try {
    if (!module || !module.id || !module.name) {
      throw new Error("Modul harus memiliki properti 'id' dan 'name'.");
    }
    polygonRegistry[module.id] = module;
  } catch (error) {
    console.error('[polygonRegistry - registerPolygon Error]:', error);
  }
}

// LAKUKAN REGISTRASI DI SINI SECARA BERURUTAN (Aman dari circular dependency)
registerPolygon(wilkerstatSE2026);

export function getPolygonHandler(id) {
  return polygonRegistry[id] || null;
}

export function getAllPolygonSources() {
  return Object.entries(polygonRegistry).map(([id, item]) => ({ 
    id, 
    name: item.name,
    maxDepth: item.maxDepth 
  }));
}