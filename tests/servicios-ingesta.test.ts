import { describe, expect, it } from "vitest";
import {
  clasificar_capa1,
  confirmar_borrador,
  crear_borrador,
  descriptor_fallback_history,
  descriptor_job_vencimientos,
  descriptor_renovar_watch,
  extraer_comprobante,
  matchea_remitente,
  procesar_email,
  registrar_log_ingesta,
  validar_watch_event,
  type CuentaCatalogo,
  type EmailEntrante,
  type FiltroIngesta,
} from "../src/modules/utilities/ingesta_gmail.js";
import type { FacturaServicio } from "../src/modules/utilities/facturas_servicios.js";

const FILTROS: FiltroIngesta[] = [
  { id: "f-edenor", remitente: "edenor.com", servicio: "luz", proveedor: "Edenor", keywords: ["factura", "luz"], activo: true },
  { id: "f-off", remitente: "promo.com", keywords: [], activo: false },
];

const CATALOGO: CuentaCatalogo[] = [
  { accountId: "c-luz", servicio: "luz", proveedor: "Edenor", emails: ["facturas@edenor.com"] },
];

const AHORA = 1_789_000_000_000;
const HOY = "2026-10-10";

function emailBase(over: Partial<EmailEntrante> = {}): EmailEntrante {
  return {
    messageId: "m-" + Math.random().toString(36).slice(2),
    from: "facturas@edenor.com",
    subject: "Tu factura de luz",
    ...over,
  };
}

describe("CS1 watch Gmail (ADR-0007)", () => {
  it("evento watch válido {email, historyId}", () => {
    expect(validar_watch_event({ email: "kiosco@gmail.com", historyId: "12345" })).toEqual([]);
    expect(validar_watch_event({ email: "no-es-email", historyId: "" })).toHaveLength(2);
  });

  it("descriptores: renovación diaria + fallback 15min + job nocturno", () => {
    expect(descriptor_renovar_watch()).toMatchObject({ job: "renovar_gmail_watch", cada: "24h" });
    expect(descriptor_fallback_history("999")).toMatchObject({ job: "gmail_history_fallback", cada: "15min", desde: "999" });
    const j1 = descriptor_job_vencimientos();
    const j2 = descriptor_job_vencimientos();
    expect(j1).toEqual(j2);
    expect(j1.job).toBe("revisar_vencimientos_servicios");
  });

  it("matchea dominio, email exacto y subdominio", () => {
    expect(matchea_remitente("facturas@edenor.com", "edenor.com")).toBe(true);
    expect(matchea_remitente("avisos@mail.edenor.com", "edenor.com")).toBe(true);
    expect(matchea_remitente("tasas@muni.gob.ar", "tasas@muni.gob.ar")).toBe(true);
    expect(matchea_remitente("otro@muni.gob.ar", "tasas@muni.gob.ar")).toBe(false);
    expect(matchea_remitente("spam@tienda.com", "edenor.com")).toBe(false);
  });
});

describe("CS2 capa 1: remitente + keywords (+adjunto)", () => {
  it("remitente en catálogo + keyword => para_procesar alta", () => {
    const c = clasificar_capa1({ from: "facturas@edenor.com", subject: "Tu factura de luz" }, FILTROS, CATALOGO);
    expect(c).toMatchObject({ decision: "para_procesar", confianza: "alta", solicitaLLM: false, accountId: "c-luz", filtroId: "f-edenor" });
  });

  it("aviso de pago / publicidad => ignorar sin guardar contenido", () => {
    const c = clasificar_capa1({ from: "avisos@telecom.com", subject: "Recibimos tu pago de internet" }, FILTROS, CATALOGO);
    expect(c).toMatchObject({ decision: "ignorar", solicitaLLM: false });
  });

  it("remitente desconocido => necesita_revision con descriptor a capa 2 (LLM no implementada)", () => {
    const c = clasificar_capa1({ from: "info@cooperativa.com.ar", subject: "Novedades de su cuenta" }, FILTROS, CATALOGO);
    expect(c).toMatchObject({ decision: "necesita_revision", confianza: "baja", solicitaLLM: true, accountId: null });
  });

  it("promoción de tienda ajena => ignorar (no genera registro ni log con contenido)", () => {
    const c = clasificar_capa1({ from: "promo@tienda.com", subject: "Promo 2x1 esta semana" }, FILTROS, CATALOGO);
    expect(c).toMatchObject({ decision: "ignorar", solicitaLLM: false });
  });

  it("remitente conocido sin keyword => dudoso, pregunta al Dueño (CS2.3)", () => {
    const c = clasificar_capa1({ from: "facturas@edenor.com", subject: "Novedades del mes" }, FILTROS, CATALOGO);
    expect(c).toMatchObject({ decision: "necesita_revision", solicitaLLM: true });
  });
});

