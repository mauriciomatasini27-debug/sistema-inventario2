// TRA + CMS para WSAA (ADR-0018 D3, Fase 0: node-forge).
// Puro salvo firmar (node-forge, sin binario externo).
import forge from "node-forge";

export const WSAA_SERVICE = "wsfe" as const;

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
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: "2.16.840.1.101.3.4.2.1",
  });
  p7.sign({ detached: false });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}
