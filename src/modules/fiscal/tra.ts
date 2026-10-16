// TRA + CMS para WSAA (ADR-0018 D3, Fase 0: node:crypto, sin binario externo).
// CMS SignedData con contenido adjunto, firma RSA directa sobre el TRA.
import { X509Certificate, createPrivateKey, sign } from "node:crypto";
import {
  DER_NULL,
  derEnteroValor,
  derExplicito,
  derOctetos,
  derOid,
  derSequence,
  derSet,
  extraerEmisorYSerie,
} from "./cms-der.js";

export const WSAA_SERVICE = "wsfe" as const;

const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";
const OID_DATA = "1.2.840.113549.1.7.1";
const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_RSA = "1.2.840.113549.1.1.1";

export function tra_times(now: Date): { generationTime: string; expirationTime: string; uniqueId: string } {
  const gen = new Date(now.getTime() - 10 * 60 * 1000);
  const exp = new Date(now.getTime() + 10 * 60 * 1000);
  return {
    generationTime: gen.toISOString(),
    expirationTime: exp.toISOString(),
    uniqueId: String(Math.floor(now.getTime() / 1000)),
  };
}

export function armar_tra_xml(args: { uniqueId: string; generationTime: string; expirationTime: string; service: string }): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0">` +
    `<header><uniqueId>${args.uniqueId}</uniqueId>` +
    `<generationTime>${args.generationTime}</generationTime>` +
    `<expirationTime>${args.expirationTime}</expirationTime></header>` +
    `<service>${args.service}</service>` +
    `</loginTicketRequest>`
  );
}

export function firmar_tra_cms(traXml: string, certPem: string, keyPem: string): string {
  const contenido = Buffer.from(traXml, "utf8");
  const firma = sign("sha256", contenido, createPrivateKey(keyPem));
  const certDer = Buffer.from(new X509Certificate(certPem).raw);
  const { emisor, serie } = extraerEmisorYSerie(certDer);
  const algoritmoFirma = derSequence(derOid(OID_SHA256), DER_NULL);
  const contenidoAdjunto = derSequence(derOid(OID_DATA), derExplicito(0, derOctetos(contenido)));
  const firmante = derSequence(
    derEnteroValor(1),
    derSequence(emisor, serie),
    algoritmoFirma,
    derSequence(derOid(OID_RSA), DER_NULL),
    derOctetos(firma),
  );
  const firmado = derSequence(
    derEnteroValor(1),
    derSet(algoritmoFirma),
    contenidoAdjunto,
    derExplicito(0, certDer),
    derSet(firmante),
  );
  return derSequence(derOid(OID_SIGNED_DATA), derExplicito(0, firmado)).toString("base64");
}
