// BIEN-S2: render de checklist ON8 en el diálogo del panel (sin IO).

export interface PasoChecklistDialogo {
  id: string;
  titulo: string;
  contador: string | null;
  listo: boolean;
  noAplica?: boolean | undefined;
}

export function progreso_checklist(listos: number, total: number): string {
  const t = Math.max(0, total);
  const l = Math.min(Math.max(0, listos), t);
  return `${l} de ${t} listos`;
}

export function estado_paso_dialogo(paso: PasoChecklistDialogo, saltado: boolean): string {
  if (saltado || paso.noAplica === true) return "No aplica";
  if (paso.listo) return "Listo";
  return paso.contador ?? "Pendiente";
}

export function paso_es_empleado(id: string): boolean {
  return id === "empleado";
}

// TB-165 [tenant]: el «no aplica» vive en el servidor; el diálogo lo hidrata
// en su Set local desde la carga inicial y desde la respuesta de saltar.
export function hidratarNoAplica(
  pasos: readonly unknown[],
  saltados: Set<string>,
): Set<string> {
  for (const paso of pasos) {
    if (typeof paso !== "object" || paso === null) continue;
    const { id, noAplica } = paso as { id?: unknown; noAplica?: unknown };
    if (noAplica === true && typeof id === "string") saltados.add(id);
  }
  return saltados;
}
