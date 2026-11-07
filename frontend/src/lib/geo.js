export const DHAKA = [23.8103, 90.4125];

// GeoJSON stores [longitude, latitude]; Leaflet wants [latitude, longitude].
export function toLatLng(property) {
    const coords = property?.address?.location?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) return [coords[1], coords[0]];
    const { latitude, longitude } = property?.location ?? {};
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return [latitude, longitude];
    return null;
}
