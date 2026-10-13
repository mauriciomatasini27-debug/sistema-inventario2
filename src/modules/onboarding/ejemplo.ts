// Ejemplo ON10 sin UX. Comercio demo separado por rubro, nunca dentro
// de la base real. Puro sin IO.
import { DIAS_PRUEBA_GRATIS, nombreDatabase } from "../tenants/aprovisionar.js";

export function dias_ejemplo(): number {
  return DIAS_PRUEBA_GRATIS;
}

export const PLANTILLAS_EJEMPLO: Record<string, { ubicaciones: string[]; productos: string[]; proveedor: string }> = {
  kiosco: {
    ubicaciones: ["Mostrador", "Góndola 1", "Heladera 1", "Depósito"],
    productos: ["Alfajor ficticio", "Gaseosa ficticia", "Chicle ficticio"],
    proveedor: "Distribuidora de ejemplo",
  },
  almacen: {
    ubicaciones: ["Mostrador", "Estantería 1", "Depósito"],
    productos: ["Fideo ficticio", "Arroz ficticio", "Aceite ficticio"],
    proveedor: "Mayorista de ejemplo",
  },
  despensa: {
    ubicaciones: ["Mostrador", "Estantería 1", "Depósito"],
    productos: ["Leche ficticia", "Pan ficticio", "Queso ficticio"],
    proveedor: "Proveedor de ejemplo",
  },
  libreria: {
    ubicaciones: ["Mostrador", "Estantería 1", "Depósito"],
    productos: ["Cuaderno ficticio", "Lapicera ficticia", "Regla ficticia"],
    proveedor: "Librería mayorista de ejemplo",
  },
  otro: {
    ubicaciones: ["Mostrador", "Estantería 1", "Depósito"],
    productos: ["Producto ficticio 1", "Producto ficticio 2"],
    proveedor: "Proveedor de ejemplo",
  },
};

export function plantilla_ejemplo(rubro: string) {
  return PLANTILLAS_EJEMPLO[rubro] ?? PLANTILLAS_EJEMPLO["otro"]!;
}

export function nombre_database_ejemplo(tenantDemoId: string): string {
  return nombreDatabase(tenantDemoId);
}

export function expira_ejemplo(desde: Date, dias = DIAS_PRUEBA_GRATIS): string {
  return new Date(desde.getTime() + dias * 24 * 3600 * 1000).toISOString();
}
