import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PASOS_CI,
  PASOS_DOCS,
  REPORTE_VITEST,
  comandoTestsFallidos,
  dependenciasIncumplidas,
  lineasResumen,
  nombresTestsFallidos,
  planDePasos,
  resumir,
} from "../scripts/verify-lib.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const VERIFY = join(RAIZ, "scripts", "verify.mjs");

function correrVerify(args: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), "verify-msg-"));
  try {
    const salida = execFileSync(process.execPath, [VERIFY, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { estado: 0, salida, cwd };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      estado: err.status ?? 99,
      salida: String(err.stdout ?? "") + String(err.stderr ?? ""),
      cwd,
    };
  }
}

describe("verify: plan de pasos", () => {
  it("completo corre los pasos de CI y después los de docs", () => {
    expect(planDePasos().map((p) => p.nombre)).toEqual([...PASOS_CI, ...PASOS_DOCS]);
  });

  it("docs-only corre solo los pasos de docs", () => {
    expect(planDePasos({ docsOnly: true }).map((p) => p.nombre)).toEqual(PASOS_DOCS);
  });

  it("replica los pasos de ci.yml", () => {
    const nombres = planDePasos().map((p) => p.nombre);
    for (const n of ["typecheck", "arch", "test", "skips", "build"]) expect(nombres).toContain(n);
  });

  it("los checks de docs corren antes de los writers y llevan --check", () => {
    const pasos = planDePasos({ docsOnly: true });
    expect(pasos.map((p) => p.nombre)).toEqual([
      "docs:generados",
      "docs:comentarios-check",
      "docs:estado-check",
      "docs:index-check",
      "docs:migraciones-check",
      "roadmap-check",
      "docs:migraciones",
      "roadmap",
      "docs:estado",
      "docs:index",
      "docs:check",
    ]);
    for (const n of [
      "docs:comentarios-check",
      "docs:estado-check",
      "docs:index-check",
      "docs:migraciones-check",
      "roadmap-check",
    ]) {
      expect(pasos.find((p) => p.nombre === n)?.extra).toEqual(["--check"]);
    }
  });
});

describe("verify: pasos dependientes", () => {
  it("skips se salta si falló test, aunque los demás pasos sigan", () => {
    expect(
      dependenciasIncumplidas({ nombre: "skips" }, [
        { nombre: "arch", code: 1 },
        { nombre: "test", code: 1 },
      ]),
    ).toEqual(["test"]);
  });

  it("skips corre cuando test pasó aunque arch haya fallado", () => {
    expect(
      dependenciasIncumplidas({ nombre: "skips" }, [
        { nombre: "arch", code: 1 },
        { nombre: "test", code: 0 },
      ]),
    ).toEqual([]);
  });

  it("los escritores de docs se saltan si falló un check de docs", () => {
    expect(
      dependenciasIncumplidas({ nombre: "docs:estado" }, [
        { nombre: "docs:estado-check", code: 1 },
      ]),
    ).toEqual(["docs:estado-check"]);
  });

  it("un check de docs fallido no bloquea la suite de tests", () => {
    expect(
      dependenciasIncumplidas({ nombre: "test" }, [
        { nombre: "docs:estado-check", code: 1 },
      ]),
    ).toEqual([]);
  });
});

describe("verify: resumen", () => {
  it("ok cuando ningún paso falló", () => {
    expect(resumir([{ nombre: "a", code: 0 }, { nombre: "b", code: 0 }]).ok).toBe(true);
  });

  it("marca los pasos con código distinto de 0", () => {
    const r = resumir([{ nombre: "a", code: 0 }, { nombre: "b", code: 1 }]);
    expect(r.ok).toBe(false);
    expect(r.fallidos).toEqual(["b"]);
  });

  it("no cuenta como fallo un paso saltado y lo reporta aparte", () => {
    const r = resumir([
      { nombre: "arch", code: 1 },
      { nombre: "test", code: 0 },
      { nombre: "skips", skipped: true },
    ]);
    expect(r.ok).toBe(false);
    expect(r.fallidos).toEqual(["arch"]);
    expect(r.saltados).toEqual(["skips"]);
  });

  it("guarda el motivo de cada paso omitido", () => {
    const r = resumir([
      { nombre: "test", code: 1 },
      { nombre: "skips", skipped: true, motivo: "falló test" },
    ]);
    expect(r.motivos.skips).toBe("falló test");
  });
});

