---
item: VF-S4
estado: hecho
adr: ADR-0097
prd: PRD-VF-01
fecha: 2026-10-19
---
VF-S4 hecho: `verificacion/tla/PlanCambio.tla` modela la baja programada de PLAN-S4 con dos pedidos concurrentes y dos ciclos, cumple `UnSoloCambio`, `SinUpgradeSinCobro`, `ProgramadoCompleto` y `CancelaMismoPlan`, y los quiebres `quiebre-baja-antes`, `quiebre-dos-cambios`, `quiebre-subida-sin-cobro`, `quiebre-sin-hasta` y `quiebre-no-cancela` violan su ley; `scripts/verificar-formal.sh` corre los dos specs y `.agents/skills/verify-plan-cambio/SKILL.md` registra cobertura y sync commit.
