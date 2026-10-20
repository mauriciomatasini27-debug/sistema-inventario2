import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  armarEstado,
  evaluarNumeros,
  formatearNumero,
  maximo,
  siguienteNumero,
} from "../scripts/numeros-lib.mjs";
import { planDePasos } from "../scripts/verify-lib.mjs";

const CLI = fileURLToPath(new URL("../scripts/check-numeros.mjs", import.meta.url));
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ENV_GIT = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };

const BASE = {
  archivos: [
    "drizzle/0029_products_sector.sql",
    "docs/adr/0098-persistencia-control-fiscal-idempotente.md",
    "docs/adr/0101-sector-producto-en-products.md",
    "docs/roadmap/avances/0101.md",
  ],
  journal: [
    { idx: 28, tag: "0028_tenant_bot_modules" },
    { idx: 29, tag: "0029_products_sector" },
  ],
};

const RAMA_CASO_REAL = {
  archivos: [
    ...BASE.archivos,
    "drizzle/0029_google_integrations.sql",
    "drizzle/0030_gmail_ingestion.sql",
    "docs/adr/0098-conexion-google-oauth.md",
    "docs/adr/0099-ingesta-gmail-watch-history.md",
    "docs/adr/0100-fotos-google-y-almacenamiento-propio.md",
    "docs/roadmap/avances/0098.md",
  ],
  journal: [
    ...BASE.journal,
    { idx: 29, tag: "0029_google_integrations" },
    { idx: 30, tag: "0030_gmail_ingestion" },
  ],
};

const RAMA_RENUMERADA = {
  archivos: [
    ...BASE.archivos,
    "drizzle/0030_google_integrations.sql",
    "drizzle/0031_gmail_ingestion.sql",
    "docs/adr/0102-conexion-google-oauth.md",
    "docs/roadmap/avances/0102.md",
  ],
  journal: [
    ...BASE.journal,
    { idx: 30, tag: "0030_google_integrations" },
    { idx: 31, tag: "0031_gmail_ingestion" },
  ],
};

const RAMA_HUECOS = {
  archivos: [
    ...BASE.archivos,
    "drizzle/0030_google_integrations.sql",
    "drizzle/0031_gmail_ingestion.sql",
    "docs/adr/0099-ingesta-gmail-watch-history.md",
    "docs/adr/0100-fotos-google-y-almacenamiento-propio.md",
    "docs/adr/0102-conexion-google-oauth.md",
    "docs/roadmap/avances/0102.md",
  ],
  journal: [
    ...BASE.journal,
    { idx: 30, tag: "0030_google_integrations" },
    { idx: 31, tag: "0031_gmail_ingestion" },
  ],
};

describe("numeros: siguiente libre", () => {
  it("toma el máximo de main y suma uno", () => {
    const base = armarEstado(BASE);
    expect(maximo(base.migraciones)).toBe(29);
    expect(maximo(base.journal)).toBe(29);
    expect(maximo(base.adrs)).toBe(101);
    expect(siguienteNumero(29)).toBe("0030");
    expect(siguienteNumero(101)).toBe("0102");
    expect(formatearNumero(98)).toBe("0098");
  });

  it("está en el plan de verify", () => {
    expect(planDePasos().map((p) => p.nombre)).toContain("numeros");
  });
});

describe("numeros: caso real PR #207", () => {
  it("falla y nombra el renumber concreto de migraciones, ADR y avance", () => {
    const r = evaluarNumeros({ base: armarEstado(BASE), rama: armarEstado(RAMA_CASO_REAL) });
    const problemas = r.problemas.join("\n");
    const arreglos = r.arreglos.join("\n");
    expect(r.ok).toBe(false);
    expect(problemas).toContain("main ya usa hasta 0029 y el siguiente libre en main es 0030");
    expect(problemas).toContain("main ya usa hasta 0101 y el siguiente libre en main es 0102");
    expect(arreglos).toContain(
      "drizzle/0029_google_integrations.sql: renumerá a drizzle/0030_google_integrations.sql",
    );
    expect(arreglos).toContain(
      "drizzle/0030_gmail_ingestion.sql: renumerá a drizzle/0031_gmail_ingestion.sql",
    );
    expect(arreglos).toContain(
      "docs/adr/0098-conexion-google-oauth.md: renumerá a docs/adr/0102-conexion-google-oauth.md",
    );
    expect(arreglos).toContain("docs/roadmap/avances/0098.md: renumerá a docs/roadmap/avances/0102.md");
    expect(arreglos).not.toContain("docs/adr/0099-ingesta-gmail-watch-history.md");
    expect(arreglos).not.toContain("docs/adr/0100-fotos-google-y-almacenamiento-propio.md");
  });

  it("pasa con la rama renumerada a 0030/0031 y ADR-0102", () => {
    const r = evaluarNumeros({ base: armarEstado(BASE), rama: armarEstado(RAMA_RENUMERADA) });
    expect(r).toEqual({ ok: true, problemas: [], arreglos: [] });
  });

  it("no marca choque cuando la rama usa huecos libres de main", () => {
    const r = evaluarNumeros({ base: armarEstado(BASE), rama: armarEstado(RAMA_HUECOS) });
    expect(r).toEqual({ ok: true, problemas: [], arreglos: [] });
  });
});

