---
item: DS-LANDING-AA
estado: hecho
adr: ADR-0008
prd: PRD-DS-01
fecha: 2026-10-17
---
Landing `/` legible en Tema Papel con header claro (decisión de Mauri): texto oscuro en secciones claras y claro en las oscuras, botón WhatsApp con token `--color-whatsapp` y texto `void` (también en `/alta/estado`), CTA de emails en `#bf360c`, 3 pares nuevos en `check-contrast` (16/16), spec Playwright que mide el contraste real de cada texto a 360px y 1280px, trinquete estático `tests/landing-legibilidad.test.ts` y `/admin` sin desborde a 360px.
