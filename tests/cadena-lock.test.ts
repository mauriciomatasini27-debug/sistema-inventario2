import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DOS_HORAS_MS, leerLock, liberar, liberarSiStale, motivoStale, tomar } from "../scripts/cadena/lock-lib.mjs";

let dir: string;
let lock: string;
let log: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cadena-lock-"));
  lock = path.join(dir, ".cadena.lock");
  log = path.join(dir, "cadena-log.tsv");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const muerto = () => false;
const vivo = () => true;

describe("lock: detección de stale", () => {
  it("formato actual: solo PID", () => {
    fs.writeFileSync(lock, "47867\n");
    expect(leerLock(lock)?.pid).toBe(47867);
  });
  it("PID vivo no es stale aunque sea viejo", () => {
    expect(motivoStale({ pid: 1, mtimeMs: 0, crudo: "1" }, { vivo, ahora: DOS_HORAS_MS * 10 })).toBeNull();
  });
  it("PID muerto es stale; >2h lo dice", () => {
    expect(motivoStale({ pid: 9, mtimeMs: Date.now(), crudo: "9" }, { vivo: muerto })).toMatch(/muerto/);
    expect(motivoStale({ pid: 9, mtimeMs: 0, crudo: "9" }, { vivo: muerto, ahora: DOS_HORAS_MS + 60000 })).toMatch(/>2h/);
  });
  it("sin PID es stale", () => {
    expect(motivoStale({ pid: null, mtimeMs: 0, crudo: "basura" })).toMatch(/sin PID/);
  });
  it("PID real: el propio proceso está vivo", () => {
    fs.writeFileSync(lock, `${process.pid}\n`);
    expect(liberarSiStale(lock, { log }).liberado).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
  });
  it("libera stale y loguea en el TSV", () => {
    fs.writeFileSync(lock, "999999\n");
    expect(liberarSiStale(lock, { log, vivo: muerto }).liberado).toBe(true);
    expect(fs.existsSync(lock)).toBe(false);
    expect(fs.readFileSync(log, "utf8")).toMatch(/\tlock-stale\tok\tliberado .*pid=999999/);
  });
});

describe("lock: tomar/liberar", () => {
  it("tomar es exclusivo y escribe solo el PID", () => {
    expect(tomar(lock, 111, { vivo }).tomado).toBe(true);
    expect(fs.readFileSync(lock, "utf8")).toBe("111\n");
    expect(tomar(lock, 222, { vivo })).toEqual({ tomado: false, dueño: 111 });
  });
  it("tomar reemplaza uno stale", () => {
    fs.writeFileSync(lock, "111\n");
    expect(tomar(lock, 222, { vivo: muerto, log }).tomado).toBe(true);
    expect(leerLock(lock)?.pid).toBe(222);
  });
  it("liberar solo el propio o stale", () => {
    fs.writeFileSync(lock, "111\n");
    expect(liberar(lock, 222, { vivo }).liberado).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
    expect(liberar(lock, 111, { vivo }).liberado).toBe(true);
    fs.writeFileSync(lock, "111\n");
    expect(liberar(lock, 222, { vivo: muerto, log }).liberado).toBe(true);
  });
});
