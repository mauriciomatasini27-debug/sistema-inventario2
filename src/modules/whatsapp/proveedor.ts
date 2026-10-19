// PRD-PROV-01 / ADR-0096: alta de proveedores por invitación. Núcleo puro, sin
// IO: el adaptador (ruta/webhook) genera el código, guarda el hash y compara.
// El comercio se resuelve SOLO por el código de invitación; nunca por el
// contenido del mensaje, porque el número central es compartido.

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
