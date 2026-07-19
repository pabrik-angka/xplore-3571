// js/sourceRegistry.js
// import { bangunanTemplateHandler } from '../map-modules/bangunan-template.js';
import { sentraEkonomiHandler } from '../map-modules/sentra-ekonomi.js';
import { usahaSuplemenHandler } from '../map-modules/usaha-suplemen.js';
import { FasihSE2026 } from '../map-modules/fasih-se2026.js';

const registry = {
  'template-blank-bangunan': {
    name: "Usaha Suplemen (KDM)",
    handler: usahaSuplemenHandler
  },
  'sentra-ekonomi': { 
    name: "Sentra Ekonomi (SWMAPS)", 
    handler: sentraEkonomiHandler 
  },
  'fasih-se2026': {
    name: FasihSE2026.name,
    handler: FasihSE2026
  }
};

export function getHandler(sourceId) {
  return registry[sourceId] || null;
}

export function getAllBuildingSources() {
  return Object.entries(registry).map(([id, item]) => ({ id, name: item.name }));
}