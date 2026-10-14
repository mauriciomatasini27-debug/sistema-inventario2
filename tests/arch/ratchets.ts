export function ratchet(nombre: string, actual: number, baseline: number, detalle: string[] = []): number {
  if (actual > baseline) {
    const lista = detalle.length > 0 ? `\n${detalle.join("\n")}` : "";
    throw new Error(`${nombre}: subió de ${baseline} a ${actual} (+${actual - baseline}). Eliminá ocurrencias, no subas el baseline.${lista}`);
  }
  if (actual < baseline) {
    throw new Error(`${nombre}: bajó de ${baseline} a ${actual}: actualizá tests/arch/baselines.json a ${actual}`);
  }
  return actual;
}
