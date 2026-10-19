---
item: FE-S26
estado: parcial
adr: ADR-0018
prd: PRD-FE-01
fecha: 2026-10-19
---
FE-S26 parcial: `fiscal_computers` y `arca_tokens` dejan de ser tablas sin uso. `src/lib/repos/fiscal-control.ts` guarda el computador con `key_pem` cifrado por el KMS (`FISCAL_KMS_KEY_B64`, sin fallback a texto plano), lo lee descifrado y persiste la TA de WSAA (`token` y `sign`) cifrada con vencimiento. `crear_arca_provider` acepta una `TaDurable`: antes de pedir login a WSAA lee la TA de otro worker, y después del login guarda la nueva. Si la base o el KMS fallan, avisa y sigue con el login, nunca bloquea la emisión. `POST /api/fiscal/emitir` cablea la TA durable con `taDurablePara`. El endurecimiento queda en ADR-0098 y PRD-FE-03 (alta idempotente con `.returning`, fallback registrado, ambiente validado al leer, test del store drizzle contra el control DB). Falta para cerrar FE-S26 el CSR y alta del certificado WSASS, las alertas de vencimiento a 60/30/7 días, los runbooks de renovación y revocación, y cablear `leerComputadorFiscal`. Tests en `tests/fiscal-control-persistencia.test.ts`, `tests/fiscal-control-pg.test.ts` y `tests/fiscal-ta-durable.test.ts`.
