// PRD-PROV-01 / ADR-0096: alta de proveedores por invitación. Núcleo puro, sin
// IO: el adaptador (ruta/webhook) genera el código, guarda el hash y compara.
// El comercio se resuelve SOLO por el código de invitación; nunca por el
// contenido del mensaje, porque el número central es compartido.

import { normalizarCuit } from "../purchases/proveedores.js";

export const INVITAR_TTL_MIN = 30 as const;
export const INVITAR_LEN = 6 as const;

export type EstadoContactoProveedor = "pendiente" | "verificado" | "revocado";

export interface ContactoProveedor {
  readonly numeroE164: string;
  readonly tenantId: string;
  readonly supplierCuit: string | null;
  readonly estado: EstadoContactoProveedor;
  readonly creadoEn: string;
}

export interface InvitacionProveedor {
  readonly tenantId: string;
  readonly supplierCuit: string | null;
  readonly codigoHash: string;
  readonly expiraEn: number;
  readonly usado: boolean;
}

export type VerificarInvitacion =
  | { readonly ok: true }
  | { readonly ok: false; readonly motivo: "formato" | "codigo_invalido" | "vencido" | "usado" };

export const RESPUESTA_PROV_RECIBIDO =
  "Listo, quedaste vinculado como proveedor. Mandame la foto o el PDF de la factura." as const;
export const RESPUESTA_PROV_PENDIENTE =
  "Tu solicitud quedó pendiente de aprobación del comercio. Te avisamos cuando esté habilitado." as const;
export const RESPUESTA_PROV_FACTURA = "Mandame la foto o el PDF de la factura." as const;
export const RESPUESTA_PROV_CODIGO_INVALIDO =
  "No pude validar el código de invitación. Pedí uno nuevo en el comercio e intentá otra vez." as const;

export function parsear_invitar(texto: string): string | null {
  const m = texto.trim().match(/^PROV\s+(\d{6})$/i);
  return m ? m[1]! : null;
}

// Orden: formato (no parsea) → codigo_invalido (falta o hash distinto) → usado
// → vencido. El hash lo calcula el adaptador (evita crypto en el núcleo).
export function verificar_invitacion(opts: {
  textoEntrante: string;
  codigoIngresadoHash: string;
  invitacion: InvitacionProveedor | null;
  ahoraMs: number;
}): VerificarInvitacion {
  if (parsear_invitar(opts.textoEntrante) === null) return { ok: false, motivo: "formato" };
  const inv = opts.invitacion;
  if (!inv || inv.codigoHash !== opts.codigoIngresadoHash) return { ok: false, motivo: "codigo_invalido" };
  if (inv.usado) return { ok: false, motivo: "usado" };
  if (opts.ahoraMs > inv.expiraEn) return { ok: false, motivo: "vencido" };
  return { ok: true };
}

export function puede_mandar(contacto: ContactoProveedor): boolean {
  return contacto.estado === "verificado";
}

export function contacto_por_numero(
  contactos: ReadonlyMap<string, ContactoProveedor>,
  numero: string,
): ContactoProveedor | null {
  return contactos.get(numero) ?? null;
}

// PRD-PROV-01 S6/S7 (ADR-0096): la identidad del proveedor sale del CUIT que
// lee el OCR de la factura, no del teléfono. El teléfono es el vínculo
// secundario: un CUIT ya cargado que entra por un número nuevo no lo duplica,
// el contacto queda atado a ese CUIT. El núcleo no decide altas ni mensajes
// (S10 queda fuera); solo resuelve si hay que escribir la identidad y si el
// CUIT ya está entre los proveedores del comercio.
export interface ProveedorResumen {
  readonly cuit: string;
  readonly nombre: string;
}

export type ResultadoVincularCuit =
  | {
      readonly cambio: false;
      readonly motivo: "sin_cuit" | "ya_igual" | "conflicto";
      readonly supplierCuit: string | null;
      readonly proveedorExiste: boolean;
      readonly proveedorNombre: string | null;
    }
  | {
      readonly cambio: true;
      readonly contacto: ContactoProveedor;
      readonly proveedorExiste: boolean;
      readonly proveedorNombre: string | null;
    };

export function vincular_cuit_contacto(opts: {
  contacto: ContactoProveedor;
  cuitLeido: string | null;
  proveedores: ReadonlyArray<ProveedorResumen>;
}): ResultadoVincularCuit {
  const cuit = normalizarCuit(opts.cuitLeido ?? "");
  const actual = opts.contacto.supplierCuit === null ? null : normalizarCuit(opts.contacto.supplierCuit);
  if (!/^\d{11}$/.test(cuit)) {
    return {
      cambio: false,
      motivo: "sin_cuit",
      supplierCuit: opts.contacto.supplierCuit,
      proveedorExiste: false,
      proveedorNombre: null,
    };
  }
  const match = opts.proveedores.find((p) => normalizarCuit(p.cuit) === cuit) ?? null;
  const proveedorExiste = match !== null;
  const proveedorNombre = match?.nombre ?? null;
  // La identidad previa no se pisa: si el contacto ya tenía un CUIT distinto,
  // el conflicto se reporta y el llamador decide (S10), no este núcleo.
  if (actual === cuit) {
    return {
      cambio: false,
      motivo: "ya_igual",
      supplierCuit: opts.contacto.supplierCuit,
      proveedorExiste,
      proveedorNombre,
    };
  }
  if (actual !== null) {
    return {
      cambio: false,
      motivo: "conflicto",
      supplierCuit: opts.contacto.supplierCuit,
      proveedorExiste,
      proveedorNombre,
    };
  }
  return {
    cambio: true,
    contacto: { ...opts.contacto, supplierCuit: cuit },
    proveedorExiste,
    proveedorNombre,
  };
}
