import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import { Input } from "@/components/ui/input";
import SearchOverlay from "./SearchOverlay";

const RECENTS_KEY = "joinerflow-unified-search-recents";

export default function UnifiedSearchBar({ clientMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState(() => readRecents());

  const flatResults = useMemo(() => {
    const groups = response?.groups || {};
    return [
      ...(groups.entities || []),
      ...(groups.files || []),
      ...(groups.insights || []),
      ...(groups.actions || []),
    ].filter((item) => item.href);
  }, [response]);

  const activeId = flatResults[activeIndex]?.id || "";
  const open = focused && (query.trim().length >= 2 || recents.length > 0);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResponse(buildRecentResponse(recents));
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      crmApi.ai.unifiedSearch({
        query: trimmed,
        include_ai: looksLikeQuestion(trimmed),
        limit: 18,
        context: {
          pathname: location.pathname,
          client_mode: clientMode,
        },
      }, {
        signal: controller.signal,
      })
        .then((nextResponse) => {
          if (!cancelled) {
            setResponse(nextResponse);
            setActiveIndex(0);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            if (String(error?.name || "") === "AbortError") return;
            setResponse({
              groups: {},
              suggestions: [],
              answer: {
                status: "unavailable",
                answer: "Unified search is temporarily unavailable. Try again shortly.",
                confidence: "low",
                sources: [],
              },
              diagnostics: { degraded: true },
            });
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [clientMode, location.pathname, query, recents]);

  useEffect(() => {
    setQuery("");
    setFocused(false);
  }, [location.pathname]);

  const openHref = (href) => {
    if (!href) return;
    const trimmed = query.trim();
    if (trimmed) {
      const next = writeRecent(trimmed, recents);
      setRecents(next);
    }
    setQuery("");
    setFocused(false);
    if (/^https?:\/\//i.test(href) || href.startsWith("/api/")) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      navigate(href);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(flatResults.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && flatResults.length > 0) {
      event.preventDefault();
      openHref(flatResults[activeIndex]?.href);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFocused(false);
    }
  };

  return (
    <div className="jf-global-search relative flex w-full max-w-[44rem]">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 140)}
        onKeyDown={handleKeyDown}
        placeholder="Search records, files, workflows, or ask an operational question..."
        aria-label="Unified operational search"
        aria-expanded={open}
        aria-controls="joinerflow-unified-search"
        className="h-10 w-[min(42rem,calc(100vw-8rem))] rounded-full border-border/50 bg-white/70 pl-10 pr-4 text-sm shadow-sm focus-visible:bg-card md:w-[34rem] xl:w-[42rem]"
      />
      <SearchOverlay
        id="joinerflow-unified-search"
        open={open}
        response={response}
        loading={loading}
        query={query}
        activeId={activeId}
        onOpen={openHref}
        onHover={(id) => setActiveIndex(Math.max(0, flatResults.findIndex((item) => item.id === id)))}
        onSuggestion={(nextQuery) => {
          setQuery(nextQuery);
          inputRef.current?.focus();
        }}
      />
    </div>
  );
}

function looksLikeQuestion(value) {
  return /^(what|which|who|when|where|why|how|show me|find|list|summari[sz]e|compare)\b/i.test(value) || value.includes("?");
}

function isTypingTarget(target) {
  const tag = String(target?.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || target?.isContentEditable;
}

function readRecents() {
  try {
    return JSON.parse(window.localStorage.getItem(RECENTS_KEY) || "[]").slice(0, 5);
  } catch {
    return [];
  }
}

function writeRecent(query, current) {
  const next = [query, ...current.filter((item) => item !== query)].slice(0, 5);
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Recents are only a convenience.
  }
  return next;
}

function buildRecentResponse(recents) {
  if (!recents.length) return null;
  return {
    groups: {
      actions: recents.map((item) => ({
        id: `recent:${item}`,
        kind: "action",
        type: "Recent",
        title: item,
        subtitle: "Run this operational search again",
        href: "",
        score: 0.1,
      })),
    },
    suggestions: recents.map((item, index) => ({
      id: `recent-suggestion-${index}`,
      label: item,
      query: item,
      reason: "recent",
    })),
  };
}
