// FE-S26 / #106: vencimiento del PEM del computador fiscal (sin OpenSSL en runtime).
import { X509Certificate } from "node:crypto";

export function notAfterDesdeCertPem(certPem: string): Date | null {
  if (!certPem.trim()) return null;
  try {
    const cert = new X509Certificate(certPem);
    const fin = new Date(cert.validTo);
    return Number.isNaN(fin.getTime()) ? null : fin;
  } catch {
    return null;
  }
}
