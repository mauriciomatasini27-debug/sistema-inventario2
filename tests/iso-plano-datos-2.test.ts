import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { conTenant } from "../src/lib/tenant-mode.js";
import { esRutaDatos } from "../src/lib/tenant-context.js";
import { resetStore, store, type StoredFiscalDoc } from "../src/lib/store.js";
import { asegurarFiscalDoc } from "../src/lib/fiscal-db.js";
import { POST as POSTWizard, GET as GETWizard } from "../src/pages/api/fiscal/wizard.js";
import { POST as POSTDelegacion } from "../src/pages/api/fiscal/delegacion-confirmada.js";
import { planBackfill } from "../scripts/backfill-tenant-id-lib.mjs";

const TA = "tenant-a";
const TB = "tenant-b";
const E5 = "No tenés permiso para ver este comercio.";
const DOC_ESPERADO = "UPDATE fiscal_documents SET tenant_id = 'slice0' WHERE tenant_id IS NULL";

function postWizard(body: unknown): Promise<Response> {
  return POSTWizard(
    ctx("http://x/api/fiscal/wizard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body as Record<string, unknown>,
    }),
  ) as Promise<Response>;
}

function postDelegacion(body: unknown): Promise<Response> {
  return POSTDelegacion(
    ctx("http://x/api/fiscal/delegacion-confirmada", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body as Record<string, unknown>,
    }),
  ) as Promise<Response>;
}

function getWizard(query: string): Promise<Response> {
  return GETWizard(ctx(`http://x/api/fiscal/wizard${query}`)) as Promise<Response>;
}

function docHuerfano(key: string): StoredFiscalDoc {
  return {
    id: crypto.randomUUID(),
    idempotency_key: key,
    sale_id: crypto.randomUUID(),
    cbte_tipo: "11",
    pto_vta: "3",
    cbte_nro: null,
    cbte_fch: "20261013",
    doc_tipo: "99",
    doc_nro: "0",
    cond_iva_receptor: "5",
    estado: "pendiente",
    cae: null,
    cae_vto: null,
    qr_payload: null,
  };
}

function rutasApi(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...rutasApi(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function rutaParaArchivo(file: string): string {
  let rel = file.replace(/^src\/pages\/api/, "");
  rel = rel.slice(0, -3);
  if (rel.endsWith("/index")) rel = rel.slice(0, -"/index".length);
  return `/api${rel}`;
}

beforeEach(() => {
  resetStore();
  process.env.TENANT_MODE = "multi";
});

afterEach(() => {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env[`TENANT_DATABASE_URL_${TA}`];
  delete process.env[`TENANT_DATABASE_URL_${TB}`];
});

describe("ISO-S7 wizard y delegacion usan el tenant del contexto en multi", () => {
  it("POST wizard con tenant_id ajeno responde 403 E5", async () => {
    const r = await conTenant(TA, () => postWizard({ tenant_id: TB, accion: "avanzar", paso: 1 }));
    expect(r.status).toBe(403);
    const j = (await r.json()) as { error: string };
    expect(j.error).toContain(E5);
  });

  it("POST wizard sin tenant_id usa el contexto y guarda con esa clave", async () => {
    const r = await conTenant(TA, () => postWizard({ accion: "avanzar", paso: 1 }));
    expect(r.status).toBe(200);
    expect(conTenant(TA, () => store.fiscalWizard.has(TA))).toBe(true);
    expect(conTenant(TB, () => store.fiscalWizard.has(TB))).toBe(false);
  });

  it("POST delegacion-confirmada con tenant_id ajeno responde 403 E5", async () => {
    const r = await conTenant(TA, () => postDelegacion({ tenant_id: TB, cuit: "20123456789" }));
    expect(r.status).toBe(403);
    const j = (await r.json()) as { error: string };
    expect(j.error).toContain(E5);
  });

  it("POST delegacion-confirmada sin tenant_id usa el contexto", async () => {
    const r = await conTenant(TA, () => postDelegacion({ cuit: "20123456789" }));
    expect(r.status).toBe(201);
    expect(conTenant(TA, () => store.fiscalWizard.has(TA))).toBe(true);
  });

  it("GET wizard con tenant_id ajeno responde 403 E5", async () => {
    const r = await conTenant(TA, () => getWizard(`?tenant_id=${TB}`));
    expect(r.status).toBe(403);
    const j = (await r.json()) as { error: string };
    expect(j.error).toContain(E5);
  });

  it("GET wizard sin tenant_id usa el contexto", async () => {
    await conTenant(TA, () => postWizard({ accion: "avanzar", paso: 2 }));
    const r = await conTenant(TA, () => getWizard(""));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { paso: number };
    expect(j.paso).toBe(2);
  });
});

describe("ISO-S7 regresion modo single", () => {
  it("sin TENANT_MODE el body sin tenant_id usa el tenant por defecto", async () => {
    delete process.env.TENANT_MODE;
    const r = await postWizard({ accion: "avanzar", paso: 1 });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { paso: number }).paso).toBe(1);

    const g = await getWizard("");
    expect(g.status).toBe(200);
    expect(((await g.json()) as { paso: number }).paso).toBe(1);
  });

  it("sin TENANT_MODE un tenant_id explícito sigue mandando", async () => {
    delete process.env.TENANT_MODE;
    const r = await postWizard({ tenant_id: "otro", accion: "avanzar", paso: 2 });
    expect(r.status).toBe(200);

    const g = await getWizard("?tenant_id=otro");
    expect(g.status).toBe(200);
    expect(((await g.json()) as { paso: number }).paso).toBe(2);
  });
});

