export function horasMatutinas(): readonly string[] {
  const out: string[] = [];
  for (let h = 6; h < 11; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`);
  }
  out.push("11:00");
  return Object.freeze(out);
}

export function horaVisible(actual: string, opciones: readonly string[]): readonly string[] {
  if (opciones.includes(actual)) return opciones;
  return Object.freeze([actual, ...opciones]);
}
