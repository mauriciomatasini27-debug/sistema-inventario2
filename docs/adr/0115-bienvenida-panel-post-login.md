---
id: ADR-0115
tipo: adr
estado: aceptado
modulos: [onboarding, panel]
depende_de: [ADR-0009, ADR-0011, PRD-ON-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Tras el login, el Dueño ve un diálogo en /panel con el nombre del comercio y la checklist ON8 del GET /api/onboarding/estado.
  No se pide ficha nueva (dirección, CUIT, moneda ni cantidad de empleados). Cerrar el diálogo guarda marca en localStorage por tenant y usuario.
  El empleado no lo ve; no es máscara fullscreen (ADR-0009).
---
# ADR-0115 - Bienvenida en /panel sin ficha nueva

Estado: aceptado (2026-10-30). Fecha: 2026-10-30. Fuentes: issue #90, issue #94, `docs/02-identidad-onboarding/onboarding-parte-1.md` (ON1, ON8), `src/pages/api/onboarding/estado.ts`, `src/pages/api/onboarding/checklist.ts`, `src/modules/onboarding/checklist.ts`, `docs/adr/0009-componentes-adopcion.md`.

## Decisión

Después del alta (ON1 en `/alta`) el Dueño entra a `/panel` sin un wizard de configuración adicional. La primera vez que abre `/panel` en un navegador, ve un `<dialog>` modal (no pantalla completa bloqueante) con el nombre del comercio y la checklist ON8 calculada con datos reales (`GET /api/onboarding/estado?tenant_id=`).

El diálogo puede cerrarse sin completar los pasos. Cerrarlo persiste en `localStorage` la clave `bienvenida:panel:<tenantId>:<googleSub>` con valor `"1"`. Recargar la página no vuelve a mostrarlo para ese par comercio-usuario en ese navegador; otro comercio de la misma sesión sí puede mostrarlo si no tiene marca.

Solo el Dueño ve el diálogo. Los empleados no reciben el componente en el HTML.

El botón «No tengo empleados» llama a `POST /api/onboarding/checklist` con `{ accion: "saltar", paso: "empleado" }` y no crea invitación. La UI marca ese paso como «No aplica» localmente.

Prohibido en el diálogo: campos de dirección, CUIT, moneda, cantidad de empleados u otra ficha que ON1 no pidió. ADR-0009 sigue prohibiendo máscaras fullscreen de onboarding; este diálogo es acotado y dismissible.

El tenant y el `googleSub` se resuelven en el servidor (`tenantDeRequest`, `resolverSesion`, `esDueno`) y se pasan al cliente; no se confía en el cliente para el rol.

## Por qué

ON1 ya captura nombre, rubro y WhatsApp. Repetir datos o bloquear el panel con una máscara fullscreen retrasa el valor del producto. ON8 ya existe en API; falta superficie visible en el hub del comercio.

## Qué cambia

- `src/pages/panel.astro`: contexto SSR Dueño + composición del diálogo.
- `src/components/panel/BienvenidaDialog.astro`: UI y script cliente.
- `src/modules/onboarding/bienvenida-panel.ts` y `src/lib/panel-bienvenida.ts`: claves y texto de progreso (tests puros).

No se modifican `/alta`, `auth/callback` ni `GET /api/onboarding/estado` en este slice.

## Pendientes

- Persistir rubro del alta en DB (#93).
- Retomar checklist desde «Ayuda > Primeros pasos» (ON8.4) fuera de este diálogo one-shot.
