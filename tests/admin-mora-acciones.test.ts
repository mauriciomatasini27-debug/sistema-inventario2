import { describe, expect, it, vi } from "vitest";
import {
  ejecutarAccionMora,
  sugerirIdempotencyKey,
  textoResultadoMora,
  validarAccionMora,
  type AccionMora,
} from "../src/modules/admin/mora-acciones.js";

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchFalso(status: number, body: unknown) {
  return vi.fn(async () => respuesta(status, body)) as unknown as typeof fetch;
}

function enviado(f: typeof fetch) {
  const llamada = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as
    | [string, RequestInit]
    | undefined;
  if (!llamada) throw new Error("no se llamó a fetch");
  const [url, init] = llamada;
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

const evaluar: AccionMora = {
  tipo: "evaluar",
  tenantId: "t1",
  diasAtraso: 15,
  saldoDeudorCentavos: 123400n,
};

describe("acciones de mora cableadas", () => {
  it("el dry-run manda días y saldo como string al endpoint de evaluar", async () => {
    const fetch = fetchFalso(200, {
      decisiones: [
        {
          tenant_id: "t1",
          estado_actual: "activo",
          decision: "suspender",
          proximoPasoEn: "2026-11-16T00:00:00.000Z",
          debeEmitirEvento: true,
        },
      ],
    });
    const r = await ejecutarAccionMora(evaluar, { fetch });

    expect(r).toMatchObject({ ok: true, tipo: "evaluar" });
    const { url, init, body } = enviado(fetch);
    expect(url).toBe("/api/admin/mora/evaluar");
    expect(init.method).toBe("POST");
    expect(body).toEqual({
      tenant_id: "t1",
      dias_atraso: 15,
      saldo_deudor_centavos: "123400",
    });
  });

  it("una acción inválida no llega a la red", async () => {
    const fetch = fetchFalso(200, {});
    const r = await ejecutarAccionMora({ ...evaluar, diasAtraso: -1 }, { fetch });

    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("el dry-run con saldo cero se lee como al día", async () => {
    const fetch = fetchFalso(200, {
      decisiones: [
        {
          tenant_id: "t1",
          estado_actual: "activo",
          decision: "al_dia",
          proximoPasoEn: "2026-11-16T00:00:00.000Z",
          debeEmitirEvento: false,
        },
      ],
    });
    const r = await ejecutarAccionMora({ ...evaluar, saldoDeudorCentavos: 0n }, { fetch });

    expect(textoResultadoMora(r)).toContain("Al día");
  });

  it("suspender exige el id escrito y viaja al endpoint de mora", async () => {
    const fetch = fetchFalso(200, { tenant_id: "t1", estado: "suspendido" });
    const accion: AccionMora = {
      tipo: "suspender",
      tenantId: "t1",
      motivo: "sin pago",
      confirmoId: "t1",
    };

    expect(validarAccionMora({ ...accion, confirmoId: "otro" })).toContain("id completo");
    const r = await ejecutarAccionMora(accion, { fetch });

    expect(textoResultadoMora(r)).toBe("Suspendido. Estado: suspendido.");
    const { url, body } = enviado(fetch);
    expect(url).toBe("/api/admin/mora/suspender");
    expect(body).toEqual({ tenant_id: "t1", motivo: "sin pago", confirmo_id: "t1" });
  });

  it("el reintento del mismo día se informa como ya suspendido", async () => {
    const fetch = fetchFalso(200, { tenant_id: "t1", estado: "suspendido", ya: true });
    const r = await ejecutarAccionMora(
      { tipo: "suspender", tenantId: "t1", motivo: "sin pago", confirmoId: "t1" },
      { fetch },
    );

    expect(textoResultadoMora(r)).toBe("Ya estaba suspendido hoy.");
  });

  it("regularizar asienta el cobro y devuelve el asiento", async () => {
    const fetch = fetchFalso(200, {
      tenant_id: "t1",
      estado: "activo",
      asiento_id: "cobro:k1",
      monto_centavos: "5000",
    });
    const r = await ejecutarAccionMora(
      {
        tipo: "regularizar",
        tenantId: "t1",
        motivo: "pagó",
        confirmoId: "t1",
        cobro: {
          montoCentavos: 5000n,
          medio: "transferencia",
          referenciaExterna: "op-1",
          idempotencyKey: "k1",
        },
      },
      { fetch },
    );

    const { url, body } = enviado(fetch);
    expect(url).toBe("/api/admin/mora/regularizar");
    expect(body).toMatchObject({
      tenant_id: "t1",
      confirmo_id: "t1",
      cobro: {
        monto_centavos: "5000",
        medio: "transferencia",
        referencia_externa: "op-1",
        idempotency_key: "k1",
      },
    });
    expect(textoResultadoMora(r)).toContain("cobro:k1");
  });

  it("regularizar con monto cero se rechaza antes del POST", async () => {
    const fetch = fetchFalso(200, {});
    const r = await ejecutarAccionMora(
      {
        tipo: "regularizar",
        tenantId: "t1",
        motivo: "pagó",
        confirmoId: "t1",
        cobro: {
          montoCentavos: 0n,
          medio: "transferencia",
          referenciaExterna: "op-1",
          idempotencyKey: "k1",
        },
      },
      { fetch },
    );

    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("un 403 del servidor se muestra con su mensaje", async () => {
    const fetch = fetchFalso(403, { error: "No tenés permiso para ver el panel." });
    const r = await ejecutarAccionMora(evaluar, { fetch });

    expect(textoResultadoMora(r)).toBe("No tenés permiso para ver el panel.");
  });

  it("una respuesta sin decisiones no se muestra como éxito", async () => {
    const fetch = fetchFalso(200, { hola: "mundo" });
    const r = await ejecutarAccionMora(evaluar, { fetch });

    expect(r).toMatchObject({ ok: false, status: 502 });
  });

  it("la clave de idempotencia sugerida es estable por tenant y día", () => {
    expect(sugerirIdempotencyKey("t1", "2026-11-16")).toBe("regularizar:t1:2026-11-16");
    expect(sugerirIdempotencyKey("t1", "2026-11-16")).toBe(sugerirIdempotencyKey("t1", "2026-11-16"));
  });
});
