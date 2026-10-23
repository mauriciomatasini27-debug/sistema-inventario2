import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const RUTA_ENV = fileURLToPath(new URL("../.env", import.meta.url));

// GGL-CRED: nombres fijos del cableado Gmail/PubSub/KMS; nunca imprimir valores.
export const VARIABLES_GOOGLE_INTEGRATIONS = [
  "GOOGLE_INTEGRATIONS_CLIENT_ID",
  "GOOGLE_INTEGRATIONS_CLIENT_SECRET",
  "GOOGLE_INTEGRATIONS_REDIRECT",
  "GMAIL_PUBSUB_TOPIC",
  "GMAIL_PUBSUB_AUDIENCE",
  "GMAIL_PUBSUB_EMAIL",
  "GMAIL_ROUTE_PEPPER",
  "INTEGRATIONS_KMS_KEY_B64",
  "INTEGRATIONS_KMS_KEY_ID",
  "INTEGRATIONS_STATE_SECRET",
];

export function revisarGoogleIntegrationsEnv(env = process.env) {
  return VARIABLES_GOOGLE_INTEGRATIONS.map((nombre) => ({
    nombre,
    presente: String(env[nombre] ?? "").trim() !== "",
  }));
}

export function formatearGoogleIntegrationsEnv(filas) {
  return filas.map((f) => `${f.nombre}: ${f.presente ? "presente" : "ausente"}`).join("\n");
}

export function todasPresentes(filas) {
  return filas.every((f) => f.presente);
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
  const filas = revisarGoogleIntegrationsEnv();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(filas, null, 2));
    return;
  }
  console.log(formatearGoogleIntegrationsEnv(filas));
  if (!todasPresentes(filas)) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
