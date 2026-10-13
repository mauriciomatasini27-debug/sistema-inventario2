// escpos_bt.ts — Slice D exclusivo (TV15 P2): conector Web Bluetooth ESC/POS.
// Todo cliente, offline-first, sin deps, sin red, sin DOM salvo navigator.bluetooth.
// El parent lo copia a src/modules/sales/escpos_bt.ts y lo cablea al botón
// "Imprimir BT" de venta.astro (ver integrar.md).
//
// Usa textABytes / bytesCorte / EscPosPrinter de ticket_thermal.ts:
//   texto cols32 (58mm, 32 cols) -> textABytes -> chunks 512B -> write.
// El límite BLE real negociado suele ser 20..512B; 512 es el techo que pide
// el descriptor, por eso se troza a CHUNK_BT = 512 y se escribe secuencial
// (await por chunk, sin paralelo: los GATT writes no admiten overlap).

import { bytesCorte, textABytes, type EscPosPrinter } from "./ticket_thermal.js";

export const CHUNK_BT = 512 as const;

// UUIDs por defecto: Nordic UART (el más común en térmicas BLE baratas
// 58mm: XPrinter / Goojprt / Munbyn). Si la impresora expone otro servicio,
// pasar serviceUuid + characteristicUuid por opts. El filtro por nombre es
// opcional (ej. "MPT-", "Printer", "XP-").
export const SERVICE_UUID_DEFECTO = "6e400001-b5a3-f393-e0a9-e50e24dcca9e" as const;
export const CHARACTERISTIC_UUID_DEFECTO = "6e400002-b5a3-f393-e0a9-e50e24dcca9e" as const;

export type CodigoFalloBt =
  | "bluetooth_no_soportado"
  | "dispositivo_no_elegido"
  | "escritura_fallida"
  | "conexion_perdida";

export type FalloBt = { readonly ok: false; readonly codigo: CodigoFalloBt; readonly detalle?: string | undefined };
export type ExitoBt<T> = { readonly ok: true; readonly valor: T };
export type ResultadoBt<T> = ExitoBt<T> | FalloBt;

// Impresora conectada. Extiende EscPosPrinter de ticket_thermal.ts para que
// imprimirEscPos(printer, texto) la acepte sin cambios.
export interface ImpresoraBt extends EscPosPrinter {
  readonly conectada: boolean;
  desconectar(): Promise<void>;
}

export function hay_bluetooth(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof (navigator as unknown as { bluetooth?: unknown }).bluetooth !== "undefined"
  );
}

export interface OptsConexionBt {
  readonly serviceUuid?: string | undefined;
  readonly characteristicUuid?: string | undefined;
  // Prefijos de nombre para el picker (requestDevice filters). Si vacío se
  // pide por services únicamente (acepta cualquier impresora con ese servicio).
  readonly nombrePrefijos?: ReadonlyArray<string> | undefined;
  // Nombre exacto alternativo (filters [{ name }]).
  readonly nombreExacto?: string | undefined;
}

class ImpresoraBtGatt implements ImpresoraBt {
  private readonly characteristic: BluetoothRemoteGATTCharacteristic;
  private readonly device: BluetoothDevice;
  private abierta = true;

  constructor(characteristic: BluetoothRemoteGATTCharacteristic, device: BluetoothDevice) {
    this.characteristic = characteristic;
    this.device = device;
  }

  get conectada(): boolean {
    try {
      return this.abierta && (this.device.gatt?.connected === true);
    } catch {
      return false;
    }
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.conectada) throw fallo_bt("conexion_perdida");
    // Trozo secuencial de 512B: writeValueWithResponse si existe
    // (confiable), si no writeValue (sin respuesta).
    for (let i = 0; i < data.length; i += CHUNK_BT) {
      const chunk = data.slice(i, i + CHUNK_BT);
      // Copia a ArrayBuffer propio: GATT no acepta views con byteOffset.
      const buf = new Uint8Array(chunk).buffer as ArrayBuffer;
      try {
        const c = this.characteristic as unknown as {
          writeValueWithResponse?: (b: ArrayBuffer) => Promise<void>;
          writeValue?: (b: ArrayBuffer) => Promise<void>;
        };
        if (typeof c.writeValueWithResponse === "function") await c.writeValueWithResponse(buf);
        else if (typeof c.writeValue === "function") await c.writeValue(buf);
        else throw new Error("sin metodo write");
      } catch (e) {
        throw fallo_bt("escritura_fallida", mensaje(e));
      }
    }
  }

  async desconectar(): Promise<void> {
    this.abierta = false;
    try {
      this.device.gatt?.disconnect();
    } catch {
      // Best-effort: desconectar nunca lanza.
    }
  }
}

