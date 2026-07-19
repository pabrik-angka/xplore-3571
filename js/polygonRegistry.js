// js/polygonRegistry.js
import { wilkerstatSE2026 } from '../map-modules/wilkerstat-se2026.js';
import { wilayahTemplateHandler } from '../map-modules/wilayah-template.js';

const polygonRegistry = {
  'wilkerstat-se2026': {
    name: "Wilkerstat SE2026 (Kec -> Kel -> SLS)",
    handler: wilkerstatSE2026,
    maxDepth: 'sls'
  },
  'template-blank-wilayah': {
    name: "Template Blank Wilayah GeoJSON",
    handler: wilayahTemplateHandler,
    maxDepth: 'sls'
  }
};

export function getPolygonHandler(id) {
  return polygonRegistry[id] || null;
}

export function getAllPolygonSources() {
  return Object.entries(polygonRegistry).map(([id, item]) => ({ id, name: item.name }));
}