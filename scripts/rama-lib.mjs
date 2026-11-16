import { execFileSync } from "node:child_process";

export function ramaActual() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function esRamaPrincipal(nombre) {
  const n = String(nombre ?? "").trim();
  return n === "main" || n === "master";
}

export function esRamaDeTrabajo(nombre) {
  const n = String(nombre ?? "").trim();
  return n !== "" && !esRamaPrincipal(n);
}

// DOCS-GATE-CHECK: los generados los regenera main, así que en rama de
// trabajo el --check se omite (igual que la frescura de INDEX/graph en docs-check).
export function modoChequeo({ rama }) {
  return esRamaDeTrabajo(rama) ? "saltar" : "chequear";
}
