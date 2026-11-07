"use client";

import dynamic from "next/dynamic";

export { toLatLng } from "../lib/geo";

// Leaflet needs `window`, so the map only loads in the browser.
const MapView = dynamic(() => import("./LeafletMap"), {
    ssr: false,
    loading: () => <div className="h-96 animate-pulse rounded-2xl border border-line bg-mist" />,
});

export default MapView;
