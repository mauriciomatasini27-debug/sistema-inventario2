import { describe, expect, it } from "vitest";
import {
  VARIABLES_GOOGLE_INTEGRATIONS,
  formatearGoogleIntegrationsEnv,
  revisarGoogleIntegrationsEnv,
  todasPresentes,
} from "../scripts/check-google-integrations-env.mjs";

const COMPLETAS = Object.fromEntries(
  VARIABLES_GOOGLE_INTEGRATIONS.map((nombre) => [nombre, `valor-${nombre}`]),
);

describe("check-google-integrations-env (GGL-CRED)", () => {
  it("lista las diez variables esperadas", () => {
    expect(VARIABLES_GOOGLE_INTEGRATIONS).toEqual([
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
    ]);
  });

  it("marca presente|ausente sin exponer valores", () => {
    const filas = revisarGoogleIntegrationsEnv({
      ...COMPLETAS,
      GMAIL_PUBSUB_TOPIC: "",
    });
    const topic = filas.find((f) => f.nombre === "GMAIL_PUBSUB_TOPIC");
    expect(topic?.presente).toBe(false);
    const texto = formatearGoogleIntegrationsEnv(filas);
    expect(texto).toContain("GMAIL_PUBSUB_TOPIC: ausente");
    expect(texto).toContain("GOOGLE_INTEGRATIONS_CLIENT_ID: presente");
    expect(texto).not.toContain("valor-");
    expect(JSON.stringify(filas)).not.toContain("valor-");
  });

  it("todasPresentes es true solo con el set completo", () => {
    expect(todasPresentes(revisarGoogleIntegrationsEnv(COMPLETAS))).toBe(true);
    expect(todasPresentes(revisarGoogleIntegrationsEnv({}))).toBe(false);
  });
});
