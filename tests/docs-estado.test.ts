import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  clasificarAvances,
  modoEstado,
  parsearAvances,
  parsearMigraciones,
  renderEstado,
} from "../scripts/docs-estado-lib.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLI = join(AQUI, "..", "scripts", "docs-estado.mjs");

function avance(sobre: Record<string, string> = {}): string {
  return [
    "---",
    `item: ${sobre.item ?? "P1-1"}`,
    `estado: ${sobre.estado ?? "hecho"}`,
    `adr: ${sobre.adr ?? ""}`,
    `prd: ${sobre.prd ?? ""}`,
    `fecha: ${sobre.fecha ?? "2026-10-15"}`,
    "---",
    sobre.texto ?? "P1-1: una línea de avance.",
    "",
  ].join("\n");
}

function raizCon(archivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "docs-estado-"));
  for (const [rel, texto] of Object.entries(archivos)) {
    const abs = join(raiz, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, texto);
  }
  return raiz;
}

function correr(raiz: string, extra: string[] = []): { estado: number; salida: string } {
  try {
    const out = execFileSync(process.execPath, [CLI, "--raiz", raiz, ...extra], {
      stdio: "pipe",
      encoding: "utf8",
      cwd: raiz,
    });
    return { estado: 0, salida: String(out) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { estado: err.status ?? 99, salida: String(err.stdout ?? "") + String(err.stderr ?? "") };
  }
}

describe("docs:estado parseo", () => {
  it("lee item, estado, fecha y la primera línea del cuerpo", () => {
    const [a] = parsearAvances([
      { nombre: "P1-6.md", texto: avance({ item: "P1-6", estado: "hecho", fecha: "2026-10-14", texto: "P1-6: corto." }) },
    ]);
    expect(a).toMatchObject({
      item: "P1-6",
      estado: "hecho",
      fecha: "2026-10-14",
      texto: "P1-6: corto.",
      ruta: "roadmap/avances/P1-6.md",
    });
  });

  it("omite archivos sin frontmatter y usa el nombre como item de respaldo", () => {
    const avances = parsearAvances([
      { nombre: "sin.md", texto: "# Sin frontmatter\n" },
      { nombre: "P9-1.md", texto: "---\nestado: bloqueado\nfecha: 2026-10-14\n---\nP9-1: bloqueado.\n" },
    ]);
    expect(avances).toHaveLength(1);
    expect(avances[0]?.item).toBe("P9-1");
  });

  it("clasifica hechos, en curso y pendientes y ordena por fecha desc", () => {
    const avances = parsearAvances([
      { nombre: "a.md", texto: avance({ item: "A", estado: "hecho", fecha: "2026-10-14" }) },
      { nombre: "b.md", texto: avance({ item: "B", estado: "hecho", fecha: "2026-10-16" }) },
      { nombre: "c.md", texto: avance({ item: "C", estado: "en curso", fecha: "2026-10-15" }) },
      { nombre: "d.md", texto: avance({ item: "D", estado: "bloqueado (decisión de Mauri)", fecha: "2026-10-13" }) },
    ]);
    const { hechos, enCurso, pendientes } = clasificarAvances(avances);
    expect(hechos.map((x) => x.item)).toEqual(["B", "A"]);
    expect(enCurso.map((x) => x.item)).toEqual(["C"]);
    expect(pendientes.map((x) => x.item)).toEqual(["D"]);
  });

  it("extrae los tags de migraciones e ignora prosa y comentarios", () => {
    const texto = [
      "# Migraciones aplicadas",
      "",
      "Formato: una línea `- <tag>` por migración.",
      "",
      "<!-- bootstrap -->",
      "",
      "- 0000_sweet_krista_starr",
      "- 0028_tenant_bot_modules",
    ].join("\n");
    expect(parsearMigraciones(texto)).toEqual(["0000_sweet_krista_starr", "0028_tenant_bot_modules"]);
  });
});

describe("docs:estado render", () => {
  const base = {
    avances: parsearAvances([
      { nombre: "BOT-S4.md", texto: avance({ item: "BOT-S4", estado: "hecho", fecha: "2026-10-16", texto: "BOT-S4 hecho." }) },
      { nombre: "P9-1.md", texto: avance({ item: "P9-1", estado: "bloqueado (decisión de Mauri)", fecha: "2026-10-14", texto: "P9-1 bloqueado por OCR." }) },
    ]),
    migraciones: ["0000_a", "0028_tenant_bot_modules"],
    bloqueos: {
      credenciales: [{ tema: "Google OAuth real", depende: "Mauri" }],
      decisiones: [{ tema: "Fiscal ARCA", depende: "Mauri (certificado)" }],
    },
  };

  it("declara que es generado y no se edita a mano", () => {
    const md = renderEstado(base);
    expect(md).toContain("npm run docs:estado");
    expect(md.toLowerCase()).toContain("no editar");
  });

  it("no embebe hashes de commits (estable entre squash-merges)", () => {
    const md = renderEstado(base);
    expect(md).not.toContain("Últimos commits");
    expect(md).not.toMatch(/\b[0-9a-f]{7,}\b/);
  });

  it("muestra la última migración, los bloqueos y el gate de merge", () => {
    const md = renderEstado(base);
    expect(md).toContain("0028_tenant_bot_modules");
    expect(md).toContain("Google OAuth real");
    expect(md).toContain("Fiscal ARCA");
    expect(md).toContain("puede-mergear.mjs");
    expect(md).toContain("aprobación de Mauri");
  });

  it("recorta textos largos y es determinista", () => {
    const largo = "x".repeat(400);
    const avances = parsearAvances([
      { nombre: "L.md", texto: avance({ item: "L", estado: "hecho", fecha: "2026-10-16", texto: largo }) },
    ]);
    const una = renderEstado({ ...base, avances });
    const otra = renderEstado({ ...base, avances });
    expect(otra).toBe(una);
    const linea = una.split("\n").find((l) => l.includes("[L]")) ?? "";
    expect(linea.length).toBeLessThan(200);
    expect(linea).toContain("…");
  });

  it("acota la salida a ~6000 caracteres con muchos avances", () => {
    const avances = parsearAvances(
      Array.from({ length: 80 }, (_, i) => ({
        nombre: `A${i}.md`,
        texto: avance({ item: `A${i}`, estado: "hecho", fecha: "2026-10-16", texto: `A${i}: ${"y".repeat(300)}` }),
      })),
    );
    expect(renderEstado({ ...base, avances }).length).toBeLessThanOrEqual(6000);
  });
});

describe("modoEstado", () => {
  it("elige imprimir, escribir o chequear según rama y flags", () => {
    expect(modoEstado({ rama: "mauri/x", forzar: false, check: false })).toBe("imprimir");
    expect(modoEstado({ rama: "main", forzar: false, check: false })).toBe("escribir");
    expect(modoEstado({ rama: "mauri/x", forzar: true, check: false })).toBe("escribir");
    expect(modoEstado({ rama: "mauri/x", forzar: false, check: true })).toBe("chequear");
  });
});

describe("docs:estado CLI", () => {
  function arbol(): string {
    const raiz = raizCon({
      "docs/roadmap/avances/BOT-S4.md": avance({ item: "BOT-S4", fecha: "2026-10-16" }),
      "docs/roadmap/migraciones-aplicadas.md": "- 0000_a\n- 0028_tenant_bot_modules\n",
      "docs/roadmap/bloqueos.json": JSON.stringify({
        credenciales: [{ tema: "Meta WhatsApp Cloud API", depende: "Mauri" }],
        decisiones: [],
      }),
    });
    return join(raiz, "docs");
  }

  it("escribe ESTADO.md y --check sale 0 cuando está fresco", () => {
    const docs = arbol();
    const r = correr(docs);
    expect(r.estado).toBe(0);
    const md = readFileSync(join(docs, "ESTADO.md"), "utf8");
    expect(md).toContain("Meta WhatsApp Cloud API");
    expect(md).toContain("0028_tenant_bot_modules");
    expect(correr(docs, ["--check"]).estado).toBe(0);
  });

  it("--check sale 1 con ESTADO.md rancio", () => {
    const docs = arbol();
    correr(docs);
    writeFileSync(join(docs, "ESTADO.md"), "viejo\n");
    expect(correr(docs, ["--check"]).estado).toBe(1);
  });
});
