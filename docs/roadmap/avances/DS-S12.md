---
item: DS-S12
estado: hecho
adr: ADR-0008
prd: PRD-DS-02
fecha: 2026-10-17
---
DS-S12: la franja KPI de `/panel` (`KpiStrip.astro`) arranca con skeleton y shimmer sutil en tokens `--tema-*` y `aria-busy="true"`; al llegar `/api/sales/resumen` y `/api/cash/balance` los valores entran escalonados (60 ms por KPI) y `aria-busy` pasa a `false`; con `prefers-reduced-motion: reduce` el skeleton queda estático y sin entrada.
