---
id: RUNBOOK-FE-CERT-REVOC
tipo: spec
estado: aceptado
modulos: [fiscal]
depende_de: [ADR-0018]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Runbook operativo ante compromiso o revocación del certificado del computador fiscal del proveedor.
---
# Runbook — revocación del certificado fiscal

Issue #106 · FE16.5 · FE-S26.

## Cuándo usarlo

Sospecha de filtración de la clave privada, error al compartir el PEM, o instrucción del contador/ARCA de revocar el certificado. La cola fiscal debe quedar pausada (`cert.expired` / autorización) hasta completar la rotación.

## Pasos inmediatos

1. **Revocá** el certificado en la consola ARCA correspondiente (WSASS homo o Certificados Digitales prod).
2. **Generá** par clave + CSR nuevos (nunca reutilices la clave comprometida).
3. **Emití** certificado nuevo. Preferí **nuevo alias** si el compromiso fue grave; si es rotación planificada, mismo alias según runbook de renovación.
4. **Cargá** el PEM y la clave cifrada (`FISCAL_KMS_KEY_B64`, `guardarComputadorFiscal`).
5. **Reasigná** el computador fiscal a cada comercio en el Administrador de Relaciones si cambió el alias o el certificado no hereda relaciones.

## Comunicación

- Control Plane: confirmá que `certificados-vencimiento` deja de marcar vencido tras la carga.
- Dueños: si la cola estuvo pausada, avisá cuando la emisión vuelva (bandeja fiscal).

## Auditoría

Registrá quién ejecutó la revocación y la rotación (PA2 / actos admin). Solo personal autorizado (FE16.4).

## Referencias

- `docs/diseno/PRD-FE-01-fiscal-arca.md` (FE16.5)
- `docs/guias/runbook-renovacion-certificado-fiscal.md`
