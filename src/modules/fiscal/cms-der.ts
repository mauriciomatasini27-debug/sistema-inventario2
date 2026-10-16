export function derLongitud(n: number): Buffer {
  if (n < 128) return Buffer.from([n]);
  const cuerpo: number[] = [];
  let resto = n;
  while (resto > 0) {
    cuerpo.unshift(resto & 0xff);
    resto >>= 8;
  }
  return Buffer.from([0x80 | cuerpo.length, ...cuerpo]);
}

export function derTlv(etiqueta: number, contenido: Buffer): Buffer {
  return Buffer.concat([Buffer.from([etiqueta]), derLongitud(contenido.length), contenido]);
}

export function derSequence(...partes: Buffer[]): Buffer {
  return derTlv(0x30, Buffer.concat(partes));
}

export function derSet(...partes: Buffer[]): Buffer {
  return derTlv(0x31, Buffer.concat(partes));
}

export function derEnteroValor(valor: number): Buffer {
  return derTlv(0x02, Buffer.from([valor]));
}

export function derOid(oid: string): Buffer {
  const arcos = oid.split(".").map(Number);
  const cuerpo: number[] = [(arcos[0] ?? 0) * 40 + (arcos[1] ?? 0)];
  for (const arco of arcos.slice(2)) {
    if (arco < 128) {
      cuerpo.push(arco);
      continue;
    }
    const digitos: number[] = [];
    let resto = arco;
    while (resto > 0) {
      digitos.unshift(resto & 0x7f);
      resto >>= 7;
    }
    for (let i = 0; i < digitos.length - 1; i++) digitos[i] = (digitos[i] ?? 0) | 0x80;
    cuerpo.push(...digitos);
  }
  return derTlv(0x06, Buffer.from(cuerpo));
}

export const DER_NULL: Buffer = Buffer.from([0x05, 0x00]);

export function derOctetos(datos: Buffer): Buffer {
  return derTlv(0x04, datos);
}

export function derExplicito(n: number, interno: Buffer): Buffer {
  return derTlv(0xa0 | n, interno);
}

export interface RangoTlv {
  inicio: number;
  fin: number;
  etiqueta: number;
  inicioContenido: number;
}

export function leerTlv(datos: Buffer, inicio: number): RangoTlv {
  const etiqueta = datos[inicio] ?? 0;
  const primerLongitud = datos[inicio + 1] ?? 0;
  let inicioContenido: number;
  let largo: number;
  if (primerLongitud < 128) {
    inicioContenido = inicio + 2;
    largo = primerLongitud;
  } else {
    const cantidad = primerLongitud & 0x7f;
    largo = 0;
    for (let i = 0; i < cantidad; i++) largo = largo * 256 + (datos[inicio + 2 + i] ?? 0);
    inicioContenido = inicio + 2 + cantidad;
  }
  return { inicio, fin: inicioContenido + largo, etiqueta, inicioContenido };
}

export function hijosTlv(datos: Buffer, inicio: number): RangoTlv[] {
  const raiz = leerTlv(datos, inicio);
  const hijos: RangoTlv[] = [];
  let cursor = raiz.inicioContenido;
  while (cursor < raiz.fin) {
    const hijo = leerTlv(datos, cursor);
    hijos.push(hijo);
    cursor = hijo.fin;
  }
  if (cursor !== raiz.fin) throw new Error("cms-der: longitud hija excede al padre");
  return hijos;
}

export function extraerEmisorYSerie(certDer: Buffer): { emisor: Buffer; serie: Buffer } {
  const certificado = hijosTlv(certDer, 0);
  const tbs = certificado[0];
  if (tbs === undefined) throw new Error("cms-der: certificado sin tbsCertificate");
  const campos = hijosTlv(certDer, tbs.inicio);
  let indice = campos[0]?.etiqueta === 0xa0 ? 1 : 0;
  const serie = campos[indice];
  const emisor = campos[indice + 2];
  if (serie?.etiqueta !== 0x02 || emisor === undefined) throw new Error("cms-der: tbsCertificate sin serie o emisor");
  return {
    emisor: certDer.subarray(emisor.inicio, emisor.fin),
    serie: certDer.subarray(serie.inicio, serie.fin),
  };
}
