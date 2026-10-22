import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buscarBin, cargarConfig, overrides, perfilDe, resolver } from "../.opencode/modelos.mjs";

const config = cargarConfig();
const todos = new Set<string>(Object.values(config.perfiles as Record<string, string[]>).flat());

describe("modelos por skill (ADR-0109)", () => {
  it("cada skill y agente apunta a un perfil existente con modelos free", () => {
    for (const p of [...Object.values(config.skills), ...Object.values(config.agentes)]) {
      expect(config.perfiles[p as string], `perfil ${p}`).toBeDefined();
    }
    for (const m of todos) expect(m).toMatch(/^opencode\/(.+-free|big-pickle)$/);
  });

  it("los agentes de opencode.json coinciden con el modelo asignado", () => {
    const oc = JSON.parse(readFileSync("opencode.json", "utf8"));
    for (const [agente, perfil] of Object.entries(config.agentes as Record<string, string>)) {
      expect(oc.agent[agente]?.model, agente).toBe(config.perfiles[perfil][0]);
    }
  });

  it("privacidad: el primero de cada perfil es sin retención y los que entrenan van al final", () => {
    const sin = new Set<string>(config.privacidad.sinRetencion);
    const entrena = new Set<string>(config.privacidad.puedeEntrenar);
    for (const [perfil, orden] of Object.entries(config.perfiles as Record<string, string[]>)) {
      expect(sin.has(orden[0] ?? ""), `${perfil} empieza con ${orden[0]}`).toBe(true);
      const primeroQueEntrena = orden.findIndex((m) => entrena.has(m));
      if (primeroQueEntrena >= 0) expect(orden.slice(primeroQueEntrena).every((m) => entrena.has(m)), perfil).toBe(true);
    }
  });

  it("skill desconocida usa el perfil por defecto y acepta /skill", () => {
    expect(perfilDe(config, "no-existe")).toBe(config.perfilPorDefecto);
    expect(perfilDe(config, "/poteto-mode")).toBe(config.skills["poteto-mode"]);
  });

  it("con todo disponible elige el asignado", () => {
    const r = resolver(config, "pstack-judge", { existentes: todos });
    expect(r.elegido).toBe(r.asignado);
    expect(r.descartados).toEqual([]);
  });

  it("si el asignado salió de Zen cae al siguiente del perfil", () => {
    const orden = config.perfiles[config.agentes["pstack-judge"]];
    const existentes = new Set([...todos].filter((m) => m !== orden[0]));
    const r = resolver(config, "pstack-judge", { existentes });
    expect(r.elegido).toBe(orden[1]);
    expect(r.descartados).toEqual([orden[0]]);
  });

  it("un modelo marcado caído se saltea hasta que vence el TTL", () => {
    const orden = config.perfiles.codigo;
    const caidos = { [orden[0]]: { hasta: 2_000 } };
    expect(resolver(config, "codigo", { existentes: todos, caidos, ahora: 1_000 }).elegido).toBe(orden[1]);
    expect(resolver(config, "codigo", { existentes: todos, caidos, ahora: 3_000 }).elegido).toBe(orden[0]);
  });

  it("sin ningún modelo devuelve null", () => {
    expect(resolver(config, "codigo", { existentes: new Set() }).elegido).toBeNull();
  });

  it("overrides avisa solo los agentes que cambiaron", () => {
    const caido = config.perfiles[config.agentes["pstack-judge"]][0];
    const { config: o, avisos } = overrides(config, { existentes: new Set([...todos].filter((m) => m !== caido)) });
    expect(Object.keys(o.agent).sort()).toEqual(Object.keys(config.agentes).sort());
    expect(avisos.every((a: { descartados: string[] }) => a.descartados.includes(caido))).toBe(true);
    expect(avisos.length).toBeGreaterThan(0);
  });

  it("CLI: con un modelo ausente avisa por stderr y deja una línea en el log", () => {
    const dir = mkdtempSync(join(tmpdir(), "modelos-"));
    const log = join(dir, "caidos.log");
    const orden = config.perfiles.juez;
    const env = {
      ...process.env,
      PSTACK_MODELOS_DISPONIBLES: [...todos].filter((m) => m !== orden[0]).join(","),
      PSTACK_MODELOS_CACHE: join(dir, "estado.json"),
      PSTACK_MODELOS_LOG: log,
    };
    const out = execFileSync("node", [".opencode/modelos.mjs", "elegir", "juez"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(out.trim()).toBe(orden[1]);
    expect(readFileSync(log, "utf8")).toContain(`caido=${orden[0]}`);
  });

  it("CLI: caido persiste en la cache y la próxima elección lo saltea sin volver a probarlo", () => {
    const dir = mkdtempSync(join(tmpdir(), "modelos-"));
    const env = {
      ...process.env,
      PSTACK_MODELOS_DISPONIBLES: [...todos].join(","),
      PSTACK_MODELOS_CACHE: join(dir, "estado.json"),
      PSTACK_MODELOS_LOG: join(dir, "caidos.log"),
    };
    const orden = config.perfiles.codigo;
    execFileSync("node", [".opencode/modelos.mjs", "caido", orden[0], "rc=124"], { env, stdio: "ignore" });
    expect(existsSync(join(dir, "estado.json"))).toBe(true);
    const out = execFileSync("node", [".opencode/modelos.mjs", "lista", "codigo"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(out.trim().split(" ")[0]).toBe(orden[1]);
  });

  it("CLI: revivir borra la marca de caído y vuelve a elegir el asignado", () => {
    const dir = mkdtempSync(join(tmpdir(), "modelos-"));
    const cache = join(dir, "estado.json");
    const env = {
      ...process.env,
      PSTACK_MODELOS_DISPONIBLES: [...todos].join(","),
      PSTACK_MODELOS_CACHE: cache,
      PSTACK_MODELOS_LOG: join(dir, "caidos.log"),
    };
    const orden = config.perfiles.codigo;
    execFileSync("node", [".opencode/modelos.mjs", "caido", orden[0], "rc=124"], { env, stdio: "ignore" });
    const antes = execFileSync("node", [".opencode/modelos.mjs", "lista", "codigo"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(antes.trim().split(" ")[0]).toBe(orden[1]);
    execFileSync("node", [".opencode/modelos.mjs", "revivir", orden[0]], { env, stdio: "ignore" });
    expect(JSON.parse(readFileSync(cache, "utf8")).caidos[orden[0]]).toBeUndefined();
    const despues = execFileSync("node", [".opencode/modelos.mjs", "lista", "codigo"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(despues.trim().split(" ")[0]).toBe(orden[0]);
  });

  it("CLI: caido tolera una cache válida que todavía no tiene la clave caidos", () => {
    const dir = mkdtempSync(join(tmpdir(), "modelos-"));
    const cache = join(dir, "estado.json");
    const modelo = config.perfiles.codigo[0];
    if (!modelo) throw new Error("perfil codigo vacío");
    writeFileSync(cache, JSON.stringify({ lista: { en: 1, modelos: [] } }));
    const env = {
      ...process.env,
      PSTACK_MODELOS_DISPONIBLES: [...todos].join(","),
      PSTACK_MODELOS_CACHE: cache,
      PSTACK_MODELOS_LOG: join(dir, "caidos.log"),
    };
    execFileSync("node", [".opencode/modelos.mjs", "caido", modelo, "rc=1"], { env, stdio: "ignore" });
    expect(JSON.parse(readFileSync(cache, "utf8")).caidos[modelo]).toBeDefined();
  });

  it("encuentra opencode en el PATH o en ~/.opencode/bin, no solo en ~/.local/bin", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencode-bin-"));
    const home = join(dir, "home");
    const instalado = join(home, ".opencode", "bin", "opencode");
    mkdirSync(join(home, ".opencode", "bin"), { recursive: true });
    writeFileSync(instalado, "#!/bin/sh\n");
    chmodSync(instalado, 0o755);
    expect(buscarBin({ PATH: join(dir, "vacio"), HOME: home })).toBe(instalado);
    const enPath = join(dir, "opencode");
    writeFileSync(enPath, "#!/bin/sh\n");
    chmodSync(enPath, 0o755);
    expect(buscarBin({ PATH: dir, HOME: home })).toBe(enPath);
    expect(buscarBin({ PATH: join(dir, "vacio"), HOME: join(dir, "sin-opencode") })).toBeNull();
  });

  it("CLI: sin binario de opencode avisa y NO marca modelos caídos", () => {
    const dir = mkdtempSync(join(tmpdir(), "modelos-"));
    const cache = join(dir, "estado.json");
    const log = join(dir, "caidos.log");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: join(dir, "vacio"),
      HOME: join(dir, "home"),
      PSTACK_MODELOS_CACHE: cache,
      PSTACK_MODELOS_LOG: log,
    };
    delete env.OPENCODE_BIN;
    delete env.PSTACK_MODELOS_DISPONIBLES;
    const r = spawnSync(process.execPath, [".opencode/modelos.mjs", "lista", "codigo"], { env, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split(" ")[0]).toBe(config.perfiles.codigo[0]);
    expect(r.stderr).toContain("no encontré el binario de opencode");
    expect(existsSync(cache)).toBe(false);
    expect(existsSync(log)).toBe(false);
  });
});

describe("pstack-run.sh usa el resolver", () => {
  const sh = readFileSync(".opencode/pstack-run.sh", "utf8");

  async function correrConSalida(
    salida: string | string[],
    opciones: { rcs?: number[]; caerServerTras?: number } = {},
  ) {
    const salidas = Array.isArray(salida) ? salida : [salida];
    const dir = mkdtempSync(join(tmpdir(), "pstack-run-"));
    const fake = join(dir, "opencode-fake.sh");
    const salidasDir = join(dir, "salidas");
    mkdirSync(salidasDir);
    salidas.forEach((s, i) => writeFileSync(join(salidasDir, `salida-${i + 1}.txt`), `${s}\n`));
    writeFileSync(join(salidasDir, "salida-final.txt"), `${salidas[salidas.length - 1]}\n`);
    if (opciones.rcs) writeFileSync(join(dir, "rcs"), opciones.rcs.join(" "));
    writeFileSync(
      fake,
      [
        "#!/usr/bin/env bash",
        'if [ "${1:-}" = "run" ]; then',
        '  modelo=""; while [ $# -gt 0 ]; do [ "$1" = "-m" ] && { modelo=$2; shift 2; continue; }; shift; done',
        '  printf \'%s\\n\' "$modelo" >> "$FAKE_OC_DIR/modelos"',
        '  n=0; [ -f "$FAKE_OC_DIR/intentos" ] && n=$(cat "$FAKE_OC_DIR/intentos")',
        '  n=$((n + 1)); printf \'%s\' "$n" > "$FAKE_OC_DIR/intentos"',
        '  archivo="$FAKE_OC_DIR/salidas/salida-$n.txt"',
        '  [ -f "$archivo" ] || archivo="$FAKE_OC_DIR/salidas/salida-final.txt"',
        '  cat "$archivo"',
        '  rcs=(); [ -f "$FAKE_OC_DIR/rcs" ] && read -ra rcs < "$FAKE_OC_DIR/rcs"',
        '  exit "${rcs[$((n - 1))]:-${FAKE_OC_RC:-0}}"',
        "fi",
        "exit 0",
        "",
      ].join("\n"),
    );
    chmodSync(fake, 0o755);
    let pedidos = 0;
    const server = createServer((_req, res) => {
      pedidos += 1;
      if (opciones.caerServerTras && pedidos > opciones.caerServerTras) {
        res.destroy();
        server.close();
        return;
      }
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const port = (server.address() as AddressInfo).port;
    const env = {
      ...process.env,
      OPENCODE_BIN: fake,
      PSTACK_PORT: String(port),
      FAKE_OC_DIR: dir,
      PSTACK_FALLBACK_MODELS: "opencode/glm-5.3-flash-free",
      PSTACK_MODELOS_DISPONIBLES: [...todos].join(","),
      PSTACK_MODELOS_CACHE: join(dir, "estado.json"),
      PSTACK_MODELOS_LOG: join(dir, "caidos.log"),
      PSTACK_UPSTREAM_ESPERA: "0",
    };
    const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((ok) => {
      const p = spawn("bash", [".opencode/pstack-run.sh", "hola"], { env });
      let stdout = "";
      let stderr = "";
      p.stdout.on("data", (d) => (stdout += d));
      p.stderr.on("data", (d) => (stderr += d));
      p.on("close", (status) => ok({ status, stdout, stderr }));
    });
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
    const cache = existsSync(join(dir, "estado.json"))
      ? JSON.parse(readFileSync(join(dir, "estado.json"), "utf8"))
      : { caidos: {} };
    const modelos = existsSync(join(dir, "modelos"))
      ? readFileSync(join(dir, "modelos"), "utf8").trim().split("\n")
      : [];
    return { r, caidos: Object.keys(cache.caidos ?? {}), modelos };
  }

  const upstream = "Error: Upstream request failed: Endpoint is unavailable";

  it("Upstream y después éxito: reintenta el MISMO modelo y no lo marca caído", async () => {
    const { r, caidos, modelos } = await correrConSalida([upstream, "OK al segundo intento"]);
    expect(r.status).toBe(0);
    expect(modelos).toEqual(["opencode/deepseek-v4.1-flash-free", "opencode/deepseek-v4.1-flash-free"]);
    expect(caidos).toEqual([]);
    expect(r.stdout).toContain("OK al segundo intento");
    expect(r.stderr).toContain("reintento 1/2");
    expect(r.stderr).toContain("done model=");
    expect(r.stderr).not.toContain("trying next");
  });

  it("Upstream 3 veces: agota los reintentos y pasa al siguiente SIN marcarlo caído", async () => {
    const { r, caidos, modelos } = await correrConSalida([upstream, upstream, upstream, "OK con el siguiente"]);
    expect(r.status).toBe(0);
    expect(modelos).toEqual([
      "opencode/deepseek-v4.1-flash-free",
      "opencode/deepseek-v4.1-flash-free",
      "opencode/deepseek-v4.1-flash-free",
      "opencode/glm-5.3-flash-free",
    ]);
    expect(caidos).toEqual([]);
    expect(r.stdout).toContain("OK con el siguiente");
    expect(r.stderr).toContain("SIN marcarlo caído");
  });

  it("Upstream con códigos ANSI también se reintenta sin marcar caído", async () => {
    const { r, caidos, modelos } = await correrConSalida(["\u001b[31mError: Upstream request failed\u001b[0m", "OK final"]);
    expect(r.status).toBe(0);
    expect(modelos).toEqual(["opencode/deepseek-v4.1-flash-free", "opencode/deepseek-v4.1-flash-free"]);
    expect(caidos).toEqual([]);
  });

  it('rc=0 con Error: {"name":"UnknownError"} marca caído y prueba el siguiente', async () => {
    const { r, caidos, modelos } = await correrConSalida(['Error: {"name":"UnknownError","message":"boom"}', "OK con el siguiente"]);
    expect(r.status).toBe(0);
    expect(modelos).toEqual(["opencode/deepseek-v4.1-flash-free", "opencode/glm-5.3-flash-free"]);
    expect(caidos).toEqual(["opencode/deepseek-v4.1-flash-free"]);
    expect(r.stderr).toContain("trying next");
  });

  it("un Error: Upstream en medio de la salida no cuenta como caída si la sesión termina bien", async () => {
    const { r, caidos } = await correrConSalida(
      "Error: Upstream request failed: Endpoint is unavailable\nLa sesión leyó ese log y respondió OK al final.",
    );
    expect(r.status).toBe(0);
    expect(caidos).toEqual([]);
    expect(r.stdout).toContain("respondió OK al final");
    expect(r.stderr).toContain("done model=");
  });

  it("una línea que contiene \"type\":\"error\" en el medio no cuenta como evento de error", async () => {
    const { r, caidos } = await correrConSalida(
      "  grep -q '\"type\":\"error\"' x\nLeí el script y la sesión respondió OK al final.",
    );
    expect(r.status).toBe(0);
    expect(caidos).toEqual([]);
    expect(r.stdout).toContain("respondió OK al final");
    expect(r.stderr).toContain("done model=");
  });

  it("un Error: { con el JSON en varias líneas al final también cuenta como fallo", async () => {
    const { r, caidos } = await correrConSalida('Error: {\n  "name": "UnknownError",\n  "message": "boom"\n}');
    expect(r.status).toBe(1);
    expect(caidos).toEqual(
      expect.arrayContaining(["opencode/deepseek-v4.1-flash-free", "opencode/glm-5.3-flash-free"]),
    );
    expect(r.stderr).toContain("trying next");
  });

  it("un Error: de herramienta (permiso rechazado) no cuenta como caída", async () => {
    const { r, caidos } = await correrConSalida("Error: permission denied by user");
    expect(r.status).toBe(0);
    expect(caidos).toEqual([]);
    expect(r.stdout).toContain("Error: permission denied by user");
    expect(r.stderr).toContain("done model=");
  });

  it("rc=1 con Error: Upstream al final también reintenta el mismo modelo", async () => {
    const { r, caidos, modelos } = await correrConSalida([upstream, "OK al segundo intento"], { rcs: [1, 0] });
    expect(r.status).toBe(0);
    expect(modelos).toEqual(["opencode/deepseek-v4.1-flash-free", "opencode/deepseek-v4.1-flash-free"]);
    expect(caidos).toEqual([]);
    expect(r.stderr).toContain("reintento 1/2");
  });

  it("rc=124 por timeout no marca caído y pasa al siguiente modelo", async () => {
    const { r, caidos, modelos } = await correrConSalida("sesión colgada", { rcs: [124, 124] });
    expect(r.status).toBe(1);
    expect(modelos).toEqual(["opencode/deepseek-v4.1-flash-free", "opencode/glm-5.3-flash-free"]);
    expect(caidos).toEqual([]);
    expect(r.stderr).toContain("no lo marco caído");
  });

  it("rc=137 por muerte del entorno corta sin marcar caído", async () => {
    const { r, caidos, modelos } = await correrConSalida("proceso muerto", { rcs: [137] });
    expect(r.status).toBe(137);
    expect(modelos).toEqual(["opencode/deepseek-v4.1-flash-free"]);
    expect(caidos).toEqual([]);
    expect(r.stderr).toContain("no pude ejecutar");
  });

  it("si el server deja de responder, no marca el modelo caído", async () => {
    const { r, caidos } = await correrConSalida('Error: {"name":"UnknownError"}', { caerServerTras: 1 });
    expect(r.status).toBe(1);
    expect(caidos).toEqual([]);
    expect(r.stderr).toContain("dejó de responder");
  });

  it("sin binario de opencode corta antes de probar modelos y no marca ninguno caído", () => {
    const dir = mkdtempSync(join(tmpdir(), "pstack-sin-oc-"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    symlinkSync("/bin/bash", join(bin, "bash"));
    const cache = join(dir, "estado.json");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: bin,
      HOME: join(dir, "home"),
      PSTACK_MODELOS_CACHE: cache,
      PSTACK_MODELOS_LOG: join(dir, "caidos.log"),
    };
    delete env.OPENCODE_BIN;
    const r = spawnSync("bash", [".opencode/pstack-run.sh", "hola"], { env, encoding: "utf8" });
    expect(r.status).toBe(127);
    expect(r.stderr).toContain("no encontré el binario de opencode");
    expect(r.stderr).not.toContain("trying next");
    expect(existsSync(cache)).toBe(false);
  });

  it("arranca el server con los modelos resueltos y marca caídos los que fallan", () => {
    expect(sh).toContain('node "$RES" overrides');
    expect(sh).toContain("OPENCODE_CONFIG_CONTENT");
    expect(sh).toMatch(/node "\$RES" lista/);
    expect(sh).toMatch(/node "\$RES" caido "\$m"/);
  });
  it("no queda ningún modelo retirado de Zen", () => {
    for (const f of [".opencode/pstack-run.sh", "opencode.json", ".opencode/modelos-por-skill.json"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/space-bunny|muse-spark/);
    }
  });
});
