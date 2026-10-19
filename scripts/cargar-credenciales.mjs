import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { INTEGRACIONES, formatearReporte, revisarCredenciales } from "./chequear-credenciales.mjs";

const RUTA_ENV = fileURLToPath(new URL("../.env", import.meta.url));

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escaparValor(valor) {
  const requiereComillas = /[\n\r#\\]/.test(valor) || valor !== valor.trim() || /^['"]/.test(valor);
  if (!requiereComillas) return valor;
  if (!valor.includes("'")) return `'${valor}'`;
  if (!valor.includes('"')) return `"${valor}"`;
  throw new Error("valor con comillas simples y dobles: no se puede escribir en .env sin ambigüedad");
}

export function actualizarEnv(texto, cambios) {
  let salida = texto === "" || texto.endsWith("\n") ? texto : `${texto}\n`;
  for (const [clave, valor] of Object.entries(cambios)) {
    const linea = `${clave}=${escaparValor(valor)}`;
    const cuerpo = `^${escaparRegex(clave)}=("[^"]*"|'[^']*'|[^\\n]*)$`;
    salida = new RegExp(cuerpo, "m").test(salida)
      ? salida.replace(new RegExp(cuerpo, "gm"), () => linea)
      : `${salida}${linea}\n`;
  }
  return salida;
}

let restante = "";

function leerOculto(pregunta) {
  if (!stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    stdout.write(pregunta);
    let valor = "";
    let terminado = false;
    const quitar = () => {
      stdin.off("data", alDato);
      stdin.off("end", alFin);
      stdin.off("close", alFin);
    };
    const terminar = (resultado) => {
      if (terminado) return;
      terminado = true;
      quitar();
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      resolve(resultado);
    };
    const cancelar = () => {
      if (terminado) return;
      terminado = true;
      quitar();
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      reject(new Error("cancelado"));
    };
    const procesar = (texto) => {
      for (let i = 0; i < texto.length; i += 1) {
        const caracter = texto[i];
        if (caracter === "\u0003") {
          cancelar();
          return;
        }
        if (caracter === "\r" || caracter === "\n") {
          restante = texto.slice(i + 1).replace(/^\n/, "");
          terminar(valor);
          return;
        }
        if (caracter === "\u007f" || caracter === "\b") {
          valor = valor.slice(0, -1);
          continue;
        }
        valor += caracter;
      }
    };
    const alDato = (bloque) => procesar(bloque);
    const alFin = () => terminar(valor);
    const inicial = restante;
    restante = "";
    if (inicial) procesar(inicial);
    if (terminado) return;
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", alDato);
    stdin.once("end", alFin);
    stdin.once("close", alFin);
  });
}

function escribirEnv(contenido) {
  const temporal = `${RUTA_ENV}.tmp-${process.pid}`;
  try {
    writeFileSync(temporal, contenido, { mode: 0o600 });
    chmodSync(temporal, 0o600);
    renameSync(temporal, RUTA_ENV);
    return true;
  } catch (error) {
    console.error(`no se pudo escribir ${RUTA_ENV}: ${error.message}`);
    try {
      unlinkSync(temporal);
    } catch (limpieza) {
      console.error(`no se pudo borrar ${temporal}: ${limpieza.message}`);
    }
    return false;
  }
}

async function main() {
  if (existsSync(RUTA_ENV)) {
    try {
      process.loadEnvFile(RUTA_ENV);
    } catch (error) {
      console.error(`no se pudo leer ${RUTA_ENV}: ${error.message}`);
      process.exit(1);
    }
  }
  const pendientes = revisarCredenciales().filter((reporte) => !reporte.presente && !reporte.pendiente);
  if (pendientes.length === 0) {
    console.log("No falta ninguna credencial.");
    return;
  }
  if (!stdin.isTTY) console.error("Aviso: sin TTY la entrada se muestra en pantalla y una línea por variable.");
  console.log("Enter vacío omite la credencial. Para un PEM, escribí @ruta/al/archivo.");
  const lineas = stdin.isTTY ? null : readFileSync(0, "utf8").split(/\r?\n/);
  let indice = 0;
  let faltaronLineas = 0;
  const preguntar = async (pregunta) => {
    if (!lineas) return leerOculto(pregunta);
    stdout.write(pregunta);
    if (indice >= lineas.length) {
      faltaronLineas += 1;
      return "";
    }
    const valor = lineas[indice];
    indice += 1;
    return valor;
  };
  const cambios = {};
  for (const reporte of pendientes) {
    if (!INTEGRACIONES.some((item) => item.nombre === reporte.nombre)) continue;
    for (const clave of reporte.faltan) {
      const opcional = reporte.opcional ? " (opcional)" : "";
      const crudo = await preguntar(`${reporte.nombre}${opcional} ${clave}: `);
      const valor = crudo.trim();
      if (valor === "") continue;
      if (lineas && /-----BEGIN [^-]+-----/.test(crudo)) {
        console.error(`la línea de ${clave} parece un PEM; en modo no interactivo usá @ruta/al/archivo`);
        continue;
      }
      if (valor.startsWith("@")) {
        const archivo = valor.slice(1);
        try {
          cambios[clave] = readFileSync(archivo, "utf8").trim();
        } catch (error) {
          console.error(`no se pudo leer ${archivo}, se omite ${clave}: ${error.message}`);
        }
        continue;
      }
      cambios[clave] = crudo;
    }
  }
  if (faltaronLineas > 0) console.error(`faltaron ${faltaronLineas} líneas de entrada y se omitieron esas credenciales`);
  const cantidad = Object.keys(cambios).length;
  if (cantidad === 0) {
    console.log("No se cargó ninguna credencial.");
    return;
  }
  const texto = existsSync(RUTA_ENV) ? readFileSync(RUTA_ENV, "utf8") : "";
  if (!escribirEnv(actualizarEnv(texto, cambios))) process.exit(1);
  console.log(`Se cargaron ${cantidad} credenciales en ${RUTA_ENV}.`);
  console.log(formatearReporte(revisarCredenciales({ ...process.env, ...cambios })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message === "cancelado" ? "cancelado" : `error: ${error.message}`);
    process.exit(1);
  });
}
