import { useEffect, useId, useRef, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import { Input } from "@/components/ui/input";

function buildSecondaryLabel(suggestion) {
  const address = suggestion.address || {};
  return [
    address.suburb || address.neighbourhood,
    address.city || address.town || address.village,
    address.postcode,
  ].filter(Boolean).join(" · ");
}

export default function AddressAutocompleteInput({
  value,
  onChange,
  placeholder = "Start typing a New Zealand address",
  inputId,
}) {
  const generatedInputId = useId();
  const resolvedInputId = inputId || generatedInputId;
  const containerRef = useRef(null);
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  useEffect(() => {
    setQuery(value || "");
    setHasUserInteracted(false);
  }, [value]);

  useEffect(() => {
    if (!hasUserInteracted) {
      return undefined;
    }

    const normalizedQuery = String(query || "").trim();

    if (normalizedQuery.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setLoading(true);
        const results = await crmApi.addresses.search(normalizedQuery);
        setSuggestions(Array.isArray(results) ? results : []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const handleSelect = (suggestion) => {
    const nextValue = suggestion.display_name || "";
    setQuery(nextValue);
    setHasUserInteracted(false);
    onChange(nextValue, suggestion);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={resolvedInputId}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          if (suggestions.length > 0) {
            setOpen(true);
          }
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          setHasUserInteracted(true);
          onChange(nextValue, null);
          if (nextValue.trim().length < 3) {
            setSuggestions([]);
            setOpen(false);
          }
        }}
      />

      {open && (loading || suggestions.length > 0 || query.trim().length >= 3) && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching New Zealand addresses...</div>
          ) : suggestions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No address matches found.</div>
          ) : (
            suggestions.map((suggestion) => (
              <button
                key={suggestion.place_id}
                type="button"
                onClick={() => handleSelect(suggestion)}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/50"
              >
                <span className="text-sm font-medium">{suggestion.display_name}</span>
                <span className="text-xs text-muted-foreground">{buildSecondaryLabel(suggestion)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
