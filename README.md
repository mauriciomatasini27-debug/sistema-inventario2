# Sistema de Inventario

PWA de inventario, ventas y caja para comercios (Astro 7 + React, Postgres con Drizzle, multi-tenant, offline-first). Repo privado.

- Reglas para agentes y gate de merge: [AGENTS.md](AGENTS.md).
- Estado del proyecto: [docs/ESTADO.md](docs/ESTADO.md). Índice de docs: [docs/README.md](docs/README.md) y [docs/INDEX.md](docs/INDEX.md).
- Desarrollar en Windows con OpenCode: [docs/guias/desarrollo-windows-opencode.md](docs/guias/desarrollo-windows-opencode.md).

## Arranque rápido (Linux o WSL2)

```bash
npm ci                          # Node 22
bash scripts/pg-local.sh start  # Postgres 17 local en 127.0.0.1:54329 (bases A/B)
npm run dev                     # http://localhost:4321
npm run verify                  # gate completo antes del PR
```

Variables de entorno: copiá `.env.example` a `.env`. Nunca subas `.env`.
