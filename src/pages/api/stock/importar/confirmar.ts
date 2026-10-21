import type { APIRoute } from "astro";
import { resolverRolEfectivo, resolverSesion } from "../../../../lib/control.js";
import {
  leerArchivoImportacion,
  parsearConCatalogo,
  respuestaErrorImportacion,
} from "../../../../lib/importacion-archivo.js";
import { exigirOnlineParaSensible } from "../../../../lib/offline-gate.js";
import { aplicarImportacionStock } from "../../../../lib/repos/importaciones.js";
import { BaseNoDisponible } from "../../../../lib/server-db.js";
import { estadoAltaDesdeRol } from "../../../../modules/inventario/escaneo.js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const rolEfectivo = resolverRolEfectivo(request);
  if (rolEfectivo.estado === "sin_permiso") {
    return Response.json({ error: "No tenés permiso en este comercio." }, { status: 403 });
  }
  const rol = rolEfectivo.estado === "sesion" ? rolEfectivo.rol : "dueno";
  const permisos = rolEfectivo.estado === "sesion" ? rolEfectivo.permisos : [];
  if (estadoAltaDesdeRol(rol, permisos) !== "activo") {
    return Response.json({ error: "Necesitás permiso de alta de productos." }, { status: 403 });
  }

  const sinConexion = exigirOnlineParaSensible(request);
  if (sinConexion) return sinConexion;

  const leido = await leerArchivoImportacion(request);
  if (!leido.ok) return leido.respuesta;
  const archivo = leido.archivo;

  if (!archivo.shaDeclarado) {
    return Response.json({ error: "falta archivo_sha256", codigo: "ARCHIVO_SHA_FALTA" }, { status: 422 });
  }
  if (archivo.shaDeclarado !== archivo.sha256) {
    return Response.json(
      { error: "el archivo cambió respecto de la vista previa", codigo: "ARCHIVO_CAMBIADO" },
      { status: 422 },
    );
  }

  try {
    const parseo = await parsearConCatalogo(archivo);
    if (!parseo.ok) return respuestaErrorImportacion(parseo.error);
    if (parseo.resumen.validas === 0) {
      return Response.json(
        { error: "sin filas válidas para importar", codigo: "SIN_FILAS_VALIDAS" },
        { status: 422 },
      );
    }

    const idemKey = (request.headers.get("Idempotency-Key") ?? "").trim();
    if (!idemKey) {
      return Response.json({ error: "falta idempotency key", codigo: "IDEM_KEY_FALTA" }, { status: 422 });
    }

    const filasValidas = parseo.filas.flatMap((fila) =>
      fila.estado === "error"
        ? []
        : [
            {
              sku: fila.sku,
              nombre: fila.nombre,
              precioCentavos: fila.precioCentavos,
              cantidad: fila.cantidad,
              sector: fila.sector,
            },
          ],
    );

    const resultado = await aplicarImportacionStock({
      idemKey,
      archivo: { nombre: archivo.nombre, sha256: archivo.sha256, formato: archivo.formato },
      creadoPor: resolverSesion(request)?.googleSub ?? "legado",
      filasValidas,
      totalFilas: parseo.resumen.total,
      filasError: parseo.resumen.con_error,
    });

    if (resultado.estado === "conflicto") {
      return Response.json(
        { error: "la clave idempotencia corresponde a otro archivo", codigo: "ARCHIVO_CAMBIADO" },
        { status: 409 },
      );
    }

    const importacion = resultado.importacion;
    return Response.json(
      {
        importacion_id: importacion.id,
        filas_importadas: importacion.filasImportadas,
        filas_nuevas: importacion.filasNuevas,
        filas_existentes: importacion.filasExistentes,
        filas_error: importacion.filasError,
        movimientos: importacion.movimientos,
        reintento: resultado.estado === "reintento",
      },
      { status: resultado.estado === "nueva" ? 201 : 200 },
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      return Response.json({ error: "base_no_disponible" }, { status: 503 });
    }
    throw e;
  }
};
