import { describe, expect, it } from "vitest";
import {
  clasificarRamas,
  clasificarWorktrees,
  comandosRestauracion,
  comandosRestauracionRamas,
  estadoBaseline,
  estadoDelObjetivo,
  estadoNormalizado,
  evaluarGuarda,
  validarRecibo,
  parsearCommitsPosteriores,
  parsearLocales,
  parsearRamas,
  parsearRemotas,
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
const sha = (n: number | string) => String(n).repeat(40);

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

describe("worktrees-check: ramas locales y remotas", () => {
  const localesPorcelain = [
    `mauri/mergeada\t${sha("a")}\torigin/main`,
    `mauri/con-pr\t${sha("b")}\torigin/main`,
    `mauri/posterior\t${sha("c")}\torigin/mauri/posterior`,
    `mauri/sin-upstream\t${sha("d")}\t`,
    `mauri/sin-push\t${sha("8")}\torigin/ya-no-existe`,
    `mauri/vieja-propia\t${sha("e")}\torigin/main`,
  ].join("\n");

  const remotasPorcelain = [
    `refs/remotes/origin/HEAD\t${sha("1")}`,
    `refs/remotes/origin/main\t${sha("1")}`,
    `refs/remotes/origin/mergeada-uno\t${sha("2")}`,
    `refs/remotes/origin/mergeada-dos\t${sha("3")}`,
    `refs/remotes/origin/mergeada-tres\t${sha("4")}`,
    `refs/remotes/origin/mauri/posterior\t${sha("5")}`,
    `refs/remotes/origin/con-pr-remoto\t${sha("7")}`,
    `refs/remotes/origin/con-pr\t${sha("10")}`,
    `refs/remotes/origin/no-mergeada\t${sha("6")}`,
  ].join("\n");

  const logPosterior = [
    `${sha("f")}\tArregla el stock\t${Date.UTC(2026, 10, 15) / 1000}\t3\t12\t4`,
    `${sha("g")}\tAjusta el precio\t${Date.UTC(2026, 10, 18) / 1000}\t1\t5\t0`,
  ].join("\n");
  const logBaseVieja = `${sha("9")}\tCommit propio sobre base vieja\t${Date.UTC(2026, 10, 20) / 1000}\t2\t7\t1`;

  const trabajoPosterior = {
    "mauri/posterior": parsearCommitsPosteriores(logPosterior),
    "mauri/vieja-propia": parsearCommitsPosteriores(logBaseVieja),
  };

  const remotasConocidas = new Set([
    "origin/main",
    "origin/mergeada-uno",
    "origin/mergeada-dos",
    "origin/mergeada-tres",
    "origin/mauri/posterior",
    "origin/con-pr-remoto",
    "origin/con-pr",
    "origin/no-mergeada",
  ]);

  const clasificarFixture = (overrides: Record<string, unknown> = {}) =>
    clasificarRamas({
      locales: parsearLocales(localesPorcelain),
      remotas: parsearRemotas(remotasPorcelain),
      ramaPorDefecto: "main",
      pullRequestsAbiertas: new Set(["mauri/con-pr", "con-pr-remoto"]),
      trabajoPosterior,
      remotasConocidas,
      merges: {
        [sha("a")]: true,
        [sha("b")]: true,
        [sha("c")]: false,
        [sha("e")]: false,
        [sha("2")]: true,
        [sha("3")]: true,
        [sha("4")]: true,
        [sha("5")]: false,
        [sha("7")]: true,
        [sha("10")]: true,
      },
      ahora: Date.UTC(2026, 10, 22),
      ...overrides,
    });

  it("descarta origin/HEAD antes de clasificar ramas remotas", () => {
    const remotas = parsearRemotas(remotasPorcelain);
    expect(remotas.map((r) => r.nombre)).not.toContain("origin");
    expect(remotas.map((r) => r.nombre)).toContain("origin/main");
  });

  it("parsea ramas locales con su upstream y ramas remotas con su corto", () => {
    const { locales, remotas } = parsearRamas(localesPorcelain, remotasPorcelain);
    expect(locales[0]).toEqual({ nombre: "mauri/mergeada", sha: sha("a"), upstream: "origin/main" });
    expect(locales[3]?.upstream).toBe("");
    expect(remotas[1]).toEqual({
      nombre: "origin/mergeada-uno",
      corto: "mergeada-uno",
      remoto: "origin",
      sha: sha("2"),
    });
  });

  it("parsea el diffstat de cada commit posterior con SHA, asunto y fecha", () => {
    expect(parsearCommitsPosteriores(logPosterior)).toEqual([
      {
        sha: sha("f"),
        asunto: "Arregla el stock",
        fecha: Date.UTC(2026, 10, 15),
        archivos: 3,
        inserciones: 12,
        deletiones: 4,
      },
      {
        sha: sha("g"),
        asunto: "Ajusta el precio",
        fecha: Date.UTC(2026, 10, 18),
        archivos: 1,
        inserciones: 5,
        deletiones: 0,
      },
    ]);
  });

  it("mantiene el diffstat de cada commit, no el agregado del rango", () => {
    const { locales } = clasificarFixture();
    const posterior = locales.find((r: any) => r.nombre === "mauri/posterior");
    expect(posterior.commits.map((c: any) => c.inserciones)).toEqual([12, 5]);
    expect(posterior.commits.map((c: any) => c.archivos)).toEqual([3, 1]);
    expect(posterior.motivo).toContain(sha("f"));
    expect(posterior.motivo).toContain("+12");
  });

  it("distingue mergeadas, PR abierto, trabajo posterior, sin push y sin upstream", () => {
    const { locales } = clasificarFixture();
    const porNombre = Object.fromEntries(locales.map((r: any) => [r.nombre, r]));

    expect(porNombre["mauri/mergeada"]).toMatchObject({ bucket: "mergeada", candidata: true });
    expect(porNombre["mauri/con-pr"]).toMatchObject({ bucket: "protegida", candidata: false });
    expect(porNombre["mauri/sin-upstream"]).toMatchObject({ bucket: "stranded", candidata: false });
    expect(porNombre["mauri/sin-push"]).toMatchObject({ bucket: "sin-push", candidata: false });
    expect(porNombre["mauri/posterior"]).toMatchObject({
      bucket: "trabajo-posterior-al-merge",
      candidata: false,
      dias: 7,
    });
  });

  it("un commit propio sobre una base vieja no congela las remotas mergeadas por contenencia", () => {
    const { locales, remotas } = clasificarFixture();
    const porLocal = Object.fromEntries(locales.map((r: any) => [r.nombre, r]));
    const porRemota = Object.fromEntries(remotas.map((r: any) => [r.nombre, r]));

    expect(porLocal["mauri/vieja-propia"]).toMatchObject({ conTrabajo: true, dias: 2 });
    for (const nombre of ["origin/mergeada-uno", "origin/mergeada-dos", "origin/mergeada-tres"]) {
      expect(porRemota[nombre]).toMatchObject({ bucket: "mergeada", candidata: true });
    }
    expect(porRemota["origin/main"].bucket).toBe("protegida");
    expect(porRemota["origin/mauri/posterior"]).toMatchObject({ bucket: "protegida", candidata: false });
    expect(porRemota["origin/no-mergeada"]).toMatchObject({ bucket: "unknown", candidata: false });
  });

  it("protege por PR abierto aunque el contenido ya esté en la rama por defecto", () => {
    const { locales, remotas } = clasificarFixture();
    const conPr = locales.find((r: any) => r.nombre === "mauri/con-pr");
    const conPrRemoto = remotas.find((r: any) => r.nombre === "origin/con-pr-remoto");
    expect(conPr).toMatchObject({ bucket: "protegida", candidata: false });
    expect(conPr?.motivo).toContain("pull request abierto");
    expect(conPrRemoto).toMatchObject({ bucket: "protegida", candidata: false });
    expect(conPrRemoto?.motivo).toContain("pull request abierto");
  });

  it("no protege una remota por una rama local con PR abierto y sin trabajo no mergeado", () => {
    const { remotas } = clasificarFixture();
    const porNombre = Object.fromEntries(remotas.map((r: any) => [r.nombre, r]));
    expect(porNombre["origin/con-pr"].candidata).toBe(true);
    expect(porNombre["origin/con-pr-remoto"].candidata).toBe(false);
  });

  it("emite restauración de ramas con SHAs completos", () => {
    const { locales, remotas } = clasificarFixture();
    expect(comandosRestauracionRamas({ locales, remotas })).toEqual(
      expect.arrayContaining([
        `git branch mauri/mergeada ${sha("a")}`,
        `git push origin ${sha("2")}:refs/heads/mergeada-uno`,
      ]),
    );
  });
});

describe("worktrees-check: guarda de revalidación", () => {
  const recibo = (overrides: Record<string, unknown> = {}) => ({
    objetivo: { tipo: "worktree", ruta: "/repo/wt" },
    head: sha("a"),
    estado: estadoNormalizado({ status: " M src/a.ts", mergeHead: null }),
    ...overrides,
  });

  const actual = (overrides: Record<string, unknown> = {}) => ({
    existeObjetivo: true,
    head: sha("a"),
    estado: estadoNormalizado({ status: " M src/a.ts", mergeHead: null }),
    ...overrides,
  });

  it("normaliza el estado del árbol de trabajo desde una salida fija de git", () => {
    expect(estadoNormalizado({ status: " M src/b.ts\n M src/a.ts\nUU src/c.ts", mergeHead: sha("9") })).toEqual({
      archivos: ["src/a.ts", "src/b.ts", "src/c.ts"],
      archivosCambios: 3,
      conflictosSinStage: 1,
      mergeHead: sha("9"),
      mergeConRamaPorDefecto: null,
      sucio: true,
    });
  });

  it("acepta recibos de los tres tipos de objetivo", () => {
    for (const objetivo of [
      { tipo: "worktree", ruta: "/repo/wt" },
      { tipo: "rama-local", nombre: "mauri/tarea" },
      { tipo: "rama-remota", nombre: "origin/mauri/tarea" },
    ]) {
      expect(validarRecibo(recibo({ objetivo })).ok).toBe(true);
    }
  });

  it("permite la operación cuando HEAD y estado coinciden", () => {
    const resultado = evaluarGuarda({ recibo: recibo(), actual: actual() });
    expect(resultado).toMatchObject({ decision: "permitir", codigoSalida: 0 });
    expect(resultado.motivo).toContain("sin cambios");
  });

  it("niega con el HEAD observado y el actual cuando cambió", () => {
    const resultado = evaluarGuarda({ recibo: recibo(), actual: actual({ head: sha("b") }) });
    expect(resultado).toMatchObject({ decision: "negar", codigoSalida: 1 });
    expect(resultado.motivo).toContain(sha("a"));
    expect(resultado.motivo).toContain(sha("b"));
    expect(resultado.motivo).toContain("/repo/wt");
    expect(resultado.observado?.head).toBe(sha("a"));
    expect(resultado.actual?.head).toBe(sha("b"));
  });

  it("niega cuando otra sesión limpió un worktree que estaba sucio", () => {
    const resultado = evaluarGuarda({
      recibo: recibo(),
      actual: actual({ estado: estadoNormalizado({ status: "", mergeHead: null }) }),
    });
    expect(resultado).toMatchObject({ decision: "negar", codigoSalida: 1 });
    expect(resultado.motivo).toContain("estado");
    expect(resultado.motivo).toContain("src/a.ts");
    expect(resultado.observado?.estado.archivos).toEqual(["src/a.ts"]);
    expect(resultado.actual?.estado.archivos).toEqual([]);
  });

  it("niega un recibo viejo de merge ya cerrado", () => {
    const resultado = evaluarGuarda({
      recibo: recibo({
        estado: estadoNormalizado({
          status: "UU tests/x.test.ts",
          mergeHead: sha("9"),
          mergeConRamaPorDefecto: true,
        }),
      }),
      actual: actual({ estado: estadoNormalizado({ status: "", mergeHead: null }) }),
    });
    expect(resultado).toMatchObject({ decision: "negar", codigoSalida: 1 });
    expect(resultado.motivo).toContain("merge");
    expect(resultado.observado?.estado.mergeHead).toBe(sha("9"));
    expect(resultado.actual?.estado.mergeHead).toBeNull();
  });

  it("reporta entrada inválida con código distinto al de estado cambiado", () => {
    const malFormado = evaluarGuarda({ recibo: recibo({ head: "corto" }), actual: actual() });
    const inexistente = evaluarGuarda({ recibo: recibo(), actual: actual({ existeObjetivo: false }) });
    const cambiado = evaluarGuarda({ recibo: recibo(), actual: actual({ head: sha("b") }) });
    expect(malFormado).toMatchObject({ decision: "invalido", codigoSalida: 2 });
    expect(inexistente).toMatchObject({ decision: "invalido", codigoSalida: 2 });
    expect(malFormado.motivo).toContain("head");
    expect(inexistente.motivo).toContain("/repo/wt");
    expect(malFormado.codigoSalida).not.toBe(cambiado.codigoSalida);
  });

  it("rechaza un estado con archivos mal formados como entrada inválida", () => {
    const resultado = evaluarGuarda({
      recibo: recibo({ estado: { archivos: "no-es-array" } }),
      actual: actual(),
    });
    expect(resultado).toMatchObject({ decision: "invalido", codigoSalida: 2 });
    expect(resultado.motivo).toContain("estado.archivos");
  });
});

describe("worktrees-check: guarda sobre salidas fijas de git y del tracker", () => {
  const worktrees = [
    { ruta: "/repo/wt-host", rama: "mauri/tracking", head: sha("a"), prunable: false },
    { ruta: "/repo/wt-otro", rama: "mauri/otro", head: sha("b"), prunable: false },
  ];
  const estados = {
    "/repo/wt-host": { status: " M src/a.ts", head: sha("a"), mergeHead: null },
    "/repo/wt-otro": { status: "", head: sha("b"), mergeHead: null },
  };
  const locales = [{ nombre: "mauri/tracking", sha: sha("a"), upstream: "origin/mauri/tracking" }];
  const remotas = [{ nombre: "origin/mauri/tracking", corto: "mauri/tracking", remoto: "origin", sha: sha("a") }];
  const contexto = { worktrees, estados, locales, remotas };

  it("relee worktree, rama local y rama remota desde los mismos datos del informe", () => {
    const delWorktree = estadoDelObjetivo({ objetivo: { tipo: "worktree", ruta: "/repo/wt-host" }, ...contexto });
    const deLocal = estadoDelObjetivo({ objetivo: { tipo: "rama-local", nombre: "mauri/tracking" }, ...contexto });
    const deRemota = estadoDelObjetivo({ objetivo: { tipo: "rama-remota", nombre: "origin/mauri/tracking" }, ...contexto });

    expect(delWorktree).toMatchObject({ existeObjetivo: true, head: sha("a") });
    expect(delWorktree.estado.archivos).toEqual(["src/a.ts"]);
    expect(deLocal).toMatchObject({ existeObjetivo: true, head: sha("a") });
    expect(deLocal.estado.archivos).toEqual(["src/a.ts"]);
    expect(deRemota).toMatchObject({ existeObjetivo: true, head: sha("a") });
    expect(deRemota.estado.archivos).toEqual(["src/a.ts"]);
  });

  it("permite un recibo de rama remota con el estado observado en su worktree de tracking", () => {
    const reciboRemoto = {
      objetivo: { tipo: "rama-remota", nombre: "mauri/tracking", remoto: "origin" },
      head: sha("a"),
      estado: estadoNormalizado({ status: " M src/a.ts", mergeHead: null }),
    };
    const resultado = evaluarGuarda({
      recibo: reciboRemoto,
      actual: estadoDelObjetivo({ objetivo: reciboRemoto.objetivo, ...contexto }),
    });
    expect(resultado).toMatchObject({ decision: "permitir", codigoSalida: 0 });
  });

  it("reporta objetivo inexistente para los tres tipos", () => {
    for (const objetivo of [
      { tipo: "worktree", ruta: "/repo/no-existe" },
      { tipo: "rama-local", nombre: "mauri/no-existe" },
      { tipo: "rama-remota", nombre: "origin/no-existe" },
    ]) {
      expect(estadoDelObjetivo({ objetivo, ...contexto }).existeObjetivo).toBe(false);
    }
  });
});
