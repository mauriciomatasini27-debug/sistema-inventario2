import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { crear_kms_fake } from "../src/modules/fiscal/kms.js";
import {
  descifrarRefreshTokenGmail,
  guardarConexionGmail,
  leerConexionGmail,
  marcarConexionGmail,
} from "../src/lib/repos/google-conexiones.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("repositorio de conexiones Google", () => {
  let sql: ReturnType<typeof postgres> | null = null;
  let tenantId = "";
  const kms = crear_kms_fake("integ-1");

  beforeAll(async () => {
    const url = await asegurarBasePrivada("google_conexiones_repo", URL_A!);
    process.env.TENANT_DATABASE_URL = url;
    delete process.env.TENANT_MODE;
    sql = postgres(url, { max: 1 });
    const [tenant] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, plan)
      values ('Repo Google', ${`repo-google-${randomUUID().slice(0, 8)}`}, 'demo')
      returning id
    `;
    if (!tenant) throw new Error("no se creó el tenant de prueba");
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.TENANT_DATABASE_URL;
  });

  it("guarda el token cifrado, reconecta y revoca sin dejar el plano", async () => {
    const c1 = await guardarConexionGmail({
      tenantId,
      cuentaEmail: "dueno@ejemplo.com",
      scopes: ["openid", "email", "gmail.readonly"],
      refreshToken: "refresh-1",
      consentimientoVersion: "v1",
      consentidoPor: "google-sub-test",
      kms,
    });
    expect(await descifrarRefreshTokenGmail(tenantId, kms)).toBe("refresh-1");

    const c2 = await guardarConexionGmail({
      tenantId,
      cuentaEmail: "dueno@ejemplo.com",
      scopes: ["openid", "email", "gmail.readonly"],
      refreshToken: "refresh-2",
      consentimientoVersion: "v2",
      consentidoPor: "google-sub-test",
      kms,
    });
    expect(c2.id).toBe(c1.id);
    expect(await descifrarRefreshTokenGmail(tenantId, kms)).toBe("refresh-2");

    const cliente = sql;
    if (!cliente) throw new Error("sin cliente de prueba");
    const [fila] = await cliente<{ refresh_token_cifrado: string | null }[]>`
      select refresh_token_cifrado
      from google_connections
      where tenant_id = ${tenantId}
    `;
    expect(fila?.refresh_token_cifrado).toBeTruthy();
    expect(fila?.refresh_token_cifrado).not.toBe("refresh-2");

    await marcarConexionGmail({
      tenantId,
      estado: "revocada",
      evento: "desconectada",
      motivo: "prueba",
    });
    expect(await descifrarRefreshTokenGmail(tenantId, kms)).toBeNull();
    expect((await leerConexionGmail(tenantId))?.estado).toBe("revocada");

    const eventos = await cliente<{ evento: string }[]>`
      select evento
      from gmail_connection_events
      where tenant_id = ${tenantId}
      order by created_at
    `;
    expect(eventos.map((e) => e.evento)).toEqual([
      "conectada",
      "conectada",
      "desconectada",
    ]);
  });

  it("rechaza cambiar de casilla sin un refresh token nuevo", async () => {
    await expect(
      guardarConexionGmail({
        tenantId,
        cuentaEmail: "otra@ejemplo.com",
        scopes: ["openid", "email"],
        refreshToken: null,
        consentimientoVersion: "v3",
        consentidoPor: "google-sub-test",
        kms,
      }),
    ).rejects.toThrow(/refresh token/);
  });
});