// Error tipado interno: se lanza y se atrapa en el borde (conectar/imprimir)
// para devolver FalloBt en vez de throw al dominio.
function fallo_bt(codigo: CodigoFalloBt, detalle?: string): Error & { codigoBt: CodigoFalloBt; detalleBt?: string } {
  const e = new Error(codigo) as Error & { codigoBt: CodigoFalloBt; detalleBt?: string };
  e.codigoBt = codigo;
  if (detalle !== undefined) e.detalleBt = detalle;
  return e;
}

function mensaje(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 200);
  return String(e).slice(0, 200);
}

function a_fallo(e: unknown): FalloBt {
  if (e instanceof Error && "codigoBt" in e) {
    const t = e as Error & { codigoBt: CodigoFalloBt; detalleBt?: string };
    return t.detalleBt !== undefined
      ? { ok: false, codigo: t.codigoBt, detalle: t.detalleBt }
      : { ok: false, codigo: t.codigoBt };
  }
  // Cancel del picker (NotFoundError / AbortError) = usuario no eligió.
  if (e instanceof Error && (e.name === "NotFoundError" || e.name === "AbortError")) {
    return { ok: false, codigo: "dispositivo_no_elegido", detalle: mensaje(e) };
  }
  return { ok: false, codigo: "escritura_fallida", detalle: mensaje(e) };
}

// Pide el dispositivo al usuario (requiere gesto: click en "Imprimir BT"),
// conecta GATT y resuelve la characteristic de escritura.
export async function conectar_impresora_bt(
  opts: OptsConexionBt = {},
): Promise<ResultadoBt<ImpresoraBt>> {
  if (!hay_bluetooth()) return { ok: false, codigo: "bluetooth_no_soportado" };
  const serviceUuid = opts.serviceUuid ?? SERVICE_UUID_DEFECTO;
  const characteristicUuid = opts.characteristicUuid ?? CHARACTERISTIC_UUID_DEFECTO;
  try {
    const bluetooth = (navigator as unknown as { bluetooth: Bluetooth }).bluetooth;
    // Filtro por nombre si se da; si no, por servicio (cualquier impresora).
    const filters: Array<{ services?: string[]; name?: string; namePrefix?: string }> =
      opts.nombreExacto !== undefined
        ? [{ services: [serviceUuid], name: opts.nombreExacto }]
        : (opts.nombrePrefijos ?? []).length > 0
          ? (opts.nombrePrefijos as string[]).map((p) => ({ services: [serviceUuid], namePrefix: p }))
          : [{ services: [serviceUuid] }];
    // requestDevice exige filters u acceptAllDevices; usamos filters.
    const device = await bluetooth.requestDevice({
      filters: filters as BluetoothLEScanFilter[],
      optionalServices: [serviceUuid],
    });
    if (!device.gatt) throw fallo_bt("dispositivo_no_elegido", "sin gatt");
    if (!device.gatt.connected) await device.gatt.connect();
    const service = await device.gatt.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(characteristicUuid);
    return { ok: true, valor: new ImpresoraBtGatt(characteristic, device) };
  } catch (e) {
    return a_fallo(e);
  }
}

// Atajo P2: conecta (picker), imprime cols32 + corte, desconecta.
// Devuelve FalloBt tipado; nunca lanza al dominio.
export async function imprimir_ticket_bt(
  cols32: string,
  opts: OptsConexionBt = {},
): Promise<{ readonly ok: true } | FalloBt> {
  const conn = await conectar_impresora_bt(opts);
  if (!conn.ok) return conn;
  try {
    await conn.valor.write(textABytes(cols32 + "\n"));
    await conn.valor.write(bytesCorte());
    return { ok: true };
  } catch (e) {
    return a_fallo(e);
  } finally {
    await conn.valor.desconectar();
  }
}

// Reúso con impresora ya conectada (ej. el usuario imprime 2 copias sin
// reabrir el picker). Equivale a imprimirEscPos(printer, cols32).
export async function imprimir_sobre_conexion(
  impresora: ImpresoraBt,
  cols32: string,
): Promise<{ readonly ok: true } | FalloBt> {
  try {
    await impresora.write(textABytes(cols32 + "\n"));
    await impresora.write(bytesCorte());
    return { ok: true };
  } catch (e) {
    return a_fallo(e);
  }
}
