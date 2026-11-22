// P10-93 [tenant]: una base sin la columna por_peso se lee como producto por unidad en vez de romper.
export function esColumnaPorPesoFaltante(e: unknown): boolean {
  if (typeof (e as { code?: unknown }).code === "string" && (e as { code: string }).code === "42703") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("por_peso");
}
