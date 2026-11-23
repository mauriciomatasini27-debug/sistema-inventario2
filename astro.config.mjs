import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "https://modoops2791.vercel.app",
  devToolbar: { enabled: process.env.CONTROL_APP_DEV !== "1" },
  output: "server",
  adapter: vercel(),
  integrations: [react()],
  // NAV-S1 (ADR-0130): precarga la próxima página para que la navegación MPA no
  // espere el SSR; las View Transitions van por CSS, sin router SPA.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
