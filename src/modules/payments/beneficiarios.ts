// LANE G — Órdenes de Pago OP1-OP13 (Nivel 2, Compras y gastos).
//
// Núcleo puro: sin IO, sin Drizzle, sin rutas. NO importa ni modifica
// cash/caja, purchases (no existe aún: el vínculo a factura es
// supplier_invoice_id opaco), schema.ts ni ningún otro módulo.
//
// OP1 (inviolable, transversal): el sistema NUNCA guarda ni pide
// credenciales de Mercado Pago / homebanking / ARCA. contiene_secreto es el
// detector SEC-3: todo texto libre que lo dispare se rechaza con 422 y NUNCA
// se persiste ni se reenvía (el error es genérico, sin eco del contenido).
//
// OP6: payees con datos PÚBLICOS (alias/CBU/CUIT/link oficial) +
// anti-duplicados por clave normalizada. En listados se usa la vista
// enmascarada (OP6.5); el CBU completo solo viaja en la orden enviada.
// OP8.5/7.3: el link de pago solo vale si su dominio está en la allowlist
// cerrada OFFICIAL_PAYMENT_DOMAINS (https, sin credenciales embebidas,
// host exacto o subdominio con borde de punto).

import type { Medio } from "../../lib/validation.js";

export type PayeeTipo = "proveedor" | "propietario" | "servicio" | "impuesto" | "otro";

const TIPOS_PAYEE: ReadonlyArray<PayeeTipo> = ["proveedor", "propietario", "servicio", "impuesto", "otro"];

// OP2.11/OP9.10: los mismos 5 medios de caja.ts. Este módulo no crea medios.
export const MEDIOS_PAGO: ReadonlyArray<Medio> = ["Efectivo", "Debito", "Mercado Pago", "QR", "Transferencia"];

export function es_medio(m: string): m is Medio {
  return (MEDIOS_PAGO as ReadonlyArray<string>).includes(m);
}

export interface Payee {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: PayeeTipo;
  readonly medioPreferido: Medio;
  readonly alias?: string | undefined;
  readonly cbu?: string | undefined;
  readonly cuit?: string | undefined;
  readonly linkPagoUrl?: string | undefined;
  readonly activo: boolean;
}

// CBU 22 dígitos con verificadores BCRA: bloque banco+sucursal (7 dígitos +
// verificador con pesos 7-1-3-9-7-1-3) y bloque cuenta (13 dígitos +
// verificador con pesos 3-9-7-1-3-9-7-1-3-9-7-1-3). Algoritmo público,
// sin consulta externa (OP6.1 sin dependencia de red).
export function validar_cbu(cbu: string): boolean {
  if (!/^\d{22}$/.test(cbu)) return false;
  const d = cbu.split("").map(Number);
  const p1 = [7, 1, 3, 9, 7, 1, 3];
  let s1 = 0;
  for (let i = 0; i < 7; i++) s1 += (d[i] ?? 0) * (p1[i] ?? 0);
  if ((10 - (s1 % 10)) % 10 !== d[7]) return false;
  const p2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  let s2 = 0;
  for (let i = 0; i < 13; i++) s2 += (d[8 + i] ?? 0) * (p2[i] ?? 0);
  return (10 - (s2 % 10)) % 10 === d[21];
}

// CUIT 11 dígitos con verificador módulo 11 (pesos 5-4-3-2-7-6-5-4-3-2).
// Acepta con o sin guiones.
export function validar_cuit(cuit: string): boolean {
  const solo = cuit.replace(/[- ]/g, "");
  if (!/^\d{11}$/.test(solo)) return false;
  const d = solo.split("").map(Number);
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 10; i++) s += (d[i] ?? 0) * (pesos[i] ?? 0);
  const r = s % 11;
  const v = r === 0 ? 0 : r === 1 ? 9 : 11 - r;
  return v === d[10];
}

// Alias CBU: 6 a 20 caracteres alfanuméricos más punto y guion.
export function validar_alias(alias: string): boolean {
  return /^[A-Za-z0-9.-]{6,20}$/.test(alias);
}

// SEC-3/OP1.3: detector de posibles credenciales en texto libre. Conservador
// a propósito: ante la duda se rechaza (422) y se avisa al usuario, nunca se
// guarda. El corpus de casos vive en tests/pagos.test.ts.
const PATRONES_SECRETO: ReadonlyArray<RegExp> = [
  /\b(clave|claves|contrase[ñn]a|password|passwd|pin|token|clave fiscal|homebanking|home banking|cvv|cvc|coordenadas|tarjeta)\b/i,
  /\b\d{16}\b/,
];

export function contiene_secreto(texto: string): boolean {
  return PATRONES_SECRETO.some((p) => p.test(texto));
}

// Allowlist cerrada de dominios oficiales de pago (OP8/7.3, base de control
// official_payment_domains en schema-pagos.ts). La mantiene la plataforma con
// verificación manual; el Dueño NO puede agregar dominios libres (OP6.2).
// Solo dominios conocidos; nada de acortadores ni dominios parecidos.
export const OFFICIAL_PAYMENT_DOMAINS: ReadonlyArray<string> = [
  "mercadopago.com.ar",
  "mercadopago.com",
  "arca.gob.ar",
  "afip.gob.ar",
];

