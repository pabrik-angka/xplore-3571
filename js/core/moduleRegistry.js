// js/core/moduleRegistry.js
/**
 * Xplore 3571 - Module Registry
 * Dipindahkan dari js/moduleRegistry.js ke js/core/ sesuai arsitektur DDS-Lite.
 * Single source of truth untuk semua data-module yang tersedia di sistem.
 *
 * API Publik:
 *   getModule(id)          → handler | null
 *   getAllModules()         → Array<handler>
 *   getModulesByType(type) → Array<handler>  (type: 'polygon' | 'building')
 *
 * Alias backward-compat:
 *   getPolygonHandler(id)  → alias getModule(id)
 *   getAllPolygonSources()  → alias getModulesByType('polygon') dengan shape lama
 *   getHandler(id)         → alias getModule(id), dikemas { name, handler }
 *   getAllBuildingSources() → alias getModulesByType('building') dengan shape lama
 */

// ═══ IMPORT SEMUA MODUL DI SINI ═══
// Untuk menambah modul baru: cukup import dan panggil _register() di bawah.
import { wilkerstatSE2026 } from '../../data-modules/wilkerstat.strategy.js';
import { sentraEkonomiHandler } from '../../data-modules/sentra.strategy.js';
import { usahaSuplemenHandler } from '../../data-modules/usaha-suplemen.strategy.js';
import { se2026GetagUsaha } from '../../data-modules/se2026-geotag-usaha-dan-keluarga.js';
// import { namaModulBaru }   from '../../data-modules/nama-modul-baru.strategy.js';

/** @type {Map<string, Object>} */
const _registry = new Map();
/**
 * Mendaftarkan sebuah handler ke registry. Handler WAJIB punya properti `id` dan `name`.
 * @param {Object} handler
 */
function _register(handler) {
  try {
    if (!handler?.id || !handler?.name) {
      throw new Error(`Handler harus memiliki properti 'id' dan 'name'. Diterima: ${JSON.stringify(handler)}`);
    }
    _registry.set(handler.id, handler);
  } catch (err) {
    console.error('[moduleRegistry - _register Error]:', err.message);
  }
}

// ═══ REGISTRASI BERURUTAN (aman dari circular dependency) ═══
_register(wilkerstatSE2026);
_register(se2026GetagUsaha);
_register(sentraEkonomiHandler);
_register(usahaSuplemenHandler);
// ──────────────────────────────────────────────
// API PUBLIK
// ──────────────────────────────────────────────

/**
 * Mengambil handler berdasarkan ID.
 * @param {string} id
 * @returns {Object|null}
 */
export function getModule(id) {
  return _registry.get(id) ?? null;
}

/**
 * Mengembalikan semua handler yang terdaftar sebagai array.
 * @returns {Array<Object>}
 */
export function getAllModules() {
  return Array.from(_registry.values());
}

/**
 * Mengembalikan semua handler yang sesuai dengan tipe tertentu.
 * @param {'polygon'|'building'|string} type
 * @returns {Array<Object>}
 */
export function getModulesByType(type) {
  return getAllModules().filter(m => m.type === type);
}

// ──────────────────────────────────────────────
// ALIAS BACKWARD-COMPAT
// ──────────────────────────────────────────────

/** @alias getModule — dipakai oleh store.js */
export function getPolygonHandler(id) {
  return getModule(id);
}

/**
 * Mengembalikan daftar modul poligon dalam shape lama { id, name, maxDepth }.
 * @alias getModulesByType('polygon')
 */
export function getAllPolygonSources() {
  return getModulesByType('polygon').map(m => ({
    id: m.id,
    name: m.name,
    maxDepth: m.maxDepth
  }));
}

/**
 * Mengembalikan handler bangunan dalam shape { name, handler }.
 * @param {string} id
 * @returns {{ name: string, handler: Object }|null}
 */
export function getHandler(id) {
  const m = getModule(id);
  if (!m) return null;
  return { name: m.name, handler: m };
}

/**
 * Mengembalikan daftar modul bangunan dalam shape lama { id, name }.
 * @alias getModulesByType('building')
 */
export function getAllBuildingSources() {
  return getModulesByType('building').map(m => ({ id: m.id, name: m.name }));
}
