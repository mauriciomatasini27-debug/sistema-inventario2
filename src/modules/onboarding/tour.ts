// Tour ON7 sin UX. Pasos como datos versionados por rol y tamaño.
// Sin overlay ni JS acá: la app los consume con data-tour.
export interface PasoTour {
  id: string;
  ancla: string;
  ruta: string;
  titulo: string;
  texto: string;
  permiso?: string | undefined;
}

export const TOUR_VERSION = "v1";

export const PASOS_DUENO: PasoTour[] = [
  { id: "inicio", ancla: "checklist", ruta: "/", titulo: "Tu lista", texto: "Acá ves lo que falta para dejar tu comercio andando." },
  { id: "venta-escanear", ancla: "venta-escanear", ruta: "/venta", titulo: "Vender", texto: "Acá escaneás el producto para venderlo." },
  { id: "venta-cobrar", ancla: "venta-cobrar", ruta: "/venta", titulo: "Cobrar", texto: "Elegí cómo te pagan y confirmá." },
  { id: "stock-lista", ancla: "stock-lista", ruta: "/stock", titulo: "Stock", texto: "Acá buscás un producto y ves dónde está." },
  { id: "stock-nuevo", ancla: "stock-nuevo-producto", ruta: "/stock", titulo: "Nuevo producto", texto: "Sumá tu primer producto con la cámara." },
  { id: "alertas", ancla: "alertas-lista", ruta: "/alertas", titulo: "Alertas", texto: "Te avisamos cuando algo se está acabando." },
  { id: "caja-apertura", ancla: "caja-apertura", ruta: "/caja", titulo: "Caja", texto: "Abrí el día antes de vender.", permiso: "ver_saldos_caja" },
  { id: "caja-resumen", ancla: "caja-resumen", ruta: "/caja", titulo: "Resumen", texto: "El resumen del día vive acá.", permiso: "ver_saldos_caja" },
  { id: "proveedores", ancla: "proveedores-lista", ruta: "/proveedores", titulo: "Proveedores", texto: "Agregá a tu distribuidor." },
  { id: "whatsapp", ancla: "whatsapp-estado", ruta: "/configuracion", titulo: "WhatsApp", texto: "Vinculá tu número para recibir avisos." },
  { id: "ayuda", ancla: "ayuda-tour", ruta: "/ayuda", titulo: "Ayuda", texto: "El tour y el video quedan acá." },
];

export const PASOS_EMPLEADO: PasoTour[] = [
  { id: "inicio", ancla: "checklist", ruta: "/", titulo: "Tu lista", texto: "Tus primeros pasos en el comercio." },
  { id: "venta-escanear", ancla: "venta-escanear", ruta: "/venta", titulo: "Vender", texto: "Acá escaneás el producto para venderlo." },
  { id: "venta-cobrar", ancla: "venta-cobrar", ruta: "/venta", titulo: "Cobrar", texto: "Elegí cómo te pagan.", },
  { id: "stock-lista", ancla: "stock-lista", ruta: "/stock", titulo: "Stock", texto: "Acá buscás un producto y ves dónde está." },
  { id: "bot", ancla: "bot-ayuda", ruta: "/ayuda", titulo: "Bot", texto: "Consultá stock por WhatsApp." },
  { id: "ayuda", ancla: "ayuda-tour", ruta: "/ayuda", titulo: "Ayuda", texto: "El tour queda acá." },
];

// Por qué filtrar por permiso y no por lista aparte: usa los mismos
// permisos que el backend expone a la sesión (ON7.5).
export function filtrar_pasos_por_permisos(pasos: PasoTour[], permisos: string[]): PasoTour[] {
  return pasos.filter((p) => !p.permiso || permisos.includes(p.permiso));
}

export function pasos_para_rol(rol: "dueno" | "empleado", permisos: string[] = []): PasoTour[] {
  if (rol === "empleado") return filtrar_pasos_por_permisos(PASOS_EMPLEADO, permisos);
  return PASOS_DUENO;
}
