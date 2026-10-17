import { describe, expect, it } from "vitest";
import { registrarEnvioCloud, ultimoEnvioCloud } from "../src/lib/whatsapp-salud.js";
import { formatearUltimaConsulta } from "../src/lib/bot-card-panel.js";

describe("DASH-S3 salud de envío Cloud API en memoria", () => {
  it("sin envíos previos no hay último envío", () => {
    const antes = ultimoEnvioCloud();
    expect(antes === null || typeof antes.ok === "boolean").toBe(true);
  });

  it("registrar el envío deja ok y el instante; el fallo lo pisa", () => {
    registrarEnvioCloud(true, 1000);
    expect(ultimoEnvioCloud()).toEqual({ ok: true, enMs: 1000 });
    registrarEnvioCloud(false, 2000);
    expect(ultimoEnvioCloud()).toEqual({ ok: false, enMs: 2000 });
  });
});

describe("DASH-S3 formato de la tarjeta", () => {
  it("sin consultas lo dice en palabras", () => {
    expect(formatearUltimaConsulta(null)).toBe("Todavía no hubo consultas");
  });

  it("con consulta usa la hora argentina HH:MM", () => {
    expect(formatearUltimaConsulta(Date.parse("2026-10-17T12:34:00Z"))).toBe("09:34");
  });
});
