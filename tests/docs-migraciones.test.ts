import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parsearRegistro, renderMigraciones, validarRegistros } from "../scripts/docs-migraciones-lib.mjs";

const CLI = fileURLToPath(new URL("../scripts/docs-migraciones.mjs", import.meta.url));

function registro(over = {}) {
  return JSON.stringify({
    tag: "0037_admin_resumen",
    fecha: "2026-10-22",
    aprobado_por: "Mauri",
    evidencia: "Verificada en la base real.",
    backup: "/home/mauri/backups/pre.sql",
    ...over,
  });
}

describe("docs:migraciones registro por ítem", () => {
  it("parsea un registro válido", () => {
    const { registro: r, errores } = parsearRegistro("0037_admin_resumen.json", registro());
    expect(errores).toEqual([]);
    expect(r).toEqual({
      tag: "0037_admin_resumen",
      fecha: "2026-10-22",
      aprobado_por: "Mauri",
      evidencia: "Verificada en la base real.",
      backup: "/home/mauri/backups/pre.sql",
    });
  });

  it("exige que el tag coincida con el archivo", () => {
    const { errores } = parsearRegistro("0036_otra.json", registro());
    expect(errores.map((e) => e.mensaje).join(" ")).toContain("no coincide");
  });

  it("rechaza claves desconocidas y fechas mal formadas", () => {
    const { errores } = parsearRegistro("0037_admin_resumen.json", registro({ fecha: "22/10/2026", autor: "x" }));
    const texto = errores.map((e) => e.mensaje).join(" ");
    expect(texto).toContain("clave desconocida");
    expect(texto).toContain("fecha inválida");
  });

  it("rechaza JSON roto sin tirar", () => {
    const { registro: r, errores } = parsearRegistro("0037_admin_resumen.json", "{");
    expect(r).toBeNull();
    expect(errores[0]?.mensaje).toContain("JSON inválido");
  });

  it("valida la carpeta completa, ignora README.md y ordena por tag", () => {
    const { registros, errores } = validarRegistros([
      { nombre: "README.md", texto: "# guía\n" },
      { nombre: "0038_analytics_snapshot.json", texto: registro({ tag: "0038_analytics_snapshot" }) },
      { nombre: "0037_admin_resumen.json", texto: registro() },
      { nombre: "notas.txt", texto: "x" },
    ]);
    expect(errores).toEqual([]);
    expect(registros.map((r) => r.tag)).toEqual(["0037_admin_resumen", "0038_analytics_snapshot"]);
  });
});

describe("docs:migraciones render", () => {
  it("arma el .md con tag, fecha, evidencia, aprobación y backup", () => {
    const md = renderMigraciones([
      { tag: "0000_base", fecha: "2026-10-15", aprobado_por: "", evidencia: "Bootstrap.", backup: "" },
      { tag: "0037_admin_resumen", fecha: "2026-10-22", aprobado_por: "Mauri", evidencia: "Verificada.", backup: "/b.sql" },
      { tag: "0038_analytics_snapshot", fecha: "", aprobado_por: "", evidencia: "", backup: "" },
    ]);
    expect(md).toContain("- 0000_base\n<!-- 2026-10-15: Bootstrap -->");
    expect(md).toContain(
      "- 0037_admin_resumen\n<!-- 2026-10-22: Verificada; aprobada por Mauri; backup /b.sql -->",
    );
    expect(md.trimEnd().endsWith("- 0038_analytics_snapshot")).toBe(true);
  });

  it("el formato del .md se puede volver a parsear como tags", async () => {
    const { parsearMigraciones } = await import("../scripts/docs-estado-lib.mjs");
    const md = renderMigraciones([
      { tag: "0000_base", fecha: "", aprobado_por: "", evidencia: "", backup: "" },
      { tag: "0001_otra", fecha: "", aprobado_por: "", evidencia: "", backup: "" },
    ]);
    expect(parsearMigraciones(md)).toEqual(["0000_base", "0001_otra"]);
  });
});

describe("docs:migraciones CLI", () => {
  function raizDePrueba() {
    const raiz = mkdtempSync(join(tmpdir(), "docs-migraciones-"));
    const dir = join(raiz, "roadmap", "migraciones");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "0001_uno.json"), registro({ tag: "0001_uno" }));
    return { raiz, dir };
  }

  it("--forzar escribe el .md y --check lo da por al día", () => {
    const { raiz } = raizDePrueba();
    const escribe = spawnSync("node", [CLI, "--raiz", raiz, "--forzar"], { encoding: "utf8" });
    expect(escribe.status).toBe(0);
    const md = readFileSync(join(raiz, "roadmap", "migraciones-aplicadas.md"), "utf8");
    expect(md).toContain("- 0001_uno");

    const check = spawnSync("node", [CLI, "--raiz", raiz, "--check"], { encoding: "utf8", cwd: raiz });
    expect(check.status).toBe(0);
  });

  it("--check falla si el .md quedó viejo", () => {
    const { raiz } = raizDePrueba();
    spawnSync("node", [CLI, "--raiz", raiz, "--forzar"], { encoding: "utf8" });
    writeFileSync(join(raiz, "roadmap", "migraciones", "0002_dos.json"), registro({ tag: "0002_dos" }));
    const check = spawnSync("node", [CLI, "--raiz", raiz, "--check"], { encoding: "utf8", cwd: raiz });
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("desactualizado");
  });

  it("falla nombrando el archivo con JSON inválido", () => {
    const { raiz, dir } = raizDePrueba();
    writeFileSync(join(dir, "0002_roto.json"), "{");
    const r = spawnSync("node", [CLI, "--raiz", raiz, "--forzar"], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("0002_roto.json");
  });
});
