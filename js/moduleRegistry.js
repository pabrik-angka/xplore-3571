// js/moduleRegistry.js
/**
 * Single source of truth untuk semua data-module yang tersedia di sistem.
 * Menggantikan polygonRegistry.js dan sourceRegistry.js.
 *
 * API Publik:
 *   getModule(id)          → handler | null
 *   getAllModules()         → Array<handler>
 *   getModulesByType(type) → Array<handler>  (type: 'polygon' | 'building')
 *
 * Alias backward-compat (agar store.js, ui.js, modal.js tidak perlu diubah sekaligus):
 *   getPolygonHandler(id)  → alias getModule(id)
 *   getAllPolygonSources()  → alias getModulesByType('polygon') dengan shape lama
 *   getHandler(id)         → alias getModule(id), dikemas { name, handler } untuk store.js
 *   getAllBuildingSources() → alias getModulesByType('building') dengan shape lama
 */

// ═══ IMPORT SEMUA MODUL DI SINI ═══
// Untuk menambah modul baru: cukup import dan panggil _register() di bawah.
import { wilkerstatSE2026 }    from '../data-modules/wilkerstat-se2026.js';
import { sentraEkonomiHandler } from '../data-modules/sentra-ekonomi.js';
import { usahaSuplemenHandler } from '../data-modules/usaha-suplemen.js';
import { FasihSE2026 }         from '../data-modules/fasih-se2026.js';
// import { namaModulBaru }   from '../data-modules/nama-modul-baru.js';

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
_register(FasihSE2026);
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
// ALIAS BACKWARD-COMPAT — Untuk store.js, ui.js, modal.js
// Tidak perlu diubah saat semua konsumen sudah dimigrasi ke API baru di atas.
// ──────────────────────────────────────────────

/** @alias getModule — dipakai oleh store.js */
export function getPolygonHandler(id) {
  return getModule(id);
}

/**
 * Mengembalikan daftar modul poligon dalam shape lama { id, name, maxDepth }.
 * @alias getModulesByType('polygon') — dipakai oleh ui.js & modal.js
 */
export function getAllPolygonSources() {
  return getModulesByType('polygon').map(m => ({
    id: m.id,
    name: m.name,
    maxDepth: m.maxDepth
  }));
}

/**
 * Mengembalikan handler bangunan dalam shape { name, handler } agar store.js tidak perlu diubah.
 * @alias getModule — dipakai oleh ui.js, kemudian diteruskan ke store.processBuildingFile()
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
 * @alias getModulesByType('building') — dipakai oleh ui.js & modal.js
 */
export function getAllBuildingSources() {
  return getModulesByType('building').map(m => ({ id: m.id, name: m.name }));
}
