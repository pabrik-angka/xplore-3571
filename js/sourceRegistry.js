// js/sourceRegistry.js
import { bangunanTemplateHandler } from '../map-modules/bangunan-template.js';

const registry = {
  'template-blank-bangunan': {
    name: "Template Blank Bangunan (CSV/GeoJSON)",
    handler: bangunanTemplateHandler
  }
  // 'sourceB': { name: "Sumber B", handler: sourceBHandler } // Buka jika sudah ada
};

export function getHandler(sourceId) {
  return registry[sourceId] || null;
}

export function getAllBuildingSources() {
  return Object.entries(registry).map(([id, item]) => ({ id, name: item.name }));
}