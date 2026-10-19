import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const RUTA_ENV = fileURLToPath(new URL("../.env", import.meta.url));

export const INTEGRACIONES = [
  {
    nombre: "Google login",
    variables: ["GOOGLE_LOGIN_CLIENT_ID", "GOOGLE_LOGIN_CLIENT_SECRET", "GOOGLE_LOGIN_REDIRECT"],
    desbloquea: "login real con Google",
  },
  {
    nombre: "Google Gmail y Photos",
    variables: ["GOOGLE_INTEGRATIONS_CLIENT_ID", "GOOGLE_INTEGRATIONS_CLIENT_SECRET", "GOOGLE_INTEGRATIONS_REDIRECT"],
    desbloquea: "ingesta de Gmail y descarga de fotos",
    pendiente: true,
  },
  {
    nombre: "Meta WhatsApp Cloud API",
    variables: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"],
    desbloquea: "envío y recepción real del bot",
  },
  {
    nombre: "Resend",
    variables: ["RESEND_API_KEY"],
    desbloquea: "envío real de email",
  },
  {
    nombre: "Mercado Pago",
    variables: ["MP_WEBHOOK_SECRET"],
    desbloquea: "validación del webhook de pago",
  },
  {
    nombre: "OCR Paddle",
    variables: ["OCR_PADDLE_ENDPOINT"],
    desbloquea: "benchmark e ingesta real de OCR",
  },
  {
    nombre: "ARCA",
    variables: ["ARCA_CUIT_PROVEEDOR", "ARCA_CERT_PEM", "ARCA_KEY_PEM", "FISCAL_KMS_KEY_B64", "ARCA_AMBIENTE"],
    desbloquea: "homologación y emisión fiscal real",
  },
  {
    nombre: "LLM del asistente",
    variables: ["ASSISTANT_LLM_KEY"],
    desbloquea: "asistente con proveedor real",
    opcional: true,
  },
];

export function revisarCredenciales(env = process.env) {
  return INTEGRACIONES.map((integracion) => {
    const faltan = integracion.variables.filter((variable) => String(env[variable] ?? "").trim() === "");
    const pendiente = integracion.pendiente === true;
    return {
      nombre: integracion.nombre,
      desbloquea: integracion.desbloquea,
      opcional: integracion.opcional === true,
      pendiente,
      presente: pendiente ? false : faltan.length === 0,
      faltan,
    };
  });
}

export function formatearReporte(reportes) {
  return reportes
    .map((reporte) => {
      if (reporte.pendiente) return `${reporte.nombre}: pendiente de cableado, ${reporte.desbloquea}`;
      if (reporte.presente) return `${reporte.nombre}: presente, ${reporte.desbloquea}`;
      const estado = reporte.opcional ? "opcional" : "falta";
      return `${reporte.nombre}: ${estado} ${reporte.faltan.join(", ")}, desbloquea ${reporte.desbloquea}`;
    })
    .join("\n");
}

function cargarEnvLocal() {
  if (!existsSync(RUTA_ENV)) return true;
  try {
    process.loadEnvFile(RUTA_ENV);
    return true;
  } catch (error) {
    console.error(`no se pudo leer ${RUTA_ENV}: ${error.message}`);
    return false;
  }
}

function main() {
  if (!cargarEnvLocal()) process.exit(1);
  const reportes = revisarCredenciales();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(reportes, null, 2));
    return;
  }
  console.log(formatearReporte(reportes));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
