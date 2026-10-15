import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { POST as POSTLots, GET as GETLots } from "../src/pages/api/lots.js";
import { POST as POSTVenc } from "../src/pages/api/jobs/vencimientos-lotes.js";
import { clasificarLotes, invarianteStockLotesMovs } from "../src/lib/repos/lotes.js";
import { listarMovimientos, nivelStock } from "../src/lib/repos/stock.js";

const DIA_MS = 86_400_000;

beforeEach(() => resetStore());

describe("CAT-S4 baja vencido como MERMA", () => {
  it("lote vencido se da de baja con MERMA motivo vencido e invariante en 0", async () => {
    const vencido = new Date(Date.now() - 2 * DIA_MS).toISOString();
    const alta = (await POSTLots(ctx("http://x/api/lots", { body: { sku: "MER-1", cantidad: 5, vence_el: vencido } }))) as Response;
    expect(alta.status).toBe(201);
    const lote = (await alta.json()) as { id: string };

    const r = (await POSTVenc(ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST" }))) as Response;
    const j = (await r.json()) as { bajas_merma: Array<{ lote_id: string; sku: string; cantidad: number }> };
    expect(j.bajas_merma).toEqual([{ lote_id: lote.id, sku: "MER-1", cantidad: 5 }]);

    const g = (await GETLots(ctx("http://x/api/lots?sku=MER-1"))) as Response;
    const lotes = (await g.json()) as { lotes: Array<{ id: string; cantidadRestante: number }> };
    expect(lotes.lotes.find((l) => l.id === lote.id)?.cantidadRestante).toBe(0);

    const movs = (await listarMovimientos()).filter((m) => m.sku === "MER-1");
    expect(movs.reduce((a, m) => a + m.delta, 0)).toBe(0);
    const mermas = movs.filter((m) => m.tipo === "MERMA");
    expect(mermas).toHaveLength(1);
    expect(mermas[0]).toMatchObject({ delta: -5, motivo: "vencido" });

    const sumaLotes = lotes.lotes.reduce((a, l) => a + l.cantidadRestante, 0);
    expect(nivelStock("MER-1")).toBe(0);
    expect(invarianteStockLotesMovs({ stockActual: 0, lotesCantidadRestante: sumaLotes, movsDeltaSum: 0 })).toBe(true);
  });

  it("segunda corrida no repite la MERMA y bajas_merma es []", async () => {
    const vencido = new Date(Date.now() - 2 * DIA_MS).toISOString();
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "MER-1", cantidad: 5, vence_el: vencido } }));
    await POSTVenc(ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST" }));

    const r2 = (await POSTVenc(ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST" }))) as Response;
    const j2 = (await r2.json()) as { bajas_merma: unknown[] };
    expect(j2.bajas_merma).toEqual([]);
    const mermas = (await listarMovimientos()).filter((m) => m.sku === "MER-1" && m.tipo === "MERMA");
    expect(mermas).toHaveLength(1);
  });

  it("lote a +2d va a alertas_3d con promo_bot y promos_vencer sin MERMA", async () => {
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "MER-2", cantidad: 3, vence_el: new Date(Date.now() + 2 * DIA_MS).toISOString() } }));
    const r = (await POSTVenc(ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST" }))) as Response;
    const j = (await r.json()) as {
      alertas_3d: Array<{ sku: string }>;
      promo_bot: boolean;
      promos_vencer: Array<{ sku: string; lote_id: string; vence_en_dias: number }>;
      bajas_merma: unknown[];
    };
    expect(j.alertas_3d.filter((a) => a.sku === "MER-2")).toHaveLength(1);
    expect(j.promo_bot).toBe(true);
    expect(j.promos_vencer).toContainEqual(expect.objectContaining({ sku: "MER-2", vence_en_dias: 2 }));
    expect((await listarMovimientos()).filter((m) => m.sku === "MER-2" && m.tipo === "MERMA")).toHaveLength(0);
    expect(j.bajas_merma).toEqual([]);
  });

  it("lote a +10d va a alertas_15d sin bajas", async () => {
    await POSTLots(ctx("http://x/api/lots", { body: { sku: "MER-3", cantidad: 3, vence_el: new Date(Date.now() + 10 * DIA_MS).toISOString() } }));
    const r = (await POSTVenc(ctx("http://x/api/jobs/vencimientos-lotes", { method: "POST" }))) as Response;
    const j = (await r.json()) as {
      alertas_15d: Array<{ sku: string }>;
      alertas_7d: Array<{ sku: string }>;
      alertas_3d: Array<{ sku: string }>;
      bajas_merma: unknown[];
    };
    expect(j.alertas_15d.filter((a) => a.sku === "MER-3")).toHaveLength(1);
    expect(j.alertas_7d.filter((a) => a.sku === "MER-3")).toHaveLength(0);
    expect(j.alertas_3d.filter((a) => a.sku === "MER-3")).toHaveLength(0);
    expect(j.bajas_merma).toEqual([]);
  });

  it("clasificador puro: bordes 3/4, 7/8, 15/16 y -1", () => {
    const ahora = Date.now();
    const iso = (d: number): string => new Date(ahora + d * DIA_MS).toISOString();
    const lote = (id: string, dias: number) => ({ id, sku: "B", cantidadRestante: 1, venceEl: iso(dias) });
    const c = clasificarLotes(
      [lote("m3", 3), lote("m4", 4), lote("m7", 7), lote("m8", 8), lote("m15", 15), lote("m16", 16), lote("v1", -1)],
      ahora,
    );
    expect(c.alertas_3d.map((a) => a.lote_id)).toEqual(["m3"]);
    expect(c.alertas_7d.map((a) => a.lote_id)).toEqual(["m4", "m7"]);
    expect(c.alertas_15d.map((a) => a.lote_id)).toEqual(["m8", "m15"]);
    expect(c.vencidos.map((v) => v.lote_id)).toEqual(["v1"]);
    expect(c.promos_vencer).toEqual([{ sku: "B", lote_id: "m3", vence_en_dias: 3 }]);
    expect(c.promo_bot).toBe(true);
  });
});
