// BIEN-S2: render de checklist ON8 en el diálogo del panel (sin IO).

export interface PasoChecklistDialogo {
  id: string;
  titulo: string;
  contador: string | null;
  listo: boolean;
}

export function progreso_checklist(listos: number, total: number): string {
  const t = Math.max(0, total);
  const l = Math.min(Math.max(0, listos), t);
  return `${l} de ${t} listos`;
}

export function estado_paso_dialogo(paso: PasoChecklistDialogo, saltado: boolean): string {
  if (saltado) return "No aplica";
  if (paso.listo) return "Listo";
  return paso.contador ?? "Pendiente";
}

export function paso_es_empleado(id: string): boolean {
  return id === "empleado";
}
