import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = path.resolve("scripts/cadena/con-lock.sh");
let dir: string;
let env: NodeJS.ProcessEnv;
let lock: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cadena-con-lock-"));
  lock = path.join(dir, ".cadena.lock");
  env = { ...process.env, CADENA_LOCK: lock, CADENA_LOG: path.join(dir, "log.tsv"), CADENA_WAIT_MIN: "0" };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const correr = (...cmd: string[]) => spawnSync("bash", [script, ...cmd], { env, encoding: "utf8" });

describe("con-lock.sh", () => {
  it("toma el lock durante el comando y lo libera al terminar", () => {
    const r = correr("bash", "-c", `cat "${lock}"`);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/tomado pid=(\d+)/);
    const pid = r.stdout.match(/tomado pid=(\d+)/)?.[1];
    expect(r.stdout).toContain(`${pid}\n`);
    expect(fs.existsSync(lock)).toBe(false);
  });
  it("libera aunque el comando falle y propaga el exit", () => {
    const r = correr("bash", "-c", "exit 7");
    expect(r.status).toBe(7);
    expect(fs.existsSync(lock)).toBe(false);
  });
  it("respeta un dueño vivo: no corre el comando y no toca el lock", () => {
    fs.writeFileSync(lock, `${process.pid}\n`);
    const marca = path.join(dir, "corrio");
    const r = correr("touch", marca);
    expect(r.status).toBe(3);
    expect(fs.existsSync(marca)).toBe(false);
    expect(fs.readFileSync(lock, "utf8").trim()).toBe(String(process.pid));
  });
  it("libera un lock stale (PID muerto) y corre", () => {
    fs.writeFileSync(lock, "999999\n");
    const r = correr("true");
    expect(r.status).toBe(0);
    expect(fs.existsSync(lock)).toBe(false);
  });
});
