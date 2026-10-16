// Plantillas por rubro ON4 sin UX. Ubicaciones vacías por defecto para que el
// dueño no arranque de cero. Versionadas en código: un cambio solo afecta altas nuevas.
export const VERSION_PLANTILLAS_RUBRO = "v1";

export const UMBRAL_SUGERIDO = 3;

export interface PlantillaRubro {
  ubicaciones: string[];
}

export const PLANTILLAS_RUBRO: Record<string, PlantillaRubro> = {
  kiosco: {
    ubicaciones: [
      "Mostrador",
      "Góndola 1",
      "Heladera 1",
      "Exhibidor de golosinas",
      "Estante detrás del mostrador",
      "Depósito",
    ],
  },
  almacen: {
    ubicaciones: ["Mostrador", "Góndola 1", "Góndola 2", "Heladera 1", "Freezer", "Depósito"],
  },
  despensa: {
    ubicaciones: ["Mostrador", "Estantería 1", "Estantería 2", "Heladera 1", "Depósito"],
  },
  libreria: {
    ubicaciones: ["Mostrador", "Estante 1", "Vitrina", "Exhibidor", "Depósito"],
  },
  otro: {
    ubicaciones: ["Mostrador", "Estante 1", "Depósito"],
  },
};

export function plantilla_rubro(rubro: string): PlantillaRubro {
  return PLANTILLAS_RUBRO[rubro] ?? PLANTILLAS_RUBRO["otro"]!;
}
