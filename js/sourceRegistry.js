// js/sourceRegistry.js
// import { bangunanTemplateHandler } from '../map-modules/bangunan-template.js';
import { sentraEkonomiHandler } from '../map-modules/sentra-ekonomi.js';
import { usahaSuplemenHandler } from '../map-modules/usaha-suplemen.js';

const registry = {
  'template-blank-bangunan': {
    name: "Usaha Suplemen (KDM)",
    handler: usahaSuplemenHandler
  },
  'sentra-ekonomi': { 
    name: "Sentra Ekonomi (SWMAPS)", 
    handler: sentraEkonomiHandler 
  }
};

export function getHandler(sourceId) {
  return registry[sourceId] || null;
}

export function getAllBuildingSources() {
  return Object.entries(registry).map(([id, item]) => ({ id, name: item.name }));
}