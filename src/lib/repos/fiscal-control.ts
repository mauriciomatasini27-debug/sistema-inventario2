import { kms_desde_env, type Envelope, type Kms } from "../../modules/fiscal/kms.js";
import { notAfterDesdeCertPem } from "../../modules/fiscal/cert-pem.js";
import {
  storeFiscalControl,
  storeFiscalControlMemoria,
  type FiscalControlStore,
} from "../fiscal-control-almacen.js";

export const SERVICIO_WSFE = "wsfe" as const;

export type AmbienteFiscal = "homo" | "prod";

export interface ConfigFiscal {
  readonly ambiente: AmbienteFiscal;
  readonly alias?: string | undefined;
  readonly cuitProveedor: string;
  readonly certPem: string;
  readonly keyPem: string;
}

export interface ComputadorFiscal {
  readonly id: string;
  readonly ambiente: AmbienteFiscal;
  readonly alias: string;
  readonly cuitProveedor: string;
  readonly certPem: string;
  readonly keyPem: string;
  readonly notAfter: Date | null;
}

export interface TaFiscal {
  readonly token: string;
  readonly sign: string;
  readonly expiraEn: number;
}

export interface FiscalControlDeps {
  readonly almacen?: FiscalControlStore;
  readonly kms?: Kms;
  readonly ahora?: () => Date;
}

let memoria: FiscalControlStore | null = null;

function almacenPorDefecto(): FiscalControlStore {
  try {
    return storeFiscalControl();
  } catch (e) {
    console.warn("fiscal: control DB no disponible, uso memoria", e instanceof Error ? e.message : String(e));
    memoria ??= storeFiscalControlMemoria();
    return memoria;
  }
}

function esAmbienteFiscal(valor: string): valor is AmbienteFiscal {
  return valor === "homo" || valor === "prod";
}

function kmsPorDefecto(): Kms {
  const kms = kms_desde_env(process.env);
  if (!kms) throw new Error("fiscal: falta FISCAL_KMS_KEY_B64");
  return kms;
}

function cifrar(kms: Kms, plano: string): Promise<string> {
  return kms.encrypt(plano).then((e: Envelope) => JSON.stringify(e));
}

function descifrar(kms: Kms, cifrado: string): Promise<string> {
  return kms.decrypt(JSON.parse(cifrado) as Envelope);
}

export async function guardarComputadorFiscal(
  input: {
    readonly ambiente: AmbienteFiscal;
    readonly alias: string;
    readonly cuitProveedor: string;
    readonly certPem: string;
    readonly keyPem: string;
    readonly notAfter?: Date | null;
  },
  deps: FiscalControlDeps = {},
): Promise<string> {
  const almacen = deps.almacen ?? almacenPorDefecto();
  const kms = deps.kms ?? kmsPorDefecto();
  const notAfter = input.notAfter ?? notAfterDesdeCertPem(input.certPem) ?? null;
  return almacen.guardarComputador({
    id: crypto.randomUUID(),
    ambiente: input.ambiente,
    alias: input.alias,
    cuitProveedor: input.cuitProveedor,
    certPem: input.certPem,
    keyCiphertext: await cifrar(kms, input.keyPem),
    kmsKeyId: kms.keyId,
    notAfter,
  });
}

export async function asegurarComputadorFiscal(
  cfg: ConfigFiscal,
  deps: FiscalControlDeps = {},
): Promise<string> {
  const almacen = deps.almacen ?? almacenPorDefecto();
  const previo = await almacen.buscarComputador(cfg.ambiente, cfg.alias ?? cfg.cuitProveedor);
  if (previo) return previo.id;
  return guardarComputadorFiscal(
    {
      ambiente: cfg.ambiente,
      alias: cfg.alias ?? cfg.cuitProveedor,
      cuitProveedor: cfg.cuitProveedor,
      certPem: cfg.certPem,
      keyPem: cfg.keyPem,
      notAfter: notAfterDesdeCertPem(cfg.certPem),
    },
    deps,
  );
}

export interface ResumenComputadorFiscal {
  readonly id: string;
  readonly ambiente: AmbienteFiscal;
  readonly alias: string;
  readonly cuitProveedor: string;
  readonly notAfter: Date | null;
}

export async function listarResumenComputadoresFiscal(
  deps: FiscalControlDeps = {},
): Promise<readonly ResumenComputadorFiscal[]> {
  const almacen = deps.almacen ?? almacenPorDefecto();
  const filas = await almacen.listarComputadores();
  const out: ResumenComputadorFiscal[] = [];
  for (const fila of filas) {
    if (!esAmbienteFiscal(fila.ambiente)) continue;
    out.push({
      id: fila.id,
      ambiente: fila.ambiente,
      alias: fila.alias,
      cuitProveedor: fila.cuitProveedor,
      notAfter: fila.notAfter,
    });
  }
  return out;
}

export async function leerComputadorFiscal(
  ambiente: AmbienteFiscal,
  alias: string,
  deps: FiscalControlDeps = {},
): Promise<ComputadorFiscal | null> {
  const almacen = deps.almacen ?? almacenPorDefecto();
  const fila = await almacen.buscarComputador(ambiente, alias);
  if (!fila) return null;
  if (!esAmbienteFiscal(fila.ambiente)) {
    throw new Error(`fiscal: ambiente invalido en fiscal_computers: ${fila.ambiente}`);
  }
  const kms = deps.kms ?? kmsPorDefecto();
  return {
    id: fila.id,
    ambiente: fila.ambiente,
    alias: fila.alias,
    cuitProveedor: fila.cuitProveedor,
    certPem: fila.certPem,
    keyPem: await descifrar(kms, fila.keyCiphertext),
    notAfter: fila.notAfter,
  };
}

export async function guardarTaFiscal(
  cfg: ConfigFiscal,
  ta: TaFiscal,
  deps: FiscalControlDeps = {},
): Promise<void> {
  const almacen = deps.almacen ?? almacenPorDefecto();
  const kms = deps.kms ?? kmsPorDefecto();
  const fiscalComputerId = await asegurarComputadorFiscal(cfg, { ...deps, almacen });
  await almacen.guardarTa({
    fiscalComputerId,
    servicio: SERVICIO_WSFE,
    ambiente: cfg.ambiente,
    tokenCiphertext: await cifrar(kms, ta.token),
    signCiphertext: await cifrar(kms, ta.sign),
    expiration: new Date(ta.expiraEn),
  });
}

export async function leerTaFiscal(
  cfg: ConfigFiscal,
  deps: FiscalControlDeps = {},
): Promise<TaFiscal | null> {
  const almacen = deps.almacen ?? almacenPorDefecto();
  const computador = await almacen.buscarComputador(cfg.ambiente, cfg.alias ?? cfg.cuitProveedor);
  if (!computador) return null;
  const fila = await almacen.buscarTa(computador.id, SERVICIO_WSFE, cfg.ambiente);
  if (!fila) return null;
  const ahora = deps.ahora?.() ?? new Date();
  if (fila.expiration.getTime() <= ahora.getTime()) return null;
  const kms = deps.kms ?? kmsPorDefecto();
  return {
    token: await descifrar(kms, fila.tokenCiphertext),
    sign: await descifrar(kms, fila.signCiphertext),
    expiraEn: fila.expiration.getTime(),
  };
}

export function taDurablePara(cfg: ConfigFiscal, deps: FiscalControlDeps = {}) {
  return {
    leer: (): Promise<TaFiscal | null> => leerTaFiscal(cfg, deps),
    guardar: (ta: TaFiscal): Promise<void> => guardarTaFiscal(cfg, ta, deps),
  };
}
