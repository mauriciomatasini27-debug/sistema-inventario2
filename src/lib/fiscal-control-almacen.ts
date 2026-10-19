import { and, eq } from "drizzle-orm";
import { getControlDb } from "./db.js";
import { arcaTokens, fiscalComputers } from "../db/schema-fiscal-control.js";

export interface FilaComputador {
  readonly id: string;
  readonly ambiente: string;
  readonly alias: string;
  readonly cuitProveedor: string;
  readonly certPem: string;
  readonly keyCiphertext: string;
  readonly kmsKeyId: string;
  readonly notAfter: Date | null;
}

export interface FilaTa {
  readonly fiscalComputerId: string;
  readonly servicio: string;
  readonly ambiente: string;
  readonly tokenCiphertext: string;
  readonly signCiphertext: string;
  readonly expiration: Date;
}

export interface FiscalControlStore {
  guardarComputador(fila: FilaComputador): Promise<string>;
  buscarComputador(ambiente: string, alias: string): Promise<FilaComputador | null>;
  guardarTa(fila: FilaTa): Promise<void>;
  buscarTa(fiscalComputerId: string, servicio: string, ambiente: string): Promise<FilaTa | null>;
}

export function storeFiscalControl(): FiscalControlStore {
  const db = getControlDb();
  return {
    async guardarComputador(f) {
      const filas = await db
        .insert(fiscalComputers)
        .values({
          id: f.id,
          ambiente: f.ambiente,
          alias: f.alias,
          cuitProveedor: f.cuitProveedor,
          certPem: f.certPem,
          keyCiphertext: f.keyCiphertext,
          kmsKeyId: f.kmsKeyId,
          notAfter: f.notAfter,
        })
        .onConflictDoUpdate({
          target: [fiscalComputers.ambiente, fiscalComputers.alias],
          set: {
            cuitProveedor: f.cuitProveedor,
            certPem: f.certPem,
            keyCiphertext: f.keyCiphertext,
            kmsKeyId: f.kmsKeyId,
            notAfter: f.notAfter,
          },
        })
        .returning({ id: fiscalComputers.id });
      const id = filas[0]?.id;
      if (!id) throw new Error("fiscal: el upsert del computador no devolvio id");
      return id;
    },

    async buscarComputador(ambiente, alias) {
      const filas = await db
        .select()
        .from(fiscalComputers)
        .where(and(eq(fiscalComputers.ambiente, ambiente), eq(fiscalComputers.alias, alias)))
        .limit(1);
      const f = filas[0];
      if (!f) return null;
      return {
        id: f.id,
        ambiente: f.ambiente,
        alias: f.alias,
        cuitProveedor: f.cuitProveedor,
        certPem: f.certPem,
        keyCiphertext: f.keyCiphertext,
        kmsKeyId: f.kmsKeyId,
        notAfter: f.notAfter,
      };
    },

    async guardarTa(f) {
      await db
        .insert(arcaTokens)
        .values({
          fiscalComputerId: f.fiscalComputerId,
          servicio: f.servicio,
          ambiente: f.ambiente,
          tokenCiphertext: f.tokenCiphertext,
          signCiphertext: f.signCiphertext,
          expiration: f.expiration,
        })
        .onConflictDoUpdate({
          target: [arcaTokens.fiscalComputerId, arcaTokens.servicio, arcaTokens.ambiente],
          set: {
            tokenCiphertext: f.tokenCiphertext,
            signCiphertext: f.signCiphertext,
            expiration: f.expiration,
            updatedAt: new Date(),
          },
        });
    },

    async buscarTa(fiscalComputerId, servicio, ambiente) {
      const filas = await db
        .select()
        .from(arcaTokens)
        .where(
          and(
            eq(arcaTokens.fiscalComputerId, fiscalComputerId),
            eq(arcaTokens.servicio, servicio),
            eq(arcaTokens.ambiente, ambiente),
          ),
        )
        .limit(1);
      const f = filas[0];
      if (!f) return null;
      return {
        fiscalComputerId: f.fiscalComputerId,
        servicio: f.servicio,
        ambiente: f.ambiente,
        tokenCiphertext: f.tokenCiphertext,
        signCiphertext: f.signCiphertext,
        expiration: f.expiration,
      };
    },
  };
}

export function storeFiscalControlMemoria(): FiscalControlStore {
  const computadores = new Map<string, FilaComputador>();
  const tas = new Map<string, FilaTa>();
  const claveComputador = (ambiente: string, alias: string) => `${ambiente}:${alias}`;
  const claveTa = (fiscalComputerId: string, servicio: string, ambiente: string) =>
    `${fiscalComputerId}:${servicio}:${ambiente}`;
  return {
    async guardarComputador(f) {
      computadores.set(claveComputador(f.ambiente, f.alias), f);
      return f.id;
    },
    async buscarComputador(ambiente, alias) {
      return computadores.get(claveComputador(ambiente, alias)) ?? null;
    },
    async guardarTa(f) {
      tas.set(claveTa(f.fiscalComputerId, f.servicio, f.ambiente), f);
    },
    async buscarTa(fiscalComputerId, servicio, ambiente) {
      return tas.get(claveTa(fiscalComputerId, servicio, ambiente)) ?? null;
    },
  };
}
