import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMANDOS, ErrorControlApp, ayudaDe, ayudaGeneral, parsear, sobre, validar } from "../scripts/control-app/lib/cli.mjs";
import { ESTADO_INICIAL, guardarEstado, hoyAR, leerEstado, rutaEstado } from "../scripts/control-app/lib/estado.mjs";

describe("control-app: parser y ayuda", () => {
  it("parsea el flujo documentado sin perder el orden de los argumentos", () => {
    expect(parsear(["escribir", "#sku", "CAFE-001"])).toEqual({
      comando: "escribir",
      posicionales: ["#sku", "CAFE-001"],
      flags: {},
    });
    expect(parsear(["levantar", "--puerto", "4322", "--dry-run"]).flags).toEqual({ "--puerto": "4322", "--dry-run": true });
    expect(parsear(["captura", "--nombre=panel"]).flags).toEqual({ "--nombre": "panel" });
  });

  it("acepta alias cortos y el flag -- antes de argumentos con guiones", () => {
    expect(parsear(["l"]).comando).toBe("levantar");
    expect(parsear(["e"]).comando).toBe("estado");
    expect(parsear(["escribir", "--", "#q", "-raro"]).posicionales).toEqual(["#q", "-raro"]);
  });

  it("rechaza una opción desconocida con el próximo paso", () => {
    expect(() => parsear(["ir", "/panel", "--turbo"])).toThrowError(ErrorControlApp);
    try {
      parsear(["ir", "/panel", "--turbo"]);
    } catch (e) {
      expect(sobre(e)).toMatchObject({ hint: expect.stringContaining("--help") });
    }
  });

  it("valida la cantidad de argumentos y el rol de login", () => {
    expect(() => validar(parsear(["ir"]))).toThrowError(/Faltan argumentos/);
    expect(() => validar(parsear(["login"]))).toThrowError(/Falta --rol/);
    expect(() => validar(parsear(["login", "--rol", "jefe"]))).toThrowError(/Rol inválido/);
    expect(() => validar(parsear(["ir", "/panel", "extra"]))).toThrowError(/Sobran argumentos/);
    expect(validar(parsear(["login", "--rol", "duenio"]))).toEqual({ ayuda: false, comando: "login" });
  });

  it("api acepta método, ruta y un JSON opcional", () => {
    const parsed = parsear(["api", "POST", "/api/sync/heartbeat", '{"pendientes":0}']);
    expect(validar(parsed)).toEqual({ ayuda: false, comando: "api" });
    expect(parsed.posicionales).toHaveLength(3);
  });

  it("cada comando tiene ayuda rica y --help la devuelve sin ejecutar", () => {
    for (const comando of Object.keys(COMANDOS)) {
      const texto = ayudaDe(comando);
      expect(texto).toContain(`control-app ${comando}`);
      expect(texto).toContain("Uso:");
      expect(texto).toContain("Ejemplos:");
      expect(validar(parsear([comando, "--help"])).ayuda).toBe(true);
    }
    expect(ayudaGeneral()).toContain("control-app levantar");
    expect(ayudaGeneral()).toContain("Salida: siempre JSON");
  });

  it("el CLI imprime JSON también cuando falla", () => {
    const r = spawnSync("node", ["scripts/control-app/control-app.mjs", "no-existe"], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({
      ok: false,
      error: expect.stringContaining("No conozco"),
      hint: expect.stringContaining("--help"),
    });
  });
});

describe("control-app: estado en disco", () => {
  it("lee el estado inicial cuando no hay archivo y hace round-trip", () => {
    const home = mkdtempSync(join(tmpdir(), "control-app-"));
    const env = { ...process.env, CONTROL_APP_HOME: home };
    expect(leerEstado(env).propia).toBe(false);
    guardarEstado({ ...ESTADO_INICIAL, levantado: true, pid: 123, rol: "duenio" }, env);
    expect(leerEstado(env)).toMatchObject({ levantado: true, pid: 123, rol: "duenio" });
    expect(JSON.parse(readFileSync(rutaEstado(env), "utf8")).version).toBe(1);
  });

  it("usa el día de Argentina para la carpeta de evidencia", () => {
    expect(hoyAR(new Date("2026-10-21T02:30:00Z"))).toBe("2026-10-20");
    expect(hoyAR(new Date("2026-10-21T12:00:00Z"))).toBe("2026-10-21");
  });
});
