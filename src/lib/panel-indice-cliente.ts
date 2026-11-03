// P1-46: el hub y el shell leen el mismo índice. Sin un array de módulos, el DOM no cambia.

export function aplicarFiltroIndice(crudo: unknown, raiz: ParentNode): boolean {
  if (typeof crudo !== "object" || crudo === null) return false;
  const modulos = (crudo as { modulos?: unknown }).modulos;
  if (!Array.isArray(modulos)) return false;
  const ids = new Set<string>();
  for (const modulo of modulos) {
    if (typeof modulo !== "object" || modulo === null) continue;
    const id = (modulo as { id?: unknown }).id;
    if (typeof id === "string") ids.add(id);
  }
  for (const el of raiz.querySelectorAll<HTMLElement>("[data-modulo-indice]")) {
    const id = el.dataset["moduloIndice"];
    if (id) el.hidden = !ids.has(id);
  }
  return true;
}
