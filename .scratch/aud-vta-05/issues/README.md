# Tracker local de AUD-VTA-05

Cada archivo es un ticket. El estado se cierra en dos lugares a la vez: acá
(`Status: cerrado` y todas las casillas tachadas, más el `Avance:` que lo
cubre) y en `docs/roadmap/avances/`. `npm run verify` corre
`scripts/verificar-issues-locales.mjs` y falla si los dos discrepan.

## Reclamar un ticket antes de abrir el worktree

Dos sesiones (o un subagente y la sesión principal) pueden agarrar el mismo
ticket al mismo tiempo. Para evitarlo, reclamá el archivo antes de empezar y
liberalo al terminar:

```bash
node scripts/claim-ticket.mjs claim <issue.md> <id-de-sesión>
node scripts/claim-ticket.mjs status
node scripts/claim-ticket.mjs release <issue.md> <id-de-sesión>
```

`claim` falla si otro session-id ya tiene el ticket. El claim se guarda como
la línea `**Claim:**` del issue; `libre` significa que nadie lo está haciendo.
Antes de reclamar, revisá `git log --all --grep='<id del ticket>'`: si el
commit ya existe en otra rama, el trabajo está hecho.

## Integración

Los siete tickets están integrados en `mauri/aud-vta-05-integration`, rama
**solo local** con worktree en `/tmp/opencode/aud-vta-05/integration`. No hay
ramas `mauri/aud-vta-05*` en `origin`.
