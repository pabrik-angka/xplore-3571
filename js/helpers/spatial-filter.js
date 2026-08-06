// js/helpers/spatial-filter.js
/**
 * Spatial Filter Helper - Pure Spatial Math Logic untuk Xplore 3571
 * Memisahkan logika matematika Ray-Casting & Fast Bounding Box Pruning out of Map Engine.
 */

export const SpatialFilter = {
  /**
   * Ekstraksi daftar polygon layer aktif yang valid
   */
  getActivePolygons(polygonLayerGroup) {
    if (!polygonLayerGroup || typeof polygonLayerGroup.eachLayer !== 'function') return [];
    const activePolygons = [];
    polygonLayerGroup.eachLayer(layer => {
      if (layer.getBounds && layer.getBounds().isValid()) {
        activePolygons.push(layer);
      }
    });
    return activePolygons;
  },

  /**
   * Fast Ray-Casting terhadap Array Active Polygons yang sudah di-filter
   */
  isPointInPolygonFast(latlng, activePolygons) {
    if (!latlng || !Array.isArray(activePolygons) || activePolygons.length === 0) return false;

    const pt = [latlng.lng, latlng.lat];

    for (let pIdx = 0; pIdx < activePolygons.length; pIdx++) {
      const layer = activePolygons[pIdx];

      // Quick BBox test per individual polygon
      if (!layer.getBounds().contains(latlng)) continue;

      let polygons = [];
      if (layer.feature && layer.feature.geometry) {
        if (layer.feature.geometry.type === 'Polygon') {
          polygons = [layer.feature.geometry.coordinates];
        } else if (layer.feature.geometry.type === 'MultiPolygon') {
          polygons = layer.feature.geometry.coordinates;
        }
      }

      for (const poly of polygons) {
        const ring = poly[0];
        let intersect = false;

        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const xi = ring[i][0], yi = ring[i][1];
          const xj = ring[j][0], yj = ring[j][1];
          if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) {
            intersect = !intersect;
          }
        }

        if (intersect) return true;
      }
    }

    return false;
  }
};
