// Seed + sync de la allowlist de dominios oficiales (OP6.2/OP8/7.3).
// Núcleo puro: la fuente de verdad es OFFICIAL_PAYMENT_DOMAINS en
// beneficiarios.ts. El adaptador (migración/job) inserta y desactiva;
// nunca borra ni deja al Dueño agregar dominios libres.

import { OFFICIAL_PAYMENT_DOMAINS } from "./beneficiarios.js";

export interface SemillaDominio {
  readonly dominio: string;
  readonly tipo: string;
  readonly entidad: string;
  readonly urlPagoBase: string;
  readonly activo: boolean;
  readonly verificadoPor: string;
}

const DETALLE: Record<string, { tipo: string; entidad: string; urlPagoBase: string }> = {
  "mercadopago.com.ar": {
    tipo: "billetera",
    entidad: "Mercado Pago",
    urlPagoBase: "https://www.mercadopago.com.ar",
  },
  "mercadopago.com": {
    tipo: "billetera",
    entidad: "Mercado Pago",
    urlPagoBase: "https://www.mercadopago.com",
  },
  "arca.gob.ar": { tipo: "fiscal", entidad: "ARCA", urlPagoBase: "https://www.arca.gob.ar" },
  "afip.gob.ar": { tipo: "fiscal", entidad: "ARCA", urlPagoBase: "https://www.afip.gob.ar" },
};

// Por qué orden fijo y no Set: el seed de migración debe ser determinista
// para que el diff código↔DB sea estable entre deploys.
export function semilla_dominios(): SemillaDominio[] {
  return OFFICIAL_PAYMENT_DOMAINS.map((dominio) => {
    const d = DETALLE[dominio] ?? { tipo: "otro", entidad: dominio, urlPagoBase: `https://${dominio}` };
    return Object.freeze({
      dominio,
      tipo: d.tipo,
      entidad: d.entidad,
      urlPagoBase: d.urlPagoBase,
      activo: true,
      verificadoPor: "plataforma",
    });
  });
}

export interface DominioExistente {
  readonly dominio: string;
  readonly activo: boolean;
}

export interface PlanSync {
  readonly aInsertar: SemillaDominio[];
  readonly aDesactivar: string[];
  readonly sinCambios: boolean;
}

// Sync unidireccional código→DB: inserta los que faltan, desactiva (sin
// borrar) los que sobran. La verificación manual vive en verificadoPor.
export function plan_sincronizar_dominios(existentes: ReadonlyArray<DominioExistente>): PlanSync {
  const semilla = semilla_dominios();
  const vistos = new Set(existentes.map((e) => e.dominio));
  const aInsertar = semilla.filter((s) => !vistos.has(s.dominio));
  const esperados = new Set(semilla.map((s) => s.dominio));
  const aDesactivar = existentes
    .filter((e) => e.activo && !esperados.has(e.dominio))
    .map((e) => e.dominio);
  return { aInsertar, aDesactivar, sinCambios: aInsertar.length === 0 && aDesactivar.length === 0 };
}
