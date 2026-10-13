// Vacíos ON9 sin UX. Metadata por pantalla con ancla para el tour.
// Sin tablas en blanco: cada vacío explica y ofrece la acción.
export interface EstadoVacio {
  pantalla: string;
  titulo: string;
  texto: string;
  accion: string;
  dataTour: string;
  permiso?: string | undefined;
}

export const VACIOS: EstadoVacio[] = [
  { pantalla: "productos", titulo: "Todavía no hay productos", texto: "Cargá el primero con la cámara.", accion: "Nuevo producto", dataTour: "stock-nuevo-producto" },
  { pantalla: "stock", titulo: "Sin stock", texto: "El stock aparece acá cuando cargues productos.", accion: "Cargar producto", dataTour: "stock-lista" },
  { pantalla: "caja", titulo: "La caja está cerrada", texto: "Abrí el día para empezar a vender.", accion: "Abrir el día", dataTour: "caja-apertura", permiso: "ver_saldos_caja" },
  { pantalla: "proveedores", titulo: "Sin proveedores", texto: "Agregá a tu distribuidor.", accion: "Agregar proveedor", dataTour: "proveedores-lista" },
  { pantalla: "ventas", titulo: "Sin ventas hoy", texto: "Hacé tu primera venta con la cámara.", accion: "Vender", dataTour: "venta-escanear" },
];

export function vacios_para_permisos(permisos: string[]): EstadoVacio[] {
  return VACIOS.filter((v) => !v.permiso || permisos.includes(v.permiso));
}
