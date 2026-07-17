// Contoh cuplikan logika pencarian properti secara dinamis di layers.js
export function findCoordinateKeys(properties) {
  const latCandidates = ['latitude', 'lat', 'y', 'koordinat_y'];
  const lonCandidates = ['longitude', 'lon', 'lng', 'x', 'koordinat_x'];
  
  let latKey = null;
  let lonKey = null;

  for (const key of Object.keys(properties)) {
    const lowerKey = key.toLowerCase();
    if (latCandidates.includes(lowerKey)) latKey = key;
    if (lonCandidates.includes(lowerKey)) lonKey = key;
  }
  return { latKey, lonKey };
}