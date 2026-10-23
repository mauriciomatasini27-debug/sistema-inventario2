---
item: PS2-S3
estado: hecho
adr: "0113"
prd: PRD-PS-01
fecha: 2026-10-23
---
PS2-S3 hecho: se agrega `.cursor/rules/poteto-mode.mdc`, una regla de Cursor con `alwaysApply: true` que indica a todo agente (incluidos los de Cloud, que clonan el repo y leen `.cursor/rules/`) cargar y seguir el skill poteto-mode de pstack antes de cualquier tarea, y avisar si no está disponible en vez de seguir sin él. `tests/pstack-wiring.test.ts` falla si la regla desaparece, deja de tener `alwaysApply: true` o deja de mencionar poteto-mode. Limitación: la regla solo da la indicación; el plugin pstack tiene que estar disponible en el entorno Cloud para que el skill exista.
