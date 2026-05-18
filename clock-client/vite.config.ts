import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function normalizeRemoteAddress(address: string | undefined) {
  if (!address) {
    return "";
  }

  if (address.startsWith("::ffff:")) {
    return address.slice(7);
  }

  const zoneIndex = address.indexOf("%");
  if (zoneIndex >= 0) {
    return address.slice(0, zoneIndex);
  }

  return address;
}

function isPrivateIpv4(address: string) {
  if (address.startsWith("10.") || address.startsWith("192.168.") || address.startsWith("169.254.")) {
    return true;
  }

  if (!address.startsWith("172.")) {
    return false;
  }

  const secondOctet = Number(address.split(".")[1] || -1);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isLocalNetworkAddress(address: string) {
  const normalized = normalizeRemoteAddress(address);

  if (!normalized) {
    return false;
  }

  if (normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }

  if (normalized.includes(".")) {
    return isPrivateIpv4(normalized);
  }

  return normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
}

function localNetworkOnlyPlugin() {
  const guard = (req: any, res: any, next: () => void) => {
    const remoteAddress = req.socket?.remoteAddress || "";

    if (isLocalNetworkAddress(remoteAddress)) {
      next();
      return;
    }

    res.statusCode = 403;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("This time clock is only available from the local network.");
  };

  return {
    name: "local-network-only",
    configureServer(server: any) {
      server.middlewares.use(guard);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(guard);
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_KIND": JSON.stringify("timeclock"),
    "import.meta.env.VITE_TIMECLOCK_KIOSK_KEY": JSON.stringify(
      process.env.VITE_TIMECLOCK_KIOSK_KEY || process.env.TIMECLOCK_KIOSK_KEY || ""
    ),
  },
  plugins: [react(), localNetworkOnlyPlugin()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": fileURLToPath(new URL("../client/src", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    fs: {
      allow: [".."],
    },
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4174,
    strictPort: true,
  },
});
