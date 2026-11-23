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
  // NAV-S1 (ADR-0130): calienta la próxima página al pasar el puntero o enfocar el enlace.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
