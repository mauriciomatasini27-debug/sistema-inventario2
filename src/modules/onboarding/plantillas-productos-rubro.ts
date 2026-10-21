// Plantilla de productos por rubro ON4/STOCK-E2: solo nombres, sin precios.
// Versionada en código: un cambio solo afecta siembras nuevas.
// v1 propuesta, revisar con Mauri.
export const VERSION_PLANTILLAS_PRODUCTOS_RUBRO = "v1";

export interface PlantillaProductosRubro {
  productos: string[];
}

export const PLANTILLAS_PRODUCTOS_RUBRO: Record<string, PlantillaProductosRubro> = {
  kiosco: {
    productos: [
      "Agua mineral 500 ml",
      "Gaseosa cola 500 ml",
      "Gaseosa lima-limón 500 ml",
      "Jugo en caja 200 ml",
      "Bebida energizante 473 ml",
      "Alfajor simple",
      "Alfajor triple",
      "Chocolate en barra",
      "Caramelos surtidos",
      "Chicles",
      "Galletitas dulces",
      "Galletitas saladas",
      "Papas fritas 80 g",
      "Cigarrillos (atado de 20)",
      "Encendedor",
      "Pañuelitos descartables",
      "Pilas AA",
    ],
  },
  almacen: {
    productos: [
      "Yerba mate 1 kg",
      "Azúcar 1 kg",
      "Harina 000 1 kg",
      "Arroz 1 kg",
      "Fideos secos 500 g",
      "Aceite de girasol 1,5 l",
      "Leche 1 l",
      "Huevos (docena)",
      "Pan lactal",
      "Puré de tomate 520 g",
      "Sal fina 500 g",
      "Café molido 250 g",
      "Té en saquitos (caja de 25)",
      "Galletitas de agua",
      "Lavandina 1 l",
      "Detergente 750 ml",
      "Papel higiénico (4 rollos)",
      "Jabón de tocador",
    ],
  },
  despensa: {
    productos: [
      "Yerba mate 1 kg",
      "Azúcar 1 kg",
      "Harina 000 1 kg",
      "Arroz 1 kg",
      "Fideos secos 500 g",
      "Polenta 500 g",
      "Lentejas 400 g",
      "Aceite de girasol 1,5 l",
      "Atún en lata",
      "Puré de tomate 520 g",
      "Mermelada 454 g",
      "Dulce de leche 400 g",
      "Leche 1 l",
      "Manteca 200 g",
      "Queso cremoso (kg)",
      "Fiambre (kg)",
      "Galletitas de agua",
    ],
  },
  libreria: {
    productos: [
      "Cuaderno tapa dura 48 hojas",
      "Cuaderno espiral A4",
      "Repuesto de hojas rayadas",
      "Lapicera azul",
      "Lapicera negra",
      "Lápiz negro HB",
      "Goma de borrar",
      "Sacapuntas",
      "Regla 30 cm",
      "Plasticola 90 g",
      "Tijera escolar",
      "Resaltador",
      "Carpeta N° 3",
      "Folios (paquete de 10)",
      "Cinta adhesiva",
      "Fotocopia simple",
    ],
  },
  otro: {
    productos: [],
  },
};

export function plantilla_productos_rubro(rubro: string): PlantillaProductosRubro {
  return PLANTILLAS_PRODUCTOS_RUBRO[rubro] ?? PLANTILLAS_PRODUCTOS_RUBRO["otro"]!;
}

export function skuPlantilla(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `PLT-${base}`;
}