describe("verify: mensajes del resumen", () => {
  it("nombra el test fallido y da el comando para leer el reporte", () => {
    const r = resumir([
      { nombre: "test", code: 1 },
      { nombre: "skips", skipped: true, motivo: "falló test" },
    ]);
    const salida = lineasResumen(r, {
      nombres: ["tests/venta.test.ts > cola offline > reintenta sin duplicar"],
    }).join("\n");
    expect(salida).toContain("tests/venta.test.ts > cola offline > reintenta sin duplicar");
    expect(salida).toContain(REPORTE_VITEST);
    expect(salida).toContain(comandoTestsFallidos());
    expect(salida).toContain("verify falló en: test");
  });

  it("dice que el paso se omite por fallo de test, sin 'skips' suelto", () => {
    const r = resumir([
      { nombre: "test", code: 1 },
      { nombre: "skips", skipped: true, motivo: "falló test" },
    ]);
    const salida = lineasResumen(r).join("\n");
    expect(salida).toContain("pasos omitidos: skips (falló test)");
    expect(salida).not.toContain("verify se saltó: skips");
    expect(salida).not.toContain("motivo en el recibo");
  });

  it("menciona el recibo solo cuando se escribió", () => {
    const r = resumir([
      { nombre: "test", code: 1 },
      { nombre: "skips", skipped: true, motivo: "falló test" },
    ]);
    const sin = lineasResumen(r, { rutaRecibo: "" }).join("\n");
    const con = lineasResumen(r, { rutaRecibo: ".verify-receipt.json" }).join("\n");
    expect(sin).not.toContain("recibo");
    expect(con).toContain(".verify-receipt.json");
  });

  it("extrae los nombres del reporte JSON de Vitest", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-reporte-"));
    const reporte = join(dir, REPORTE_VITEST);
    writeFileSync(
      reporte,
      JSON.stringify({
        testResults: [
          {
            name: "tests/caja.test.ts",
            status: "failed",
            assertionResults: [
              { fullName: "tests/caja.test.ts > cierra", status: "failed" },
              { fullName: "tests/caja.test.ts > abre", status: "passed" },
            ],
          },
        ],
      }),
    );
    expect(nombresTestsFallidos(reporte)).toEqual(["tests/caja.test.ts > cierra"]);
  });

  it("muestra el mensaje de la suite cuando no hay asserts fallidos", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-suite-"));
    const reporte = join(dir, REPORTE_VITEST);
    writeFileSync(
      reporte,
      JSON.stringify({
        testResults: [
          { name: "tests/roto.test.ts", status: "failed", message: "Error: no se pudo importar\ndetalle", assertionResults: [] },
        ],
      }),
    );
    expect(nombresTestsFallidos(reporte)).toEqual(["tests/roto.test.ts: Error: no se pudo importar"]);
  });

  it("el comando extrae también errores de suite sin asserts", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-cmd-"));
    const reporte = join(dir, REPORTE_VITEST);
    writeFileSync(reporte, JSON.stringify({
      testResults: [{ name: "tests/roto.test.ts", status: "failed", assertionResults: [] }],
    }));
    const salida = execFileSync("bash", ["-lc", comandoTestsFallidos(reporte)], { encoding: "utf8" });
    expect(salida.trim()).toBe("tests/roto.test.ts");
  });

  it("sin nombres no promete un detalle vacío", () => {
    const r = resumir([{ nombre: "test", code: 1 }]);
    const salida = lineasResumen(r).join("\n");
    expect(salida).toContain(`sin nombres en ${REPORTE_VITEST}`);
    expect(salida).toContain("mirá la salida del paso test");
  });

  it("mantiene la línea de éxito y el total de pasos", () => {
    const r = resumir([
      { nombre: "a", code: 0 },
      { nombre: "b", code: 0 },
    ]);
    expect(lineasResumen(r)).toEqual(["verify ok (2 pasos)"]);
  });

  it("con --no-receipt no menciona el recibo en stdout", () => {
    const r = correrVerify(["--docs-only", "--no-receipt"]);
    expect(r.estado).toBe(1);
    expect(r.salida).not.toContain("recibo");
    expect(r.salida).toContain("pasos omitidos:");
    expect(r.salida).toContain("verify falló en:");
  });

  it("con --receipt escribe el archivo y lo nombra", () => {
    const r = correrVerify(["--docs-only", "--receipt", "recibo.json"]);
    expect(existsSync(join(r.cwd, "recibo.json"))).toBe(true);
    expect(r.salida).toContain("recibo.json");
  });
});