describe("CS4 extracción en orden: PDF digital > OCR > cuerpo respaldo", () => {
  const PDF = "Edenor Factura Total $48.000,00 Vence 20/10/2026";
  const OCR = "Edenor Total $84.000,00 Vence 22/10/2026";
  const CUERPO = "Monto $10,00 Vence 01/01/2027";

  it("PDF primero aunque haya OCR y cuerpo distintos", () => {
    const e = extraer_comprobante({ pdfTexto: PDF, ocrTexto: OCR, cuerpo: CUERPO });
    expect(e.origen).toBe("pdf_digital");
    expect(e.montoCentavos).toBe(4_800_000n);
    expect(e.vencimientoIso).toBe("2026-10-20");
    expect(e.necesitaRevision).toBe(false);
  });

  it("sin PDF usa OCR con confianza media", () => {
    const e = extraer_comprobante({ ocrTexto: OCR });
    expect(e.origen).toBe("ocr");
    expect(e.montoCentavos).toBe(8_400_000n);
    expect(e.confianzaMonto).toBe("media");
  });

  it("cuerpo como única fuente es solo respaldo: revisión + confianza baja (P1)", () => {
    const e = extraer_comprobante({ cuerpo: CUERPO });
    expect(e.origen).toBe("email_respaldo");
    expect(e.necesitaRevision).toBe(true);
    expect(e.confianzaMonto).toBe("baja");
    expect(e.confianzaVencimiento).toBe("baja");
  });

  it("las fechas no se confunden con montos", () => {
    const e = extraer_comprobante({ pdfTexto: "Vence 20/10/2026 Total $48.000,00" });
    expect(e.montoCentavos).toBe(4_800_000n);
    expect(e.vencimientoIso).toBe("2026-10-20");
  });
});

