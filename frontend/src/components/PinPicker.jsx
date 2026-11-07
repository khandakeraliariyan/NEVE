"use client";

import dynamic from "next/dynamic";

// Leaflet needs `window`, so the picker only loads in the browser.
const PinPicker = dynamic(() => import("./LeafletPinPicker"), {
    ssr: false,
    loading: () => <div className="h-72 animate-pulse rounded-2xl border border-line bg-mist" />,
});

export default PinPicker;
