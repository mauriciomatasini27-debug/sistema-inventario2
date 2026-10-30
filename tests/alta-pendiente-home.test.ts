import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const astroBin = fileURLToPath(new URL("../node_modules/astro/bin/astro.mjs", import.meta.url));

function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address();
      const puerto = typeof direccion === "object" && direccion ? direccion.port : 0;
      servidor.close((error) => (error ? reject(error) : resolve(puerto)));
    });
  });
}

function destinoDe(respuesta: Response, base: string): string | null {
  const locacion = respuesta.headers.get("location");
  if (!locacion) return null;
  return new URL(locacion, base).pathname;
}

// P1-27: dev() en el proceso de vitest responde "Cannot GET /".
// Un proceso aparte entrega el 302 de la home.
function arrancarHome(puerto: number): ChildProcess {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development" };
  delete env.VITEST;
  delete env.VITEST_POOL_ID;
  return spawn(
    process.execPath,
    [
      astroBin,
      "dev",
      "--root",
      raiz,
      "--host",
      "127.0.0.1",
      "--port",
      String(puerto),
      "--ignore-lock",
      "--silent",
    ],
    { cwd: raiz, env, stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function esperarHome(base: string, proceso: ChildProcess): Promise<void> {
  const limite = Date.now() + 60_000;
  let error = "";
  const salida: string[] = [];
  proceso.stdout?.on("data", (buf: Buffer) => salida.push(buf.toString()));
  proceso.stderr?.on("data", (buf: Buffer) => salida.push(buf.toString()));
  while (Date.now() < limite) {
    if (proceso.exitCode !== null) {
      throw new Error(`astro dev salió con ${proceso.exitCode}: ${salida.join("").slice(-500)}`);
    }
    try {
      const respuesta = await fetch(new URL("/", base), { redirect: "manual" });
      await respuesta.body?.cancel();
      return;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  throw new Error(`astro dev no respondió (${error}): ${salida.join("").slice(-500)}`);
}

describe("home con alta=pendiente", () => {
  let proceso: ChildProcess | undefined;
  let base = "";

  beforeAll(async () => {
    const puerto = await puertoLibre();
    base = `http://127.0.0.1:${puerto}/`;
    proceso = arrancarHome(puerto);
    await esperarHome(base, proceso);
  }, 90_000);

  afterAll(async () => {
    if (!proceso || proceso.exitCode !== null) return;
    proceso.kill("SIGTERM");
    await new Promise((resolver) => proceso?.once("exit", resolver));
  });

  async function pedir(ruta: string): Promise<Response> {
    return fetch(new URL(ruta, base), { redirect: "manual" });
  }

  it("con ?alta=pendiente la respuesta lleva a /alta", async () => {
    const respuesta = await pedir("/?alta=pendiente");
    expect(respuesta.status).toBe(302);
    expect(destinoDe(respuesta, base)).toBe("/alta");
  });

  it("sin esa query la respuesta no redirige a /alta", async () => {
    const respuesta = await pedir("/");
    expect(respuesta.status).toBe(200);
    expect(destinoDe(respuesta, base)).toBeNull();
  });
});