describe("numeros: journal de drizzle", () => {
  it("falla si dos archivos nuevos repiten número", () => {
    const rama = armarEstado({
      archivos: [
        ...BASE.archivos,
        "drizzle/0030_google_integrations.sql",
        "drizzle/0030_gmail_ingestion.sql",
      ],
      journal: [
        ...BASE.journal,
        { idx: 30, tag: "0030_google_integrations" },
        { idx: 30, tag: "0030_gmail_ingestion" },
      ],
    });
    const r = evaluarNumeros({ base: armarEstado(BASE), rama });
    expect(r.ok).toBe(false);
    expect(r.problemas.join("\n")).toContain("repiten el número 0030");
  });

  it("falla si el idx del journal no coincide con el prefijo del SQL", () => {
    const rama = armarEstado({
      archivos: [...BASE.archivos, "drizzle/0030_gmail_ingestion.sql"],
      journal: [...BASE.journal, { idx: 29, tag: "0030_gmail_ingestion" }],
    });
    const r = evaluarNumeros({ base: armarEstado(BASE), rama });
    expect(r.ok).toBe(false);
    expect(r.problemas.join("\n")).toContain(
      "drizzle/meta/_journal.json registra 0030_gmail_ingestion con idx 29",
    );
  });

  it("falla si el SQL nuevo no está en el journal", () => {
    const rama = armarEstado({
      archivos: [...BASE.archivos, "drizzle/0030_gmail_ingestion.sql"],
      journal: BASE.journal,
    });
    const r = evaluarNumeros({ base: armarEstado(BASE), rama });
    expect(r.ok).toBe(false);
    expect(r.problemas.join("\n")).toContain(
      "falta la entrada 0030_gmail_ingestion en drizzle/meta/_journal.json",
    );
  });

  it("falla si reusa un idx del journal de main con otro tag", () => {
    const rama = armarEstado({
      archivos: [...BASE.archivos, "drizzle/0030_gmail_ingestion.sql"],
      journal: [
        ...BASE.journal,
        { idx: 29, tag: "0030_gmail_ingestion" },
      ],
    });
    const r = evaluarNumeros({ base: armarEstado(BASE), rama });
    expect(r.ok).toBe(false);
    expect(r.problemas.join("\n")).toContain(
      "reusa el idx 29 de main (0029_products_sector) para 0030_gmail_ingestion",
    );
  });

  it("pasa si main no tiene archivos numerados", () => {
    const base = armarEstado({ archivos: ["src/x.ts"], journal: [] });
    const rama = armarEstado({
      archivos: ["drizzle/0001_primera.sql"],
      journal: [{ idx: 1, tag: "0001_primera" }],
    });
    const r = evaluarNumeros({ base, rama });
    expect(r.ok).toBe(true);
  });
});

function git(dir: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: ENV_GIT,
  });
}

function tieneRef(ref: string) {
  const r = spawnSync("git", ["cat-file", "-e", `${ref}^{commit}`], {
    cwd: RAIZ,
    encoding: "utf8",
    env: ENV_GIT,
  });
  return r.status === 0;
}

function correrCli(args: string[], cwd = RAIZ) {
  return spawnSync("node", [CLI, ...args], { cwd, encoding: "utf8", env: ENV_GIT });
}

describe("numeros: guarda contra git real", () => {
  it("degrada con aviso y exit 0 si no puede resolver la base", () => {
    const dir = mkdtempSync(join(tmpdir(), "check-numeros-sin-base-"));
    git(dir, ["init", "-b", "main"]);
    const r = correrCli(["--base", "origin/main"], dir);
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain("se saltea la guarda de números");
  });

  const hayCasoReal = tieneRef("ea9c921") && tieneRef("541db3c");
  describe.skipIf(!hayCasoReal)("caso real ea9c921 contra main 541db3c", () => {
    it("falla nombrando la migración, el ADR y el avance que chocan", () => {
      const r = correrCli(["--base", "541db3c", "--head", "ea9c921"]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(
        "drizzle/0029_google_integrations.sql: renumerá a drizzle/0030_google_integrations.sql",
      );
      expect(r.stderr).toContain(
        "drizzle/0030_gmail_ingestion.sql: renumerá a drizzle/0031_gmail_ingestion.sql",
      );
      expect(r.stderr).toContain(
        "docs/adr/0098-conexion-google-oauth.md: renumerá a docs/adr/0102-conexion-google-oauth.md",
      );
      expect(r.stderr).toContain(
        "docs/roadmap/avances/0098.md: renumerá a docs/roadmap/avances/0102.md",
      );
      expect(r.stderr).not.toContain("0099-ingesta-gmail-watch-history.md");
      expect(r.stderr).not.toContain("0100-fotos-google-y-almacenamiento-propio.md");
      expect(r.stderr).toContain("el siguiente libre en main es 0030");
    });

    it("pasa en main actual", () => {
      const r = correrCli(["--base", "541db3c", "--head", "541db3c"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("check:numeros ok");
    });
  });

  const hayResolucion207 = tieneRef("756a6cd") && tieneRef("541db3c");
  describe.skipIf(!hayResolucion207)("resolución #207 con huecos contra main 541db3c", () => {
    it("pasa sin pedir renumber de ADR-0099, 0100 ni 0102", () => {
      const r = correrCli(["--base", "541db3c", "--head", "756a6cd"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("check:numeros ok");
      expect(`${r.stdout}${r.stderr}`).not.toContain("renumerá");
    });
  });
});
