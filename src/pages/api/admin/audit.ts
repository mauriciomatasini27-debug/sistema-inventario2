// LANE admin — Alias OP-S1/ADR-0006 (PA2).
//
// El contrato nombra `GET /api/admin/audit?tenant=&desde=&hasta=`; el código
// histórico expone `/api/admin/actos`. Alias sin lógica propia: delega al
// GET de actos para no crear doble fuente de verdad.
export { GET } from "./actos.js";
export const prerender = false;
