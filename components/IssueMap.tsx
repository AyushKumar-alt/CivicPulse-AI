"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

function fixIcons() {
  const proto = L.Icon.Default.prototype as unknown as Record<string, unknown>;
  delete proto._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

const SEV_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
};

interface IssueMapProps {
  lat: number;
  lng: number;
  issueType?: string;
  address?: string | null;
  severity?: string;
  height?: string;
}

export default function IssueMap({
  lat,
  lng,
  issueType,
  address,
  severity,
  height = "260px",
}: IssueMapProps) {
  useEffect(() => { fixIcons(); }, []);

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height, width: "100%", borderRadius: "12px", zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]}>
        <Popup>
          <div style={{ minWidth: "160px", lineHeight: "1.6" }}>
            {issueType && (
              <p style={{ fontWeight: 700, fontSize: "13px", margin: "0 0 2px" }}>{issueType}</p>
            )}
            {severity && (
              <p style={{
                fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                color: SEV_COLOR[severity] ?? "#888", margin: "0 0 4px",
              }}>
                {severity}
              </p>
            )}
            {address && (
              <p style={{ fontSize: "11px", color: "#444", margin: 0 }}>{address}</p>
            )}
            <p style={{ fontSize: "10px", color: "#aaa", margin: "4px 0 0" }}>
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </p>
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
