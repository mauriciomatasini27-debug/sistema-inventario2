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
  registrar_log_ingesta,
  validar_watch_event,
  type CuentaCatalogo,
  type FiltroIngesta,
} from "../src/modules/utilities/ingesta_gmail.js";

const FILTROS: FiltroIngesta[] = [
  { id: "f-edenor", remitente: "edenor.com", servicio: "luz", proveedor: "Edenor", keywords: ["factura", "luz"], activo: true },
  { id: "f-off", remitente: "promo.com", keywords: [], activo: false },
];

const CATALOGO: CuentaCatalogo[] = [
  { accountId: "c-luz", servicio: "luz", proveedor: "Edenor", emails: ["facturas@edenor.com"] },
];

const AHORA = 1_789_000_000_000;

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