describe("ISO-S8 doc huerfano en multi se rechaza sin tocar memoria", () => {
  it("asegurarFiscalDoc sin tenant ni contexto rechaza y no escribe", async () => {
    const antes = conTenant(TA, () => store.fiscalDocs.size);
    await expect(asegurarFiscalDoc(docHuerfano("huerfano-1"))).rejects.toThrow(/tenant/i);
    expect(conTenant(TA, () => store.fiscalDocs.size)).toBe(antes);
  });
});

describe("ISO-S9 plan de backfill en seco por defecto", () => {
  it("un comercio devuelve una sentencia por tabla sin ejecutar", () => {
    const r = planBackfill({ apply: false, tenantId: "slice0", comerciosEnBase: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperaba plan ok");
    expect(r.sentencias.map((s) => s.tabla)).toEqual(["fiscal_documents", "fiscal_settings"]);
    const [doc] = r.sentencias;
    if (!doc) throw new Error("esperaba sentencia de documents");
    expect(doc.sql).toBe(DOC_ESPERADO);
    expect(r.sql).toContain(DOC_ESPERADO);
    expect(r.sql).toContain("UPDATE fiscal_settings");
    expect(r.ejecutaria).toBe(false);
  });

  it("base compartida sin --shared se niega; con --shared planifica por tenant", () => {
    const negado = planBackfill({ apply: false, tenantId: "slice0", comerciosEnBase: 2 });
    expect(negado.ok).toBe(false);
    if (negado.ok) throw new Error("esperaba rechazo");
    expect(negado.error).toMatch(/shared|comercio|compartida/i);

    const ok = planBackfill({
      apply: false,
      tenantId: "tenant-legado",
      comerciosEnBase: 2,
      permitirShared: true,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) throw new Error("esperaba plan ok con --shared");
    expect(ok.sql).toContain("tenant-legado");
    expect(ok.ejecutaria).toBe(false);
  });

  it("CLI en seco sin base imprime las sentencias sin conectar ni imprimir env", () => {
    const src = readFileSync("scripts/backfill-tenant-id.mjs", "utf8");
    expect(src).toMatch(/--apply/);
    expect(src).toMatch(/backfill-tenant-id-lib/);
    for (const linea of src.split("\n")) {
      if (/console\.(log|error|warn)/.test(linea)) {
        expect(linea).not.toMatch(/process\.env/);
        expect(linea).not.toMatch(/TENANT_DATABASE_URL/);
        expect(linea).not.toMatch(/CONTROL_DATABASE_URL/);
      }
    }
    const env = { ...process.env };
    delete env.TENANT_DATABASE_URL;
    const salida = execFileSync("node", ["scripts/backfill-tenant-id.mjs"], { encoding: "utf8", env });
    expect(salida).toContain(DOC_ESPERADO);
    expect(salida).toContain("UPDATE fiscal_settings");
    expect(salida).not.toContain("secreto");
  });
});

describe("ISO arch-tests plano de datos", () => {
  // El webhook de WhatsApp es público y resuelve el comercio por teléfono:
  // no puede caer bajo un prefijo que exige tenant por request.
  const RUTAS_SIN_PREFIJO = new Set(["src/pages/api/whatsapp/webhook.ts"]);

  it("AT3: toda ruta que usa base del tenant cae bajo un prefijo de datos", () => {
    const fallos: string[] = [];
    for (const f of rutasApi("src/pages/api")) {
      const src = readFileSync(f, "utf8");
      if (/getTenantDb|dbViva|intentarLeer|intentarPersistir/.test(src)) {
        const ruta = rutaParaArchivo(f);
        if (!esRutaDatos(ruta) && !RUTAS_SIN_PREFIJO.has(f)) fallos.push(`${f} -> ${ruta}`);
      }
    }
    expect(fallos).toEqual([]);
  });

  it("AT4: solo src/lib/db.ts lee TENANT_DATABASE_URL", () => {
    // Lecturas reales, no menciones en comentarios ni mensajes de error.
    const LEE_URL = /process\.env(?:\.TENANT_DATABASE_URL|\[["']TENANT_DATABASE_URL["']\])|leerVarEntorno\(\s*["']TENANT_DATABASE_URL["']\s*\)/;
    // Excepciones con motivo: chequeo de presencia y fallback a base compartida.
    const PERMITIDOS = new Set([
      "src/pages/api/health.ts",
      "src/lib/repos/mp-webhooks.ts",
      "src/lib/repos/planes.ts",
    ]);
    const mal: string[] = [];
    const pila = ["src"];
    while (pila.length > 0) {
      const d = pila.pop() as string;
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) pila.push(p);
        else if (p.endsWith(".ts") && p !== "src/lib/db.ts" && !PERMITIDOS.has(p)) {
          if (LEE_URL.test(readFileSync(p, "utf8"))) mal.push(p);
        }
      }
    }
    expect(mal).toEqual([]);
  });
});
