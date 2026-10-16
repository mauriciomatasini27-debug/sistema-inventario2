---
item: SYNC-S1
estado: hecho
adr: ADR-0023
prd: PRD-SYNC-01
fecha: 2026-10-16
---
SYNC-S1/S2 hecho: pull por lotes topado a 50 en el repo con cursor estable por outbox append-only y alcance por tenant (tests/sync-s1-s2.test.ts 10/10, incluye PG A/B con 10k productos) más búsqueda difusa local pura en src/offline/busqueda-local.ts; pendientes sin migración: cursor keyset sobre (createdAt, opId) con índice si el volumen exige paginado estable ante escrituras concurrentes desordenadas.
