import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { esRutaDatos } from "../../src/lib/tenant-context.js";

function rutasApi(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...rutasApi(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function rutaParaArchivo(file: string): string {
  let rel = file.replace(/\\/g, "/").replace(/^src\/pages\/api/, "");
  rel = rel.slice(0, -3);
  if (rel.endsWith("/index")) rel = rel.slice(0, -"/index".length);
  return `/api${rel}`;
}

const USA_DATOS = /lib\/repos|tenantDeRequest|getTenantDb/;

// Rutas de control que usan repos fuera del middleware de datos, medidas con rg.
// jobs/*: Sistema con X-Job-Secret por gateJob con tenant explícito.
// /api/whatsapp/webhook: webhook externo de Meta verificado por firma,
// el comercio sale del número remitente, nunca de la sesión.
// /api/billing/webhooks/mercadopago: webhook externo de MP verificado con
// HMAC, el reclamo durable va por base de tenant sin sesión (P0-5).
// /api/email/send: outbox de infraestructura con tenantId opcional, sin sesión.
// /api/devices/register: ruta de control con sesión que persiste el device y
// su grant inicial en la base del tenant explícito del cuerpo (SYNC-S6,
// PRD-SYNC-01); no corre bajo el middleware de datos.
// /api/onboarding/alta: alta ON1 con sesión que crea el comercio en control y
// activa sus módulos de bot (BOT-S1, ADR-0039); no toca la base del tenant.
// /api/bot-modulos: módulos del bot por tenant en control, solo Dueño, a partir
// de la sesión + membership (BOT-S1, ADR-0039).
// /api/whatsapp/resumen: resumen read-only de la tarjeta `Bot` del panel, con
// el tenant de la sesión + membership y base explícita (DASH-S3, ADR-0034).
const EXCEPCIONES_CONTROL: ReadonlySet<string> = new Set([
  "/api/billing/webhooks/mercadopago",
  "/api/bot-modulos",
  "/api/whatsapp/resumen",
  "/api/devices/register",
  "/api/email/send",
  "/api/jobs/alertas-stock",
  "/api/jobs/bot-pyme",
  "/api/jobs/bot-quiosco",
  "/api/jobs/cierre-medianoche",
  "/api/jobs/resumen-mensual",
  "/api/jobs/vencimientos-caja",
  "/api/jobs/vencimientos-lotes",
  "/api/jobs/vencimientos-servicios",
  "/api/jobs/whatsapp-aviso",
  "/api/jobs/whatsapp-cierre",
  "/api/jobs/whatsapp-semanal",
  "/api/onboarding/alta",
  "/api/whatsapp/webhook",
  "/api/gmail/webhook",
  "/api/jobs/gmail-ingesta",
  "/api/jobs/gmail-poll",
  "/api/jobs/gmail-watch",
]);

describe("SEC2-S2 toda ruta de datos vive bajo un prefijo de PREFIJOS_DATOS", () => {
  it("archivos que importan repos o tenant fuera de prefijo solo en excepciones", () => {
    const fuera: string[] = [];
    for (const f of rutasApi(join("src", "pages", "api"))) {
      const src = readFileSync(f, "utf8");
      if (!USA_DATOS.test(src)) continue;
      const ruta = rutaParaArchivo(f);
      if (!esRutaDatos(ruta) && !EXCEPCIONES_CONTROL.has(ruta)) fuera.push(`${f} -> ${ruta}`);
    }
    expect(fuera).toEqual([]);
  });

  it("las excepciones existen y usan datos de verdad", () => {
    expect(EXCEPCIONES_CONTROL.size).toBe(22);
    for (const ruta of EXCEPCIONES_CONTROL) {
      const archivo = `src/pages${ruta}.ts`;
      const src = readFileSync(archivo, "utf8");
      expect(USA_DATOS.test(src)).toBe(true);
      expect(esRutaDatos(ruta)).toBe(false);
    }
  });
});
