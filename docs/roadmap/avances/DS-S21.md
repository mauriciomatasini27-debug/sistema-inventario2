---
item: DS-S21
estado: hecho
adr: ADR-0002
prd: PRD-DS-03
fecha: 2026-10-17
---
DS-S21: el papel del email pasa a un solo lugar, `src/modules/email/papel.ts`, que arma el documento completo (metas `color-scheme` y `supported-color-schemes`, `color-scheme: light dark` en el root, `<style>` con `@media (prefers-color-scheme: dark)` a `#1a1a1a`/`#f7f5f2` y bordes `#3a3a3a`) sobre las nueve plantillas de `src/modules/email/`, con las clases estables `ne-papel`, `ne-mute`, `ne-tabla` y `ne-cta` para que la media query alcance el inline claro; el CTA queda `#bf360c` con blanco a 44px de alto (14+14 de padding más 16 de línea) y `display:block`, y las tablas con `table-layout:fixed` y `overflow-wrap:anywhere` para entrar a 360px; decisión: documento entero y no fragmento porque los metas de color-scheme solo existen en `<head>` y el outbox entrega el html tal cual al proveedor sin otra capa que envuelva, y el inline queda con la base clara para los clientes que ignoran `<style>`; trinquete en `tests/email-papel.test.ts` (57 casos sobre las 16 salidas generadas, sin `<img>` en ninguna), pares nuevos de dark en `check:contrast` (69/69) y regenerado `docs/diseno/contraste-aa.md`.