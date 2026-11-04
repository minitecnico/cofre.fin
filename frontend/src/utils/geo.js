/**
 * Contas de mapa feitas no aparelho — funcionam sem internet.
 */

const R = 6371000; // raio médio da Terra em metros
const rad = (deg) => (deg * Math.PI) / 180;

/** Distância em linha reta (haversine), em metros. */
export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const COMPASS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

/** Direção de `a` para `b` na rosa dos ventos (N, NE, L, ...). */
export function compassDirection(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat))
    - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace('.', ',')} km`;
}

/** Link de rota no Google Maps (abre o app no celular — que tem mapa offline próprio). */
export function routeUrl({ lat, lng }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
