import { describe, expect, it } from "vitest";
import { formatearReporte, revisarCredenciales } from "../scripts/chequear-credenciales.mjs";

const COMPLETAS = {
  GOOGLE_LOGIN_CLIENT_ID: "login-id",
  GOOGLE_LOGIN_CLIENT_SECRET: "login-secret",
  GOOGLE_LOGIN_REDIRECT: "http://localhost:4321/api/auth/callback",
  GOOGLE_INTEGRATIONS_CLIENT_ID: "integrations-id",
  GOOGLE_INTEGRATIONS_CLIENT_SECRET: "integrations-secret",
  GOOGLE_INTEGRATIONS_REDIRECT: "http://localhost:4321/api/integrations/callback",
  WHATSAPP_TOKEN: "wa-token",
  WHATSAPP_PHONE_NUMBER_ID: "wa-phone",
  WHATSAPP_APP_SECRET: "wa-secret",
  WHATSAPP_VERIFY_TOKEN: "wa-verify",
  RESEND_API_KEY: "re-key",
  MP_WEBHOOK_SECRET: "mp-secret",
  OCR_PADDLE_ENDPOINT: "http://127.0.0.1:8868",
  ARCA_CUIT_PROVEEDOR: "20111111112",
  ARCA_CERT_PEM: "cert",
  ARCA_KEY_PEM: "key",
  FISCAL_KMS_KEY_B64: "kms",
  ARCA_AMBIENTE: "homo",
  ASSISTANT_LLM_KEY: "llm-key",
  ASSISTANT_LLM_BASE_URL: "https://api.groq.com/openai/v1",
  ASSISTANT_LLM_MODEL: "llama-3.3-70b-versatile",
};

describe("chequeo de credenciales", () => {
  it("marca presentes todas las integraciones con el entorno completo", () => {
    const reportes = revisarCredenciales(COMPLETAS);
    expect(reportes.map((r) => [r.nombre, r.presente])).toEqual([
      ["Google login", true],
      ["Google Gmail y Photos", false],
      ["Meta WhatsApp Cloud API", true],
      ["Resend", true],
      ["Mercado Pago", true],
      ["OCR Paddle", true],
      ["ARCA", true],
      ["LLM del asistente", true],
    ]);
  });

  it("marca Gmail y Photos como pendiente de cableado, no como credencial faltante", () => {
    const gmail = revisarCredenciales(COMPLETAS).find((r) => r.nombre === "Google Gmail y Photos");
    expect(gmail?.pendiente).toBe(true);
    expect(gmail?.presente).toBe(false);
  });

  it("solo exige la clave del LLM porque la base y el modelo tienen default", () => {
    const llm = revisarCredenciales({ ASSISTANT_LLM_KEY: "clave" }).find((r) => r.nombre === "LLM del asistente");
    expect(llm?.presente).toBe(true);
  });

  it("nombra solo la variable faltante de Meta", () => {
    const reportes = revisarCredenciales({ ...COMPLETAS, WHATSAPP_APP_SECRET: "" });
    const meta = reportes.find((r) => r.nombre === "Meta WhatsApp Cloud API");
    expect(meta?.presente).toBe(false);
    expect(meta?.faltan).toEqual(["WHATSAPP_APP_SECRET"]);
  });

  it("trata el LLM como opcional y ARCA como obligatorio", () => {
    const reportes = revisarCredenciales({});
    const llm = reportes.find((r) => r.nombre === "LLM del asistente");
    const arca = reportes.find((r) => r.nombre === "ARCA");
    expect(llm?.opcional).toBe(true);
    expect(llm?.presente).toBe(false);
    expect(arca?.opcional).toBe(false);
    expect(arca?.faltan).toContain("ARCA_CERT_PEM");
  });

  it("el reporte muestra nombres y faltantes, nunca valores", () => {
    const reportes = revisarCredenciales({ ...COMPLETAS, WHATSAPP_TOKEN: "no-debe-salir" });
    const meta = reportes.find((r) => r.nombre === "Meta WhatsApp Cloud API");
    if (!meta) throw new Error("falta la integración de Meta");
    const texto = formatearReporte([meta]);
    expect(texto).toBe("Meta WhatsApp Cloud API: presente, envío y recepción real del bot");
    expect(texto).not.toContain("no-debe-salir");
    expect(JSON.stringify(reportes)).not.toContain("no-debe-salir");
  });
});
