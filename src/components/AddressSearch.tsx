import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Loader2 } from "lucide-react";

interface AddressResult {
  label: string;
  lon: number;
  lat: number;
}

interface Props {
  onSelect: (lon: number, lat: number, label: string) => void;
}

export function AddressSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5`
      );
      const json = await res.json();
      const items: AddressResult[] = (json.features || []).map((f: any) => ({
        label: f.properties?.label || f.properties?.name || "",
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      }));
      setResults(items);
      setOpen(items.length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Rechercher une adresse en France..."
          className="pl-10 pr-10 bg-background border-border"
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-[2000] mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-[60vh] overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-popover-foreground hover:bg-muted transition-colors first:rounded-t-md last:rounded-b-md"
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(r.label);
                setOpen(false);
                onSelect(r.lon, r.lat, r.label);
              }}
            >
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-left">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
