import { beforeEach, describe, expect, it } from "vitest";
import { bd, crearTablasVacias, resetDb } from "../src/offline/db.js";
import {
  FOTOS_MAX_COUNT,
  ajustarDimensiones,
  confirmarFoto,
  descartarMemoriaFotos,
  encolarFoto,
  hayCupo,
  hidratarFotos,
  marcarMiniaturaLista,
  marcarSubida,
  ordenarParaSubida,
  pendientesFotos,
  resetFotos,
  totalesFotos,
  validarFoto,
} from "../src/offline/fotos.js";

beforeEach(async () => {
  await resetDb();
  await resetFotos();
});

describe("PWA-S4 fotos en cola (800px/200KB, cupo, miniatura, tras datos)", () => {
  it("ajusta el lado mayor a 800 preservando aspecto", () => {
    expect(ajustarDimensiones(1600, 1200)).toEqual({ ancho: 800, alto: 600 });
    expect(ajustarDimensiones(400, 300)).toEqual({ ancho: 400, alto: 300 });
    expect(ajustarDimensiones(0, 10)).toEqual({ ancho: 0, alto: 0 });
  });

  it("rechaza peso >200KB y dimensiones inválidas", () => {
    expect(validarFoto({ sku: "yerba-1", bytes: 200 * 1024 + 1, ancho: 800, alto: 600 }).ok).toBe(false);
    expect(validarFoto({ sku: "yerba-1", bytes: 100, ancho: 0, alto: 10 }).ok).toBe(false);
    expect(validarFoto({ sku: "  ", bytes: 100, ancho: 100, alto: 100 }).ok).toBe(false);
    const ok = validarFoto({ sku: "yerba-1", bytes: 200 * 1024, ancho: 1600, alto: 1200 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(Math.max(ok.ancho, ok.alto)).toBeLessThanOrEqual(800);
  });

  it("guarda con miniatura pendiente y permite marcar lista/subida/confirmada", async () => {
    const r = await encolarFoto({ sku: "yerba-1", bytes: 150_000, ancho: 1600, alto: 1200 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.foto.miniatura).toBe("pendiente");
    expect(r.foto.estado).toBe("miniatura");
    expect(Math.max(r.foto.ancho, r.foto.alto)).toBeLessThanOrEqual(800);
    await marcarMiniaturaLista(r.foto.id);
    await marcarSubida(r.foto.id);
    const pend = await pendientesFotos();
    expect(pend[0]?.miniatura).toBe("lista");
    expect(pend[0]?.estado).toBe("subida");
    await confirmarFoto(r.foto.id);
    expect(await pendientesFotos()).toHaveLength(0);
  });

  it("enforcea cupo 100 fotos (y helper 50MB)", async () => {
    expect(hayCupo({ count: 100, bytes: 0 }, 10)).toBe(false);
    expect(hayCupo({ count: 0, bytes: 50 * 1024 * 1024 }, 1)).toBe(false);
    for (let i = 0; i < FOTOS_MAX_COUNT; i++) {
      const r = await encolarFoto({ sku: `sku-${i}`, bytes: 1000, ancho: 100, alto: 100 });
      expect(r.ok).toBe(true);
    }
    const extra = await encolarFoto({ sku: "sku-extra", bytes: 1000, ancho: 100, alto: 100 });
    expect(extra.ok).toBe(false);
    const tot = await totalesFotos();
    expect(tot.count).toBe(FOTOS_MAX_COUNT);
  });

  it("fotos suben tras los datos (orden estable)", () => {
    expect(ordenarParaSubida(["foto", "venta", "mov_caja", "foto"])).toEqual(["venta", "mov_caja", "foto", "foto"]);
  });

  it("DDL photos_queue trae columnas PWA-S4 y sobrevive a restart", async () => {
    await crearTablasVacias();
    const out = bd().exec("PRAGMA table_info(photos_queue)");
    const cols = out[0]?.values.map((v) => String(v[1])) ?? [];
    for (const c of ["id", "sku", "bytes", "ancho", "alto", "miniatura", "estado", "creado_en"]) {
      expect(cols).toContain(c);
    }
    const r = await encolarFoto({ sku: "yerba-1", bytes: 10_000, ancho: 800, alto: 600 });
    expect(r.ok).toBe(true);
    await descartarMemoriaFotos();
    expect(await pendientesFotos()).toHaveLength(0);
    await hidratarFotos();
    const list = await pendientesFotos();
    expect(list.map((f) => f.sku)).toEqual(["yerba-1"]);
  });

  it("sin abrir, todo sigue en memoria (stub compatible)", async () => {
    const r = await encolarFoto({ sku: "yerba-1", bytes: 10_000, ancho: 100, alto: 100 });
    expect(r.ok).toBe(true);
    expect(await pendientesFotos()).toHaveLength(1);
  });
});
