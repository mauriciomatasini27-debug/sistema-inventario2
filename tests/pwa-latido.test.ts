import { beforeEach, describe, expect, it } from "vitest";
import { crearTablasVacias, resetDb } from "../src/offline/db.js";
import { encolar, pendientes, resetOutbox } from "../src/offline/outbox-store.js";
import { encolarFoto, pendientesFotos, resetFotos } from "../src/offline/fotos.js";
import { hidratarDispositivo, resetFlagCompartido } from "../src/offline/dispositivo.js";
import { resetMappings } from "../src/offline/id-mappings.js";
import { abrir, resetOffline } from "../src/offline/offline.js";
import { latido, type LatidoPost } from "../src/offline/latido.js";

function ok(post: (cuerpo: unknown) => unknown): LatidoPost {
  return async (_url, _cuerpo) => ({ status: 200, json: post(_cuerpo) });
}

async function sembrar(): Promise<void> {
  await crearTablasVacias();
  await encolar({ kind: "venta", resumen: "v1" });
  const f = await encolarFoto({ sku: "yerba-1", bytes: 5000, ancho: 800, alto: 600 });
  expect(f.ok).toBe(true);
}

beforeEach(async () => {
  await resetDb();
  await resetOutbox();
  await resetMappings();
  await resetFotos();
  resetFlagCompartido();
});

describe("P1-8 latido PWA-S5: wipe:true borra local, wipe falso no toca nada", () => {
  it("wipe:true ejecuta borrado remoto y deja la base ilegible", async () => {
    await sembrar();
    const r = await latido({
      deviceCode: "caja-01",
      pendientes: 1,
      post: ok(() => ({ wipe: true, estado: "rojo", pendientes: 1 })),
    });
    expect(r).toEqual({ wipe: true, borrado: true, estado: "rojo", pendientes: 1 });
    expect(await pendientes(1_000_000)).toHaveLength(0);
    expect(await pendientesFotos()).toHaveLength(0);
    await hidratarDispositivo();
    expect(await pendientes(1_000_000)).toHaveLength(0);
    expect(await pendientesFotos()).toHaveLength(0);
  });

  it("wipe falso no toca outbox ni fotos", async () => {
    await sembrar();
    const r = await latido({
      deviceCode: "caja-01",
      pendientes: 1,
      post: ok(() => ({ wipe: false, estado: "ambar", pendientes: 1 })),
    });
    expect(r).toEqual({ wipe: false, borrado: false, estado: "ambar", pendientes: 1 });
    expect(await pendientes(1_000_000)).toHaveLength(1);
    expect(await pendientesFotos()).toHaveLength(1);
  });

  it("respuesta sin wipe no borra (ausencia vale como falso)", async () => {
    await sembrar();
    const r = await latido({
      deviceCode: "caja-01",
      pendientes: 1,
      post: ok(() => ({ estado: "verde", pendientes: 0 })),
    });
    expect(r.wipe).toBe(false);
    expect(await pendientes(1_000_000)).toHaveLength(1);
  });

  it("HTTP no-ok lanza un error claro y no borra", async () => {
    await sembrar();
    const post: LatidoPost = async () => ({ status: 503, json: { error: "base_no_disponible" } });
    await expect(latido({ deviceCode: "caja-01", pendientes: 1, post })).rejects.toThrow(/503/);
    expect(await pendientes(1_000_000)).toHaveLength(1);
    expect(await pendientesFotos()).toHaveLength(1);
  });

  it("Offline.latido cuenta pendientes por defecto y propaga wipe al borrado", async () => {
    const off = await abrir({ deviceCode: "caja-01" });
    await off.vender({ sku: "yerba-1", cant: 1, medio: "Efectivo" });
    let cuerpoVisto: unknown;
    const post: LatidoPost = async (_url, cuerpo) => {
      cuerpoVisto = cuerpo;
      return { status: 200, json: { wipe: true } };
    };
    const conPost = await abrir({ deviceCode: "caja-01", latidoPost: post });
    const r = await conPost.latido();
    expect((cuerpoVisto as { pendientes: number }).pendientes).toBe(1);
    expect(r.wipe).toBe(true);
    expect(r.borrado).toBe(true);
    expect(await pendientes(1_000_000)).toHaveLength(0);
    await resetOffline();
  });

  it("Offline.latido acepta pendientes explícitos sin contar", async () => {
    let cuerpoVisto: unknown;
    const post: LatidoPost = async (_url, cuerpo) => {
      cuerpoVisto = cuerpo;
      return { status: 200, json: { wipe: false, estado: "verde" } };
    };
    const off = await abrir({ deviceCode: "caja-01", latidoPost: post });
    const r = await off.latido(7);
    expect((cuerpoVisto as { pendientes: number }).pendientes).toBe(7);
    expect(r).toEqual({ wipe: false, borrado: false, estado: "verde" });
    await resetOffline();
  });
});
