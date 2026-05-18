import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { GST_RATE, formatCurrency } from "@/lib/helpers";

export const CLIENT_MODE_STORAGE_KEY = "joinerflow-client-screen-mode";

const ClientModeContext = createContext(null);

function canUseStorage() {
  return (
    typeof window !== "undefined"
    && typeof window.localStorage !== "undefined"
    && typeof window.localStorage.getItem === "function"
    && typeof window.localStorage.setItem === "function"
  );
}

function readStoredClientMode() {
  if (!canUseStorage()) return false;
  try {
    return window.localStorage.getItem(CLIENT_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredClientMode(enabled) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(CLIENT_MODE_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Keep the in-memory mode even if storage is unavailable.
  }
}

export function toClientFacingIncGst(value, gstRate = GST_RATE) {
  const amount = Number(value || 0);
  return Math.round(amount * (1 + Number(gstRate || 0)) * 100) / 100;
}

export function formatClientCurrency(value, options) {
  return formatCurrency(value, options);
}

export function clientModeLabel(enabled) {
  return enabled ? "Client Mode On" : "Client Mode Off";
}

export function isSensitivePricingField(labelOrKey = "") {
  const normalized = String(labelOrKey || "").toLowerCase();
  return [
    "cost",
    "buy",
    "markup",
    "margin",
    "profit",
    "supplier price",
    "gross",
    "material margin",
    "return",
    "ex gst",
    "labour cost",
    "labor cost",
    "direct purchase",
  ].some((term) => normalized.includes(term));
}

export function ClientModeProvider({ children }) {
  const [clientMode, setClientModeState] = useState(readStoredClientMode);

  const setClientMode = useCallback((enabled, options = {}) => {
    const nextEnabled = enabled === true;
    setClientModeState(nextEnabled);
    writeStoredClientMode(nextEnabled);

    if (!options.silent) {
      toast({
        title: nextEnabled ? "Client Screen Mode enabled" : "Client Screen Mode disabled",
        description: nextEnabled
          ? "Internal pricing, costs, markups, and margins are hidden."
          : "Internal operational pricing is visible again.",
      });
    }
  }, []);

  const toggleClientMode = useCallback(() => {
    setClientMode(!clientMode);
  }, [clientMode, setClientMode]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && String(event.key || "").toLowerCase() === "p") {
        event.preventDefault();
        toggleClientMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleClientMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("client-screen-mode", clientMode);
  }, [clientMode]);

  const value = useMemo(() => ({
    clientMode,
    setClientMode,
    toggleClientMode,
  }), [clientMode, setClientMode, toggleClientMode]);

  return <ClientModeContext.Provider value={value}>{children}</ClientModeContext.Provider>;
}

export function useClientMode() {
  const context = useContext(ClientModeContext);
  if (!context) {
    throw new Error("useClientMode must be used inside ClientModeProvider.");
  }
  return context;
}

export function Sensitive({ children, fallback = null }) {
  const { clientMode } = useClientMode();
  return clientMode ? fallback : children;
}
