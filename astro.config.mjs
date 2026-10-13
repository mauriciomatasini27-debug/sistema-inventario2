import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // E8-R3: dominio canónico provisorio hasta el dominio real (ver ADR-0022).
  site: process.env.PUBLIC_SITE_URL || "https://inventario.com.ar",
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
