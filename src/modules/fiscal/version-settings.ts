// FE-S3: CUIT, condición IVA y punto de venta son la identidad del emisor.
// Cada cambio guarda el valor anterior y el nuevo. La fila de fiscal_settings
// sigue siendo una por tenant (índice único, ADR-0074): esta cadena es el
// historial. No conoce comprobantes, así que no puede reescribirlos.

export const CONDICIONES_IVA_EMISOR = ["monotributo", "exento", "responsable_inscripto"] as const;
export type CondicionIvaEmisor = (typeof CONDICIONES_IVA_EMISOR)[number];

export const MODOS_FACTURACION = ["automatico", "manual", "desactivado"] as const;
export type ModoFacturacion = (typeof MODOS_FACTURACION)[number];

export type IdentidadFiscal = {
  readonly cuit: string;
  readonly condicion_iva: CondicionIvaEmisor;
  readonly pto_vta: string;
};

export type FichaFiscal = IdentidadFiscal & {
  readonly razon_social: string;
  readonly domicilio: string;
  readonly iibb?: string;
  readonly inicio_actividades: string;
  readonly modo: ModoFacturacion;
};

export type VersionFiscal = {
  readonly version: number;
  readonly vigente_desde: string;
  readonly ficha: FichaFiscal;
};

export type AuditoriaCambioFiscal = {
  readonly anterior: IdentidadFiscal | null;
  readonly nuevo: IdentidadFiscal;
  readonly version: number;
  readonly en: string;
};

export type EntradaAuditoriaFiscal = AuditoriaCambioFiscal & {
  readonly tenant_id: string;
  readonly actor: string;
};

export type CadenaFiscal = {
  readonly versiones: readonly VersionFiscal[];
  readonly auditoria: readonly EntradaAuditoriaFiscal[];
};

export type DecisionCambioFiscal =
  | { readonly tipo: "alta"; readonly version: VersionFiscal; readonly auditoria: AuditoriaCambioFiscal }
  | { readonly tipo: "cambio"; readonly version: VersionFiscal; readonly auditoria: AuditoriaCambioFiscal }
  | { readonly tipo: "ajuste"; readonly version: VersionFiscal }
  | { readonly tipo: "igual"; readonly version: VersionFiscal };

const cadenas = new Map<string, CadenaFiscal>();

export function esCondicionIvaEmisor(valor: string): valor is CondicionIvaEmisor {
  return (CONDICIONES_IVA_EMISOR as readonly string[]).includes(valor);
}

export function esModoFacturacion(valor: string): valor is ModoFacturacion {
  return (MODOS_FACTURACION as readonly string[]).includes(valor);
}

export function identidadDe(ficha: FichaFiscal): IdentidadFiscal {
  return { cuit: ficha.cuit, condicion_iva: ficha.condicion_iva, pto_vta: ficha.pto_vta };
}

export function decidirCambioFiscal(previa: VersionFiscal | null, propuesta: FichaFiscal, ahora: string): DecisionCambioFiscal {
  const ficha = copiarFicha(propuesta);
  if (!previa) {
    const version: VersionFiscal = { version: 1, vigente_desde: ahora, ficha };
    return {
      tipo: "alta",
      version,
      auditoria: { anterior: null, nuevo: identidadDe(ficha), version: 1, en: ahora },
    };
  }
  if (!mismaIdentidad(previa.ficha, ficha)) {
    const n = previa.version + 1;
    const version: VersionFiscal = { version: n, vigente_desde: ahora, ficha };
    return {
      tipo: "cambio",
      version,
      auditoria: { anterior: identidadDe(previa.ficha), nuevo: identidadDe(ficha), version: n, en: ahora },
    };
  }
  if (mismaFicha(previa.ficha, ficha)) return { tipo: "igual", version: previa };
  return {
    tipo: "ajuste",
    version: { version: previa.version, vigente_desde: previa.vigente_desde, ficha },
  };
}

