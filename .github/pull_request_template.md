## Qué cambia y por qué

(comportamiento, diseño, cómo verificarlo — comandos concretos)

## Checklist

- [ ] Rama `mauri/<tema>` desde `origin/main` actualizado; `git log origin/main..HEAD --oneline` muestra sólo mis commits.
- [ ] Gate de merge verde: `npm run verify` (ADR-0086). Pegá su resumen en la descripción — Actions son intentionalmente manuales.
- [ ] Suites PG corridas (verify bootea Postgres local vía `bash scripts/pg-local.sh start`) o desviado con justificación explícita en la descripción.
- [ ] Tickets cerrados con commit; desviaciones del spec enmendadas visiblemente en el issue (no en silencio).
- [ ] Avance `docs/roadmap/avances/<id>.md` con estado `en_revision` si hay ADR propuesto.
- [ ] Post-merge (Mauri o el agente después): ADR `propuesto` → `aceptado`; avance `en_revision` → `hecho`.
