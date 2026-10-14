import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ensureIraqMapCached } from "@/lib/offline-iraq-map";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const BAGHDAD_CENTER: [number, number] = [33.3152, 44.3661];
const BAGHDAD_ZOOM = 11;
const IRAQ_VIEWBOX = "38.7,37.4,48.8,29.0";

function ClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapController({ flyTo }: { flyTo: { lat: number; lng: number; zoom: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom);
    }
  }, [flyTo, map]);
  return null;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

function LocationSearch({
  onResultSelected,
}: {
  onResultSelected: (lat: number, lng: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSearch(e?: { preventDefault?: () => void }) {
    e?.preventDefault?.();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "json");
      url.searchParams.set("q", query.trim());
      url.searchParams.set("countrycodes", "iq");
      url.searchParams.set("viewbox", IRAQ_VIEWBOX);
      url.searchParams.set("bounded", "1");
      url.searchParams.set("limit", "5");
      const res = await fetch(url.toString());
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function selectResult(result: NominatimResult) {
    onResultSelected(parseFloat(result.lat), parseFloat(result.lon));
    setQuery(result.display_name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute end-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="ابحث عن موقع في العراق (مدينة، حي، معلم...)"
            className="pe-8"
          />
        </div>
        <Button type="button" variant="secondary" disabled={searching} onClick={() => handleSearch()}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "بحث"}
        </Button>
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-[1000] mt-1 w-full rounded-md border bg-popover shadow-md max-h-52 overflow-y-auto">
          {results.map((result, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectResult(result)}
              className="w-full text-start px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-b last:border-b-0"
            >
              {result.display_name}
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && !searching && (
        <div className="absolute z-[1000] mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
          لم يتم العثور على نتائج
        </div>
      )}
    </div>
  );
}

interface HallLocationMapProps {
  mapKey: string | number;
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
}

export function HallLocationMap({ mapKey, latitude, longitude, onChange }: HallLocationMapProps) {
  const hasPosition = latitude != null && longitude != null;
  const center: [number, number] = hasPosition ? [latitude!, longitude!] : BAGHDAD_CENTER;
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const cacheTriggered = useRef(false);

  useEffect(() => {
    if (cacheTriggered.current) return;
    cacheTriggered.current = true;
    void ensureIraqMapCached();
  }, []);

  function handleSearchSelect(lat: number, lng: number) {
    setFlyTo({ lat, lng, zoom: 15 });
    onChange(lat, lng);
  }

  return (
    <div className="space-y-2">
      <LocationSearch onResultSelected={handleSearchSelect} />
      <div className="rounded-lg overflow-hidden border" style={{ height: 300 }} dir="ltr">
        <MapContainer
          key={mapKey}
          center={center}
          zoom={hasPosition ? 15 : BAGHDAD_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics"
          />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          />
          <ClickHandler onSelect={onChange} />
          <MapController flyTo={flyTo} />
          {hasPosition && <Marker position={[latitude!, longitude!]} icon={defaultIcon} />}
        </MapContainer>
      </div>
    </div>
  );
}
