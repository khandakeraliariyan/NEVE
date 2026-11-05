"use client";

import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DHAKA } from "../lib/geo";

function ClickHandler({ onPick }) {
    useMapEvents({
        click: (event) => onPick({ latitude: Number(event.latlng.lat.toFixed(6)), longitude: Number(event.latlng.lng.toFixed(6)) }),
    });
    return null;
}

// value: { latitude, longitude } | null
export default function PinPicker({ value, onChange, className = "h-72" }) {
    const position = value ? [value.latitude, value.longitude] : null;
    return (
        <div className={`overflow-hidden rounded-2xl border border-line ${className}`}>
            <MapContainer center={position ?? DHAKA} zoom={position ? 15 : 12} scrollWheelZoom={false} className="h-full w-full">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickHandler onPick={onChange} />
                {position && <CircleMarker center={position} radius={10} pathOptions={{ color: "#fff", weight: 2, fillColor: "#173f2f", fillOpacity: 1 }} />}
            </MapContainer>
        </div>
    );
}
