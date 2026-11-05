"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DHAKA } from "../lib/geo";

function FitBounds({ points }) {
    const map = useMap();
    useEffect(() => {
        if (points.length === 1) map.setView(points[0], 15);
        else if (points.length > 1) map.fitBounds(points, { padding: [30, 30] });
    }, [map, points]);
    return null;
}

function MoveListener({ onMove }) {
    useMapEvents({
        moveend: (event) => {
            const center = event.target.getCenter();
            onMove?.({ latitude: center.lat, longitude: center.lng });
        },
    });
    return null;
}

/**
 * markers: [{ id, position: [lat, lng], label, tone: "primary" | "secondary", popup }]
 */
export default function MapView({ markers = [], center, zoom = 13, className = "h-96", onMove, fit = true }) {
    const points = markers.map((m) => m.position);
    return (
        <div className={`overflow-hidden rounded-2xl border border-line ${className}`}>
            <MapContainer center={center ?? points[0] ?? DHAKA} zoom={zoom} scrollWheelZoom={false} className="h-full w-full">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {fit && <FitBounds points={points} />}
                {onMove && <MoveListener onMove={onMove} />}
                {markers.map((marker) => (
                    <CircleMarker
                        key={marker.id}
                        center={marker.position}
                        radius={marker.tone === "secondary" ? 6 : 10}
                        pathOptions={{
                            color: "#ffffff",
                            weight: 2,
                            fillColor: marker.tone === "secondary" ? "#2f6b4f" : "#173f2f",
                            fillOpacity: 0.95,
                        }}
                    >
                        {marker.popup && <Popup>{marker.popup}</Popup>}
                    </CircleMarker>
                ))}
            </MapContainer>
        </div>
    );
}