describe("CS1/CS2/CS4/CS9 procesar_email", () => {
  it("201 factura desde PDF con log mínimo (E2/E3 ok)", () => {
    const r = procesar_email({
      email: emailBase({
        messageId: "m-ing-1",
        tienePdf: true,
        pdfTexto: "Edenor Factura Total $48.000,00 Vence 20/10/2026 Cuenta 1234567",
      }),
      historyId: "h-1",
      filtros: FILTROS,
      catalogo: CATALOGO,
      vistos: new Map<string, FacturaServicio>(),
      ahoraMs: AHORA,
      hoyIso: HOY,
    });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.factura).toMatchObject({ montoCentavos: 4_800_000n, vencimiento: "2026-10-20", periodo: "2026-10", origen: "pdf_digital" });
    expect(r.log.remitenteDominio).toBe("edenor.com");
    // CS11.3: al log solo id + dominio + decisión, nunca contenido.
    expect(Object.keys(r.log)).toEqual(expect.arrayContaining(["messageId", "remitenteDominio", "decision", "motivo"]));
    expect(JSON.stringify(r.log)).not.toContain("48.000");
  });

  it("E1: sin monto/vencimiento legible => 422 + borrador para corregir por texto", () => {
    const r = procesar_email({
      email: emailBase({ messageId: "m-e1", tienePdf: true, pdfTexto: "Hola, tu factura ya está disponible en la web" }),
      filtros: FILTROS,
      catalogo: CATALOGO,
      vistos: new Map<string, FacturaServicio>(),
      ahoraMs: AHORA,
      hoyIso: HOY,
    });
    expect(r.status).toBe(422);
    if (r.status !== 422) return;
    expect(r.error).toContain("E1");
    expect(r.borrador.messageId).toBe("m-e1");
    expect(r.borrador.estado).toBe("pendiente");
  });

  it("E3: sin adjunto ni texto => 415 adjunto no comprobante", () => {
    const r = procesar_email({
      email: emailBase({ messageId: "m-e3", subject: "Tu factura de luz" }),
      filtros: FILTROS,
      catalogo: CATALOGO,
      vistos: new Map<string, FacturaServicio>(),
      ahoraMs: AHORA,
      hoyIso: HOY,
    });
    expect(r.status).toBe(415);
  });

  it("E2 idempotencia: message-id repetido devuelve existente sin reprocesar", () => {
    const vistos = new Map<string, FacturaServicio>();
    const base = {
      historyId: "h-9",
      filtros: FILTROS,
      catalogo: CATALOGO,
      ahoraMs: AHORA,
      hoyIso: HOY,
    };
    const r1 = procesar_email({
      ...base,
      email: emailBase({ messageId: "m-dup", tienePdf: true, pdfTexto: "Total $48.000,00 Vence 20/10/2026" }),
      vistos,
    });
    expect(r1.status).toBe(201);
    if (r1.status !== 201) return;
    vistos.set("m-dup", r1.factura);
    // Reintento con OTRO contenido: no reprocesa, devuelve el existente.
    const r2 = procesar_email({
      ...base,
      email: emailBase({ messageId: "m-dup", tienePdf: true, pdfTexto: "Total $99.999,00 Vence 01/12/2026" }),
      vistos,
    });
    expect(r2.status).toBe(200);
    if (r2.status !== 200 || !("duplicado" in r2) || !r2.duplicado) return;
    expect(r2.factura.montoCentavos).toBe(4_800_000n);
    expect(vistos.size).toBe(1);
  });

  it("remitente desconocido => 202 necesita_revision con borrador + solicitaLLM", () => {
    const r = procesar_email({
      email: emailBase({ messageId: "m-202", from: "nuevo@cooperativa.com.ar", subject: "Su comprobante" }),
      filtros: FILTROS,
      catalogo: CATALOGO,
      vistos: new Map<string, FacturaServicio>(),
      ahoraMs: AHORA,
      hoyIso: HOY,
    });
    expect(r.status).toBe(202);
    if (r.status !== 202) return;
    expect(r.solicitaLLM).toBe(true);
    expect(r.borrador.estado).toBe("pendiente");
  });

  it("ignorar no guarda contenido, solo id (CS1.4/CS11.3)", () => {
    const r = procesar_email({
      email: emailBase({ messageId: "m-ign", from: "avisos@telecom.com", subject: "Recibimos tu pago" }),
      filtros: FILTROS,
      catalogo: CATALOGO,
      vistos: new Map<string, FacturaServicio>(),
      ahoraMs: AHORA,
      hoyIso: HOY,
    });
    expect(r.status).toBe(200);
    if (r.status !== 200 || !("duplicado" in r)) return;
    expect(r.decision).toBe("ignorar");
    // Sin contenido del email: ni asunto ni cuerpo (el motivo es taxonomía
    // fija del clasificador, no texto del mensaje).
    expect(JSON.stringify(r.log)).not.toContain("Recibimos");
    expect(Object.keys(r.log).sort()).toEqual(
      ["accountId", "decision", "filtroId", "historyId", "messageId", "motivo", "remitenteDominio"].sort(),
    );
  });
});

describe("borrador 7 días + recuerdo 24h (ADR-0005 E5)", () => {
  it("confirma dentro de plazo 201; doble confirma 409; vencido 410", () => {
    const b = crear_borrador({ messageId: "m-b", ahoraMs: AHORA });
    expect(b.venceEnMs - b.creadoEnMs).toBe(7 * 86_400_000);
    expect(b.recuerdoEnMs - b.creadoEnMs).toBe(86_400_000);
    const ok = confirmar_borrador(b, AHORA + 1_000);
    expect(ok.status).toBe(201);
    if (ok.status !== 201) return;
    expect(confirmar_borrador(ok.borrador, AHORA + 2_000)).toMatchObject({ status: 409 });
    expect(confirmar_borrador(b, AHORA + 8 * 86_400_000)).toMatchObject({ status: 410 });
  });

  it("el log nunca lleva contenido del email", () => {
    const log = registrar_log_ingesta({
      messageId: "m-x",
      from: "Facturas <facturas@edenor.com>",
      decision: "para_procesar",
      motivo: "remitente en catálogo + keyword",
    });
    expect(log.remitenteDominio).toBe("edenor.com");
    expect(Object.keys(log).sort()).toEqual(
      ["accountId", "decision", "filtroId", "historyId", "messageId", "motivo", "remitenteDominio"].sort(),
    );
  });
});
