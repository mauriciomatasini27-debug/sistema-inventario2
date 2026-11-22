// WA-BOTONES-1 [plataforma]: la alerta de stock bajo manda tres botones cuyos ids no reconocía ningún parser y el toque caía en "boton_ignorado".
// WA-BOTONES-1 [plataforma]: fuera de la ventana de 24 h el mensaje sale como plantilla y Meta devuelve el quick reply sin payload, así que el id no viaja y hay que reconocer la etiqueta.
// WA-BOTONES-1 [plataforma]: núcleo puro, sin IO ni env.

export const ACCIONES_ALERTA = ["ver_pedir", "guardar_viernes", "pausar_avisos"] as const;
export type AccionAlerta = (typeof ACCIONES_ALERTA)[number];

// WA-BOTONES-1 [plataforma]: etiquetas que puede devolver Meta, tomadas de alertas.ts y aviso-matutino.ts.
const ETIQUETAS: ReadonlyArray<readonly [AccionAlerta, ReadonlyArray<string>]> = [
  ["ver_pedir", ["Ver y pedir"]],
  ["guardar_viernes", ["Guardar p/ viernes", "Guardar viernes"]],
  ["pausar_avisos", ["Pausar avisos"]],
];

// WA-BOTONES-1 [plataforma]: Meta devuelve la etiqueta aprobada, así que se compara sin acentos y en minúsculas para que un cambio de mayúsculas no lo rompa.
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function es_accion(v: string): v is AccionAlerta {
  return (ACCIONES_ALERTA as ReadonlyArray<string>).includes(v);
}

export function parsear_boton_alerta(entrada: string | null | undefined): AccionAlerta | null {
  const v = (entrada ?? "").trim();
  if (!v) return null;
  const id = v.toLowerCase();
  if (es_accion(id)) return id;
  const n = normalizar(v);
  for (const [accion, etiquetas] of ETIQUETAS) {
    if (etiquetas.some((e) => normalizar(e) === n)) return accion;
  }
  return null;
}

// WA-BOTONES-1 [plataforma]: cada botón ya tiene su comando de texto probado en el router; se traduce a ese texto en vez de duplicar la lógica.
const TEXTO_DE_ACCION: Record<AccionAlerta, string> = {
  ver_pedir: "que me falta",
  guardar_viernes: "guardalo para el viernes",
  pausar_avisos: "pausar avisos",
};

export function texto_de_boton_alerta(accion: AccionAlerta | null): string {
  return accion === null ? "" : TEXTO_DE_ACCION[accion];
}
