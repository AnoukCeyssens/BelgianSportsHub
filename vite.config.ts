import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
    // Installable app + offline reading (spec #20, story 117). The service
    // worker is pwa/service-worker.ts; root.tsx registers it and links the
    // manifest (there is no index.html for the plugin to inject into).
    VitePWA({
      strategies: "injectManifest",
      srcDir: "pwa",
      filename: "service-worker.ts",
      outDir: "build/client",
      injectRegister: false,
      registerType: "autoUpdate",
      // Icons are precached by globPatterns below.
      includeManifestIcons: false,
      manifest: {
        id: "/",
        name: "BelgianSportsHub",
        short_name: "BE Sports",
        description: "Belgium's senior Olympic Athletes and Teams, LA 2028 and French Alps 2030.",
        lang: "en",
        start_url: "/athletes",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f6f5f1",
        theme_color: "#1c1c1c",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        globDirectory: "build/client",
        globPatterns: ["assets/**/*.{js,css}", "icons/*.png", "offline*.html", "favicon.svg"],
      },
    }),
  ],
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
});
