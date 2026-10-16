import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { armar_tra_xml, firmar_tra_cms, tra_times } from "../src/modules/fiscal/tra.js";
import { generarCertificadoPrueba, opensslDisponible } from "./helpers/openssl-cert.js";

const TIENE_OPENSSL = opensslDisponible();
if (!TIENE_OPENSSL) console.warn("openssl no disponible: se omite tests/fiscal-tra-cms.test.ts");

function traDePrueba(): string {
  const t = tra_times(new Date("2026-10-10T12:00:00.000Z"));
  return armar_tra_xml({ ...t, service: "wsfe" });
}

function cmsDer(traXml: string, certPem: string, keyPem: string, dir: string): string {
  const der = join(dir, "cms.der");
  writeFileSync(der, Buffer.from(firmar_tra_cms(traXml, certPem, keyPem), "base64"));
  return der;
}

describe.skipIf(!TIENE_OPENSSL)("fiscal TRA/CMS firmado", () => {
  it("openssl verifica la firma y extrae el TRA exacto (contenido adjunto)", () => {
    const { certPem, keyPem } = generarCertificadoPrueba();
    const traXml = traDePrueba();
    const dir = mkdtempSync(join(tmpdir(), "tra-cms-"));
    const der = cmsDer(traXml, certPem, keyPem, dir);
    const certPath = join(dir, "cert.pem");
    writeFileSync(certPath, certPem);
    const extraido = join(dir, "tra.xml");
    execFileSync("openssl", ["cms", "-verify", "-inform", "DER", "-in", der, "-noverify", "-out", extraido]);
    expect(readFileSync(extraido, "utf8")).toBe(traXml);
    const extraidoCA = join(dir, "tra-ca.xml");
    execFileSync("openssl", ["cms", "-verify", "-inform", "DER", "-in", der, "-CAfile", certPath, "-out", extraidoCA]);
    expect(readFileSync(extraidoCA, "utf8")).toBe(traXml);
  });

  it("estructura SignedData: sha256, un firmante, firma directa sin atributos", () => {
    const { certPem, keyPem } = generarCertificadoPrueba();
    const dir = mkdtempSync(join(tmpdir(), "tra-cms-"));
    const der = cmsDer(traDePrueba(), certPem, keyPem, dir);
    const impreso = execFileSync("openssl", ["cms", "-cmsout", "-inform", "DER", "-in", der, "-print"], {
      encoding: "utf8",
    });
    expect(impreso).toContain("1.2.840.113549.1.7.2");
    expect(impreso).toContain("1.2.840.113549.1.7.1");
    expect(impreso).toContain("2.16.840.1.101.3.4.2.1");
    expect(impreso).toContain("1.2.840.113549.1.1.1");
    expect(impreso.match(/issuerAndSerialNumber/g)?.length ?? 0).toBe(1);
    expect(impreso).toMatch(/signedAttrs:\s*<ABSENT>/);
    expect(impreso).not.toContain("1.2.840.113549.1.9.3");
    expect(impreso).not.toContain("1.2.840.113549.1.9.4");
    expect(impreso).not.toContain("1.2.840.113549.1.9.5");
  });

  it("certificado embebido coincide con el firmante", () => {
    const { certPem, keyPem } = generarCertificadoPrueba();
    const dir = mkdtempSync(join(tmpdir(), "tra-cms-"));
    const der = cmsDer(traDePrueba(), certPem, keyPem, dir);
    const certPath = join(dir, "cert.pem");
    writeFileSync(certPath, certPem);
    const serieOriginal = execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-serial"], { encoding: "utf8" }).trim();
    const embebido = join(dir, "embebido.pem");
    execFileSync("openssl", ["pkcs7", "-inform", "DER", "-in", der, "-print_certs", "-out", embebido]);
    const serieEmbebida = execFileSync("openssl", ["x509", "-in", embebido, "-noout", "-serial"], { encoding: "utf8" }).trim();
    expect(serieEmbebida).toBe(serieOriginal);
  });

  it("un byte alterado hace fallar la verificación", () => {
    const { certPem, keyPem } = generarCertificadoPrueba();
    const traXml = traDePrueba();
    const original = Buffer.from(firmar_tra_cms(traXml, certPem, keyPem), "base64");
    const alterado = Buffer.from(original);
    const ultimo = alterado[alterado.length - 1] ?? 0;
    alterado[alterado.length - 1] = ultimo ^ 0x01;
    const dir = mkdtempSync(join(tmpdir(), "tra-cms-"));
    const der = join(dir, "cms.der");
    writeFileSync(der, alterado);
    expect(() =>
      execFileSync("openssl", ["cms", "-verify", "-inform", "DER", "-in", der, "-noverify", "-out", join(dir, "x.xml")]),
    ).toThrow();
  });
});
