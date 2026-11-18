// STOCK-E5: el llamador distingue este fallo de un error de base genérico
// para no caer en su fallback en memoria y escribir el código a medias.
export class FalloBorradoCodigo extends Error {}

export type ResultadoCodigo = { ok: true } | { ok: false; codigo: "CODIGO_DUPLICADO" };

export interface PersistenciaCodigos {
  codigoViejo(sku: string): Promise<string | null>;
  dueno(codigo: string): Promise<string | null>;
  borrar(sku: string, codigo: string): Promise<void>;
  guardar(sku: string, codigo: string): Promise<void>;
}

export function normalizarCodigo(valor: string | undefined): string | null {
  return valor?.trim().toUpperCase() || null;
}

function esConflictoUnico(error: unknown): boolean {
  return typeof (error as { code?: unknown })?.code === "string" && (error as { code: string }).code === "23505";
}

export async function reemplazarCodigo(
  sku: string,
  valor: string | undefined,
  persistencia: PersistenciaCodigos,
): Promise<ResultadoCodigo> {
  const codigo = normalizarCodigo(valor);
  const viejo = await persistencia.codigoViejo(sku);
  if (viejo === codigo) return { ok: true };

  // Por qué antes del borrado: un 409 no debe dejar el producto sin código.
  if (codigo) {
    const dueno = await persistencia.dueno(codigo);
    if (dueno !== null && dueno !== sku) return { ok: false, codigo: "CODIGO_DUPLICADO" };
  }

  if (viejo) {
    try {
      await persistencia.borrar(sku, viejo);
    } catch (error) {
      // STOCK-E5: ADR-0082 — registrar y frenar, sin escribir el nuevo a medias.
      console.warn(`[codigo-producto] fallo al borrar el código ${viejo} de ${sku}`, error);
      throw new FalloBorradoCodigo(`no se pudo borrar el código ${viejo} de ${sku}: ${String(error)}`, { cause: error });
    }
  }
  if (codigo) {
    try {
      await persistencia.guardar(sku, codigo);
    } catch (error) {
      // STOCK-E5: el 23505 es la carrera que el chequeo previo no alcanza.
      if (esConflictoUnico(error)) return { ok: false, codigo: "CODIGO_DUPLICADO" };
      throw error;
    }
  }
  return { ok: true };
}
