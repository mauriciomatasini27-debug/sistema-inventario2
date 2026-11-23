---
item: NAV-S6
estado: hecho
adr: ADR-0132
prd: PRD-NAV-03
fecha: 2026-11-23
---
NAV-S6: con `prefers-reduced-motion: reduce` no se marca `reveal`, no se crea el `IntersectionObserver` y `NumberFlow` no anima precios; con movimiento, `reveal` y NumberFlow quedan dentro de un tope de 240 ms por animación.
