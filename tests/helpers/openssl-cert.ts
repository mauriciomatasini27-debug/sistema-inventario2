import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function opensslDisponible(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function generarCertificadoPrueba(): { certPem: string; keyPem: string } {
  const dir = mkdtempSync(join(tmpdir(), "fiscal-cert-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "2",
    "-nodes",
    "-subj",
    "/CN=fiscal-test",
  ]);
  return { certPem: readFileSync(cert, "utf8"), keyPem: readFileSync(key, "utf8") };
}
