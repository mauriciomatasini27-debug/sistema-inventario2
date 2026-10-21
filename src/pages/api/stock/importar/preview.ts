import type { APIRoute } from "astro";
import { resolverRolEfectivo } from "../../../../lib/control.js";
import {
  leerArchivoImportacion,
  parsearConCatalogo,
  respuestaErrorImportacion,
} from "../../../../lib/importacion-archivo.js";
import { BaseNoDisponible } from "../../../../lib/server-db.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const rolEfectivo = resolverRolEfectivo(request);
  if (rolEfectivo.estado === "sin_permiso") {
    return Response.json({ error: "No tenés permiso en este comercio." }, { status: 403 });
  }

  const leido = await leerArchivoImportacion(request);
  if (!leido.ok) return leido.respuesta;
  const archivo = leido.archivo;

  try {
    const parseo = await parsearConCatalogo(archivo);
    if (!parseo.ok) return respuestaErrorImportacion(parseo.error);
    return Response.json({
      archivo: {
        nombre: archivo.nombre,
        sha256: archivo.sha256,
        bytes: archivo.bytes,
        formato: archivo.formato,
      },
      resumen: parseo.resumen,
      filas: parseo.filas.map((fila) =>
        fila.estado === "error"
          ? { estado: "error", fila: fila.fila, crudo: fila.crudo, errores: fila.errores }
          : {
              estado: fila.estado,
              fila: fila.fila,
              sku: fila.sku,
              nombre: fila.nombre,
              precio_centavos: fila.precioCentavos,
              cantidad: fila.cantidad,
              sector: fila.sector,
              stock_actual: fila.stockActual,
              stock_resultante: fila.stockResultante,
              errores: [],
            },
      ),
      columnas_ignoradas: parseo.columnasIgnoradas,
      advertencia_codificacion: parseo.advertenciaCodificacion,
    });
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      return Response.json({ error: "base_no_disponible" }, { status: 503 });
    }
    throw e;
  }
};
