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
