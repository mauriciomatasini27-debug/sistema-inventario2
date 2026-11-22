export type AccionCodigo = "agregar" | "ingreso" | "conteo" | "lotes";

export function accionesDisponibles(puedeCrearProductos: boolean): readonly AccionCodigo[] {
  return puedeCrearProductos ? ["agregar", "ingreso", "conteo", "lotes"] : ["ingreso", "conteo", "lotes"];
}

export function clavesIdempotencia(entropia: string): { alta: string; ingreso: string; conteo: string } {
  return {
    alta: `panel-alta:${entropia}`,
    ingreso: `panel-ingreso:${entropia}`,
    conteo: `panel-conteo:${entropia}`,
  };
}

export interface IngresoPanelInput {
  readonly sku: string;
  readonly cantidad: number;
  readonly costoCentavos: number;
  readonly venceEl?: string | undefined;
  readonly entropia?: string | undefined;
}

export function armarIngreso(input: IngresoPanelInput): {
  body: {
    sku: string;
    cantidad: number;
    costo_centavos: number;
    controla_vencimiento: boolean;
    vence_el: string | null;
  };
  idempotencyKey: string;
} {
  const vence = input.venceEl?.trim() ?? "";
  return {
    body: {
      sku: input.sku.trim(),
      cantidad: input.cantidad,
      costo_centavos: input.costoCentavos,
      controla_vencimiento: vence !== "",
      vence_el: vence === "" ? null : new Date(vence).toISOString(),
    },
    idempotencyKey: clavesIdempotencia(input.entropia ?? "").ingreso,
  };
}

export interface ConteoPanelInput {
  readonly sku: string;
  readonly fisico: number;
  readonly contadoPor: string;
  readonly rol: "dueno" | "empleado";
  readonly motivo?: string | undefined;
  readonly entropia?: string | undefined;
}

export function armarConteo(input: ConteoPanelInput): {
  crear: { body: { contado_por: string; lineas: ReadonlyArray<{ sku: string; fisico: number }> } };
  confirmar: { body: { rol: "dueno" | "empleado"; confirmado_por: string; motivo?: string } };
  idempotencyKey: string;
} {
  return {
    crear: {
      body: {
        contado_por: input.contadoPor,
        lineas: [{ sku: input.sku.trim(), fisico: input.fisico }],
      },
    },
    confirmar: {
      body: {
        rol: input.rol,
        confirmado_por: input.contadoPor,
        ...(input.rol === "dueno" && input.motivo ? { motivo: input.motivo } : {}),
      },
    },
    idempotencyKey: clavesIdempotencia(input.entropia ?? "").conteo,
  };
}
