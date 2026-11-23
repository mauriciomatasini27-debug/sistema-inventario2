# Trazabilidad — fiscal

Fecha: 2026-11-23. Historia: AUD-S5 de PRD-AUD-03 (ADR-0127).
Pantalla: `src/pages/panel/fiscal/delegacion.astro` (105 líneas). Handlers:
`GET/POST /api/fiscal/wizard`, `POST /api/fiscal/delegacion-confirmada`.
Repo: `lib/repos/fiscal.ts` (`leerWizard`, `guardarWizardEstado`). Módulo: `modules/fiscal/wizard.ts`.
No auditado: la bandeja de comprobantes y el wizard de configuración no tienen pantalla en esta
pasada (`api/fiscal/documents.ts`, `history.ts`, `retry.ts`, `settings.ts` se usan desde otros
flujos).

## Campos persistidos

| Campo en pantalla | Payload | Handler | Repo | Columna | Estado |
|---|---|---|---|---|---|
| CUIT del comercio (prompt “Ya lo hice en ARCA”) | `cuit` | `POST /api/fiscal/delegacion-confirmada` | `guardarWizardEstado` + `fiscal_jobs` (control) | `fiscal_wizard.delegacion` (`pendiente_proveedor`), `fiscal_jobs.clave` = `delegacion:<tenant>:<cuit>` | ok |
| Modo de primera factura (botones CAE / prueba NC) | `modo_primera_factura` (`cae`/`prueba_nc`) | `POST /api/fiscal/wizard` (`accion: primera_factura`) | `elegir_modo_primera_factura` | — (`Map` en memoria) | **huérfano (fiscal-1)** |
| Acción del wizard (avanzar/pausar/resumir) | `accion`, `paso` | `POST /api/fiscal/wizard` | `guardarWizardEstado` | `fiscal_wizard.paso`, `pausa_en`, `delegacion`, `actualizado_en` | ok (sin pantalla que las dispare) |

## Solo lectura

| Elemento | Handler | Repo | Columnas |
|---|---|---|---|
| Mensaje y estado de la delegación | `GET /api/fiscal/wizard` | `leerWizard` + `enriquecer_vista_wizard` | `fiscal_wizard.delegacion`; `mensaje_dueno`, `cola_pausada` y `aviso_revocacion` salen de memoria (`modules/fiscal/wizard.ts:101-117`) |
| Modo de primera factura elegido | idem | `leer_modo_primera_factura` | memoria (`Map`), no columna |
| Botón “Ya lo hice en ARCA” visible | idem | `enriquecer_vista_wizard` | según `delegacion` (`pendiente`/`pendiente_proveedor`) |

## Columnas del módulo sin pantalla

| Columna | Clasificación |
|---|---|
| `fiscal_wizard.paso`, `pausa_en` | el wizard de 7 pasos no tiene pantalla en esta pasada; la API los acepta |
| `fiscal_settings.*` (`cuit`, `condicion_iva`, `punto_venta`, `modo`) | sin pantalla: los carga el wizard de configuración por otro flujo |
| `fiscal_documents.*` | los emite la venta (`/api/sales`) y la bandeja sin pantalla en esta pasada |
| `fiscal_customers.*` | ídem: los crea la emisión o la bandeja |
| `fiscal_sequences.*` | internas (correlativos) |

## Hallazgos

1. **fiscal-1 — el modo de primera factura se guarda en memoria, no en la base.**
   `elegir_modo_primera_factura` escribe en `modoPrimeraFacturaPorTenant`
   (`modules/fiscal/wizard.ts:35`, `:132`), un `Map` del proceso. `fiscal_wizard` no tiene columna
   para el modo. Efecto: el comerciante elige “primera venta con CAE” o “prueba con NC”, la
   pantalla lo confirma, y al reiniciar el server o en otra instancia la preferencia desaparece y
   la vista vuelve a “Sin datos”. Issue #480. Accionable: columna en `fiscal_wizard` (migración) y leerla de
   la base, o dejar explícito que es una preferencia efímera y no mostrarla como persistida.
2. **fiscal-2 — la vista del wizard informa estado que no persiste.** `cola_pausada` y
   `aviso_revocacion` también salen de `Map` en memoria (`:101-117`), y el mensaje al dueño se
   arma con ellos. Misma decisión que fiscal-1: persistir o dejar de mostrar como estado del
   comercio. Nota: no rompe la delegación (esa sí va a `fiscal_wizard`/`fiscal_jobs`), pero la
   pantalla puede decir “cola pausada” en una instancia y no en otra.
