---
id: RUNBOOK-FE-CERT-RENOV
tipo: spec
estado: aceptado
modulos: [fiscal]
depende_de: [ADR-0018]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Runbook operativo para renovar el certificado del computador fiscal sin perder delegaciones (mismo alias).
---
# Runbook — renovación del certificado fiscal

Issue #106 · FE16.3 · FE-S26.

## Cuándo usarlo

El Control Plane muestra alerta a 60, 30 o 7 días (`GET /api/admin/fiscal/certificados-vencimiento`) o el job `POST /api/jobs/fiscal-cert-vencimiento` registró un umbral en `fiscal_params` (`cert_venc_alerta:<id>:<60|30|7>`).

## Homologación (WSASS)

1. Generá clave y CSR (no reutilices la clave vieja si hubo compromiso). DN según ARCA; guía en `docs/guias/destrabe-credenciales.md`.
2. Subí el CSR a WSASS, **mismo alias** que el computador actual, servicio `wsfe`.
3. Descargá el PEM nuevo.
4. Actualizá el entorno (`ARCA_CERT_PEM`, `ARCA_KEY_PEM`) o persistí con `guardarComputadorFiscal` (el `not_after` se parsea del PEM).
5. Pedí TA de prueba (WSAA homo) y una factura de prueba antes de tocar producción.

## Producción (Administración de Certificados Digitales)

Mismos pasos en la consola de producción de ARCA, **mismo alias** para conservar relaciones en el Administrador de Relaciones.

## Después

- Verificá que la alerta baje en el panel admin.
- Si renovaste con alias distinto, hay que reasignar el computador a cada comercio (ver runbook de revocación parcial).

## Referencias

- `docs/diseno/PRD-FE-01-fiscal-arca.md` (FE16.3)
- Issue #63 (certificado WSASS de homologación)