export function aplicarCambioFiscal(
  cadena: CadenaFiscal,
  previaExterna: VersionFiscal | null,
  propuesta: FichaFiscal,
  ahora: string,
  meta: { readonly tenant_id: string; readonly actor: string },
): { readonly cadena: CadenaFiscal; readonly decision: DecisionCambioFiscal } {
  const previa = cadena.versiones.at(-1) ?? previaExterna;
  const decision = decidirCambioFiscal(previa, propuesta, ahora);
  const base = cadena.versiones.length > 0 ? cadena.versiones : previa ? [previa] : [];
  if (decision.tipo === "igual") {
    return { cadena: { versiones: base, auditoria: cadena.auditoria }, decision };
  }
  if (decision.tipo === "ajuste") {
    return {
      cadena: { versiones: [...base.slice(0, -1), decision.version], auditoria: cadena.auditoria },
      decision,
    };
  }
  const entrada: EntradaAuditoriaFiscal = {
    ...decision.auditoria,
    tenant_id: meta.tenant_id,
    actor: meta.actor,
  };
  return {
    cadena: {
      versiones: [...base, decision.version],
      auditoria: [...cadena.auditoria, entrada],
    },
    decision,
  };
}

export function leerCadenaFiscal(tenantId: string): CadenaFiscal {
  return cadenas.get(tenantId) ?? { versiones: [], auditoria: [] };
}

export function registrarCambioFiscal(
  tenantId: string,
  previaExterna: VersionFiscal | null,
  propuesta: FichaFiscal,
  ahora: string,
  actor: string,
): { readonly cadena: CadenaFiscal; readonly decision: DecisionCambioFiscal } {
  const resultado = aplicarCambioFiscal(leerCadenaFiscal(tenantId), previaExterna, propuesta, ahora, {
    tenant_id: tenantId,
    actor,
  });
  cadenas.set(tenantId, resultado.cadena);
  return resultado;
}

export function revertirCadenaFiscal(tenantId: string, anterior: CadenaFiscal): void {
  if (anterior.versiones.length === 0 && anterior.auditoria.length === 0) cadenas.delete(tenantId);
  else cadenas.set(tenantId, anterior);
}

export function vaciarVersionesFiscales(): void {
  cadenas.clear();
}

export function versionDesdeFila(
  fila: { cuit: string; condicionIva: string; puntoVenta: string; modo: string; createdAt: Date | string },
  ahora: string,
): VersionFiscal | null {
  if (!esCondicionIvaEmisor(fila.condicionIva)) return null;
  const modo = esModoFacturacion(fila.modo) ? fila.modo : "automatico";
  const creado = fila.createdAt instanceof Date ? fila.createdAt.toISOString() : new Date(fila.createdAt).toISOString();
  return {
    version: 1,
    vigente_desde: Number.isNaN(new Date(creado).getTime()) ? ahora : creado,
    ficha: {
      cuit: fila.cuit,
      condicion_iva: fila.condicionIva,
      pto_vta: fila.puntoVenta,
      modo,
      razon_social: "",
      domicilio: "",
      inicio_actividades: "",
    },
  };
}

function copiarFicha(ficha: FichaFiscal): FichaFiscal {
  return {
    cuit: ficha.cuit,
    condicion_iva: ficha.condicion_iva,
    pto_vta: ficha.pto_vta,
    razon_social: ficha.razon_social,
    domicilio: ficha.domicilio,
    inicio_actividades: ficha.inicio_actividades,
    modo: ficha.modo,
    ...(ficha.iibb !== undefined ? { iibb: ficha.iibb } : {}),
  };
}

function mismaIdentidad(a: IdentidadFiscal, b: IdentidadFiscal): boolean {
  return a.cuit === b.cuit && a.condicion_iva === b.condicion_iva && a.pto_vta === b.pto_vta;
}

function mismaFicha(a: FichaFiscal, b: FichaFiscal): boolean {
  return mismaIdentidad(a, b)
    && a.razon_social === b.razon_social
    && a.domicilio === b.domicilio
    && a.inicio_actividades === b.inicio_actividades
    && a.modo === b.modo
    && (a.iibb ?? "") === (b.iibb ?? "");
}
