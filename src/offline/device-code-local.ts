// P1-31: un device_code por perfil de navegador. Dos teléfonos dejan de
// compartir "caja-01" y el push deja de responder 422 cuando sus seq chocan.
// El contador slice0-seq sigue aparte: un código nuevo puede arrancar en un seq alto.

declare const DeviceCodeBrand: unique symbol;
export type DeviceCode = string & { readonly [DeviceCodeBrand]: "DeviceCode" };

export interface AlmacenDeviceCode {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

const CLAVE = "slice0-device";
const PREFIJO = "caja-";
// Mismos topes que device_code en validation.ts.
const LARGO_MIN = 4;
const LARGO_MAX = 32;

function codigoValido(valor: string | null): DeviceCode | null {
  if (valor === null) return null;
  if (valor.length < LARGO_MIN || valor.length > LARGO_MAX) return null;
  return valor as DeviceCode;
}

function azarCorto(): string {
  return crypto.randomUUID().slice(0, 8);
}

function armar(azar: string): DeviceCode {
  const codigo = codigoValido((PREFIJO + azar).slice(0, LARGO_MAX));
  if (!codigo) throw new Error("device_code fuera de rango");
  return codigo;
}

export function codigoDispositivoLocal(
  storage: AlmacenDeviceCode,
  azar: () => string = azarCorto,
): DeviceCode {
  const guardado = codigoValido(storage.getItem(CLAVE));
  if (guardado) return guardado;
  const codigo = armar(azar());
  storage.setItem(CLAVE, codigo);
  return codigo;
}
