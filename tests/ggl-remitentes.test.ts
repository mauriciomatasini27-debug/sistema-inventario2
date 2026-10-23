import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  actualizarActivoRemitenteIngesta,
  leerFiltrosIngesta,
  listarRemitentesIngesta,
} from "../src/lib/repos/gmail-ingesta.js";
import { clasificar_capa1 } from "../src/modules/utilities/ingesta_gmail.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("GGL-REMITENTES pausar remitente", () => {
  let sql: ReturnType<typeof postgres> | null = null;
  let tenantId = "";
  let filtroId = "";

  beforeAll(async () => {
    const url = await asegurarBasePrivada("ggl_remitentes", URL_A!);
    process.env.TENANT_DATABASE_URL = url;
    delete process.env.TENANT_MODE;
    sql = postgres(url, { max: 1 });
    const [t] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, plan)
      values ('Remitentes', ${`rem-${randomUUID().slice(0, 8)}`}, 'demo')
      returning id
    `;
    if (!t) throw new Error("sin tenant");
    tenantId = t.id;
    const [f] = await sql<{ id: string }[]>`
      insert into email_ingestion_filters (remitente, servicio, keywords, activo)
      values ('edenor.com', 'Edenor', '[]'::jsonb, true)
      returning id
    `;
    if (!f) throw new Error("sin filtro");
    filtroId = f.id;
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.TENANT_DATABASE_URL;
  });

  it("lista remitentes para el panel", async () => {
    const lista = await listarRemitentesIngesta(tenantId);
    expect(lista.some((r) => r.id === filtroId && r.remitente === "edenor.com")).toBe(true);
  });

  it("pausar remitente aplica al siguiente mensaje en capa 1", async () => {
    const ok = await actualizarActivoRemitenteIngesta({
      tenantId,
      filtroId,
      activo: false,
    });
    expect(ok).toBe(true);
    const filtros = await leerFiltrosIngesta(tenantId);
    const pausado = filtros.find((f) => f.id === filtroId);
    expect(pausado?.activo).toBe(false);

    const clas = clasificar_capa1(
      { from: "factura@edenor.com", subject: "Su factura", cuerpo: "total" },
      filtros,
      [],
    );
    expect(clas.decision).toBe("ignorado");
    expect(clas.filtroId).toBeNull();
  });
});
