import { readSheet } from "read-excel-file/node";

// read-excel-file@9 no exporta un entrypoint raíz y su default devuelve todas
// las hojas (`Sheet[]`). `readSheet` sin número devuelve las filas de la
// primera hoja, que es lo que pide ADR-0108.
export async function leerXlsx(buffer: ArrayBuffer): Promise<unknown[][]> {
  return readSheet(Buffer.from(buffer));
}