// https obligatorio, sin credenciales embebidas, host exacto o subdominio
// (borde de punto: evil-mercadopago.com.ar NO pasa). URL.hostname ya
// normaliza IDN/punycode y minúsculas, lo que frena dominios parecidos.
export function dominio_permitido(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username !== "" || u.password !== "") return false;
  const host = u.hostname.toLowerCase();
  if (host === "") return false;
  return OFFICIAL_PAYMENT_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

export type FalloPayee =
  | { readonly ok: false; readonly codigo: "DUPLICADO"; readonly status: 409; readonly error: string }
  | {
      readonly ok: false;
      readonly codigo: "DATO_INVALIDO" | "CREDENCIAL_DETECTADA" | "LINK_NO_OFICIAL";
      readonly status: 422;
      readonly error: string;
    };

export type CrearPayeeResult = { readonly ok: true; readonly payee: Payee } | FalloPayee;

export interface CrearPayeeInput {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: PayeeTipo;
  readonly medioPreferido: Medio;
  readonly alias?: string | undefined;
  readonly cbu?: string | undefined;
  readonly cuit?: string | undefined;
  readonly linkPagoUrl?: string | undefined;
  readonly existentes: ReadonlyArray<Payee>;
}

function claveDe(p: Pick<Payee, "alias" | "cbu" | "cuit">): ReadonlyArray<string> {
  const claves: string[] = [];
  if (p.alias !== undefined) claves.push(`alias:${p.alias.toLowerCase()}`);
  if (p.cbu !== undefined) claves.push(`cbu:${p.cbu}`);
  const cuitSolo = p.cuit?.replace(/[- ]/g, "");
  if (cuitSolo !== undefined && cuitSolo !== "") claves.push(`cuit:${cuitSolo}`);
  return claves;
}

// OP6: alta validada + anti-duplicados (misma alias/CBU/CUIT en otro payee
// activo => 409). Solo datos públicos; cualquier secreto => 422.
export function crear_payee(input: CrearPayeeInput): CrearPayeeResult {
  const nombre = input.nombre.trim();
  if (input.id === "" || nombre === "" || nombre.length > 80) {
    return { ok: false, codigo: "DATO_INVALIDO", status: 422, error: "nombre de beneficiario inválido" };
  }
  if (!TIPOS_PAYEE.includes(input.tipo)) {
    return { ok: false, codigo: "DATO_INVALIDO", status: 422, error: `tipo ${input.tipo} fuera de lista` };
  }
  if (!es_medio(input.medioPreferido)) {
    return { ok: false, codigo: "DATO_INVALIDO", status: 422, error: "medio preferido inválido" };
  }
  if (contiene_secreto(nombre)) {
    return {
      ok: false,
      codigo: "CREDENCIAL_DETECTADA",
      status: 422,
      error: "el texto parece contener una credencial; el sistema nunca pide ni guarda claves",
    };
  }
  if (input.alias !== undefined && !validar_alias(input.alias)) {
    return { ok: false, codigo: "DATO_INVALIDO", status: 422, error: "alias inválido" };
  }
  if (input.cbu !== undefined && !validar_cbu(input.cbu)) {
    return { ok: false, codigo: "DATO_INVALIDO", status: 422, error: "CBU inválido" };
  }
  if (input.cuit !== undefined && !validar_cuit(input.cuit)) {
    return { ok: false, codigo: "DATO_INVALIDO", status: 422, error: "CUIT inválido" };
  }
  if (input.linkPagoUrl !== undefined && !dominio_permitido(input.linkPagoUrl)) {
    return { ok: false, codigo: "LINK_NO_OFICIAL", status: 422, error: "el link no es de un dominio oficial conocido" };
  }
  const claves = new Set(claveDe(input));
  for (const e of input.existentes) {
    if (!e.activo || e.id === input.id) continue;
    for (const k of claveDe(e)) {
      if (claves.has(k)) {
        return { ok: false, codigo: "DUPLICADO", status: 409, error: `beneficiario duplicado (${k.split(":")[0] ?? "dato"} ya registrado)` };
      }
    }
  }
  return {
    ok: true,
    payee: {
      id: input.id,
      nombre,
      tipo: input.tipo,
      medioPreferido: input.medioPreferido,
      ...(input.alias !== undefined ? { alias: input.alias } : {}),
      ...(input.cbu !== undefined ? { cbu: input.cbu } : {}),
      ...(input.cuit !== undefined ? { cuit: input.cuit } : {}),
      ...(input.linkPagoUrl !== undefined ? { linkPagoUrl: input.linkPagoUrl } : {}),
      activo: true,
    },
  };
}

export interface PayeeEnmascarado {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: PayeeTipo;
  readonly medioPreferido: Medio;
  readonly alias?: string | undefined;
  readonly cbuEnmascarado?: string | undefined;
  readonly cuitEnmascarado?: string | undefined;
}

// OP6.5: en listados el CBU viaja enmascarado (…últimos 4); el completo solo
// aparece en la orden enviada al comerciante y en la ficha (Dueño).
export function enmascarar_payee(p: Payee): PayeeEnmascarado {
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    medioPreferido: p.medioPreferido,
    ...(p.alias !== undefined ? { alias: p.alias } : {}),
    ...(p.cbu !== undefined ? { cbuEnmascarado: `…${p.cbu.slice(-4)}` } : {}),
    ...(p.cuit !== undefined ? { cuitEnmascarado: `…${p.cuit.replace(/[- ]/g, "").slice(-3)}` } : {}),
  };
}
