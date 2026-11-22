import { describe, expect, it } from "vitest";
import {
  clasificarWorktrees,
  comandosRestauracion,
  estadoBaseline,
  parsearWorktrees,
} from "../scripts/worktrees-check-lib.mjs";

const porcelain = [
  "worktree /repo",
  "HEAD 1111111111111111111111111111111111111111",
  "branch refs/heads/mauri/tarea",
  "",
  "worktree /tmp/viejo",
  "HEAD 2222222222222222222222222222222222222222",
  "branch refs/heads/mauri/vieja",
  "prunable gitdir file points to non-existent location",
  "",
  "worktree /repo/wt-suelto",
  "HEAD 3333333333333333333333333333333333333333",
  "detached",
  "",
].join("\n");

const SHA = "1".repeat(40);
const sha = (n: number) => String(n).repeat(40);

describe("worktrees-check: inventario desde porcelain", () => {
  it("separa registros huérfanos, worktrees con rama y detached", () => {
    expect(parsearWorktrees(porcelain)).toEqual([
      {
        ruta: "/repo",
        head: "1111111111111111111111111111111111111111",
        rama: "mauri/tarea",
        detached: false,
        prunable: false,
      },
      {
        ruta: "/tmp/viejo",
        head: "2222222222222222222222222222222222222222",
        rama: "mauri/vieja",
        detached: false,
        prunable: true,
      },
      {
        ruta: "/repo/wt-suelto",
        head: "3333333333333333333333333333333333333333",
        rama: null,
        detached: true,
        prunable: false,
      },
    ]);
  });
});

describe("worktrees-check: clasificación de worktrees", () => {
  const base = parsearWorktrees(porcelain);

  it("nunca pone un worktree sucio en la lista de removibles y separa los estados", () => {
    const clasificados = clasificarWorktrees({
      worktrees: [
        ...base,
        {
          ruta: "/repo/wt-limpio",
          head: sha(4),
          rama: "mauri/limpio",
          detached: false,
          prunable: false,
        },
        {
          ruta: "/repo/wt-sucio",
          head: sha(5),
          rama: "mauri/sucio",
          detached: false,
          prunable: false,
        },
      ],
      estados: {
        "/repo": { status: "", head: SHA, mergeHead: null },
        "/repo/wt-suelto": { status: "", head: sha(3), mergeHead: null },
        "/repo/wt-limpio": { status: "", head: sha(4), mergeHead: null },
        "/repo/wt-sucio": {
          status: " M src/a.ts\n?? docs/nuevo.md",
          head: sha(5),
          mergeHead: null,
        },
      },
      merges: { [SHA]: true, [sha(3)]: true, [sha(4)]: true, [sha(5)]: false },
      rutaPrincipal: "/repo",
      ramaPorDefecto: "main",
      ahora: Date.UTC(2026, 10, 22),
      diasUmbral: 7,
    });

    const porRuta = Object.fromEntries(clasificados.map((w: any) => [w.ruta, w]));
    expect(porRuta["/tmp/viejo"].bucket).toBe("huerfano");
    expect(porRuta["/repo"].bucket).toBe("protegido");
    expect(porRuta["/repo/wt-suelto"]).toMatchObject({ bucket: "limpio-mergeado", detached: true });
    expect(porRuta["/repo/wt-limpio"].bucket).toBe("limpio-mergeado");
    expect(porRuta["/repo/wt-sucio"]).toMatchObject({
      bucket: "sucio",
      archivosCambios: 2,
      archivos: ["src/a.ts", "docs/nuevo.md"],
    });
    expect(clasificados.filter((w: any) => w.bucket === "limpio-mergeado").map((w: any) => w.ruta)).not.toContain(
      "/repo/wt-sucio",
    );
  });

  it("reconoce el merge en curso y lo distingue de un worktree sucio", () => {
    const mergeClasificado = clasificarWorktrees({
      worktrees: [
        {
          ruta: "/repo/wt-merge",
          head: sha(6),
          rama: "mauri/merge",
          detached: false,
          prunable: false,
        },
      ],
      estados: {
        "/repo/wt-merge": {
          status: "UU tests/x.test.ts\nUU drizzle/meta/_journal.json\nM  src/a.ts",
          head: sha(6),
          mergeHead: sha(7),
          mergeConRamaPorDefecto: true,
        },
      },
      merges: { [sha(6)]: false },
      rutaPrincipal: "/repo",
      ramaPorDefecto: "main",
      ahora: Date.UTC(2026, 10, 22),
      diasUmbral: 7,
    });

    expect(mergeClasificado[0]).toMatchObject({
      bucket: "merge-en-curso",
      mergeEnCurso: true,
      conflictosSinStage: 2,
      mergeConRamaPorDefecto: true,
      headCorto: "66666666",
    });
  });
});

describe("worktrees-check: Baseline y restauración", () => {
  const clasificado = (bucket: string, overrides: Record<string, unknown> = {}) => ({
    ruta: `/repo/${bucket}`,
    rama: `mauri/${bucket}`,
    head: "a".repeat(40),
    bucket,
    diasInactivo: null,
    ...overrides,
  });

  it("falla la Baseline por huérfanos, merges a medio cerrar, worktrees sin dueño y limpios viejos", () => {
    const estado = estadoBaseline({
      clasificados: [
        clasificado("huerfano"),
        clasificado("merge-en-curso"),
        clasificado("limpio-no-mergeado"),
        clasificado("limpio-mergeado", { diasInactivo: 30, diasUmbral: 7 }),
        clasificado("protegido"),
        clasificado("sucio"),
      ],
    });

    expect(estado.ok).toBe(false);
    expect(estado.motivos.map((m) => m.bucket)).toEqual([
      "huerfano",
      "merge-en-curso",
      "limpio-no-mergeado",
      "limpio-mergeado",
    ]);
    expect(estado.motivos.at(-1)).toMatchObject({ diasInactivo: 30, diasUmbral: 7 });
  });

  it("un worktree no mergeado con dueño explícito no rompe la Baseline", () => {
    const estado = estadoBaseline({
      clasificados: [clasificado("limpio-no-mergeado", { rama: "mauri/con-dueno" })],
      duenos: new Set(["mauri/con-dueno"]),
    });
    expect(estado.ok).toBe(true);
    expect(estado.motivos).toEqual([]);
  });

  it("lee archivos incluso si el status llegó sin el espacio inicial", () => {
    const [clasificado] = clasificarWorktrees({
      worktrees: [
        { ruta: "/repo/wt", head: sha(8), rama: "mauri/wt", detached: false, prunable: false },
      ],
      estados: {
        "/repo/wt": { status: "M src/a.ts\n?? docs/nuevo.md", head: sha(8), mergeHead: null },
      },
      merges: {},
      rutaPrincipal: "/repo",
      ramaPorDefecto: "main",
      ahora: 0,
      diasUmbral: 7,
    });
    expect(clasificado.archivos).toEqual(["src/a.ts", "docs/nuevo.md"]);
  });

  it("emite restauración con el SHA completo para cada worktree", () => {
    const comandos = comandosRestauracion([
      clasificado("huerfano", { ruta: "/tmp/viejo", head: "b".repeat(40) }),
      clasificado("limpio-mergeado", { ruta: "/repo/wt", head: "c".repeat(40) }),
    ]);
    expect(comandos).toEqual([
      `git worktree add --detach /tmp/viejo ${"b".repeat(40)}`,
      `git worktree add --detach /repo/wt ${"c".repeat(40)}`,
    ]);
  });
});
