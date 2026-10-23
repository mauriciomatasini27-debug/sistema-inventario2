import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decidir_modo, puede_disparar_envio, PLANTILLA_ALERTA_STOCK_BAJO } from "../src/modules/whatsapp/envio.js";
import * as cliente from "../src/modules/whatsapp/cliente-cloud.js";
import { enviar_payload_wa, enviar_texto_wa } from "../src/jobs/whatsapp-adaptador.js";
import { construir_texto } from "../src/modules/whatsapp/envio.js";

describe("WA-VENTANA: decidir_modo y puede_disparar_envio", () => {
  it("fuera de ventana exige id de plantilla aprobada", () => {
    expect(decidir_modo(false)).toBe("requiere_plantilla");
    expect(puede_disparar_envio({ dentroVentana24h: false, idPlantillaAprobada: null })).toBe(false);
    expect(puede_disparar_envio({ dentroVentana24h: false, idPlantillaAprobada: "  " })).toBe(false);
    expect(puede_disparar_envio({ dentroVentana24h: false, idPlantillaAprobada: "meta-id-1" })).toBe(true);
  });

  it("dentro de ventana no exige plantilla", () => {
    expect(decidir_modo(true)).toBe("libre");
    expect(puede_disparar_envio({ dentroVentana24h: true, idPlantillaAprobada: null })).toBe(true);
  });
});

describe("WA-VENTANA: adaptador no llama enviar_whatsapp sin plantilla", () => {
  const enviarSpy = vi.spyOn(cliente, "enviar_whatsapp");

  beforeEach(() => {
    enviarSpy.mockReset();
    enviarSpy.mockResolvedValue({ ok: true, wamid: "wamid-test" });
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone";
    process.env.WHATSAPP_TOKEN = "token";
    delete process.env.WHATSAPP_PLANTILLAS_APROBADAS;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PLANTILLAS_APROBADAS;
  });

  it("job proactivo (fuera de ventana) sin id aprobado no hace fetch", async () => {
    const ok = await enviar_texto_wa("+5491100000001", "hola", { nombrePlantilla: PLANTILLA_ALERTA_STOCK_BAJO });
    expect(ok).toBe(false);
    expect(enviarSpy).not.toHaveBeenCalled();
  });

  it("con id aprobado en env sí dispara Cloud API", async () => {
    process.env.WHATSAPP_PLANTILLAS_APROBADAS = JSON.stringify({ [PLANTILLA_ALERTA_STOCK_BAJO]: "tpl-99" });
    const ok = await enviar_payload_wa("+5491100000001", construir_texto("hola"), {
      nombrePlantilla: PLANTILLA_ALERTA_STOCK_BAJO,
    });
    expect(ok).toBe(true);
    expect(enviarSpy).toHaveBeenCalledOnce();
  });

  it("dentro de ventana 24h envía aunque falte plantilla", async () => {
    const ok = await enviar_texto_wa("+5491100000001", "hola", { dentroVentana24h: true });
    expect(ok).toBe(true);
    expect(enviarSpy).toHaveBeenCalledOnce();
  });
});
