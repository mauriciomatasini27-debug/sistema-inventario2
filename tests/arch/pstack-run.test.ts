import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("E1 pstack-run usa .pstack-tmp en vez de /tmp", () => {
  it("pstack-run.sh exporta TMPDIR al repo y crea el dir antes de correr", () => {
    const texto = readFileSync(".opencode/pstack-run.sh", "utf8");
    expect(texto, "falta mkdir -p de .pstack-tmp").toMatch(/mkdir -p .*\.pstack-tmp/);
    expect(texto, 'falta export TMPDIR="$PWD/.pstack-tmp"').toMatch(/export TMPDIR="\$PWD\/\.pstack-tmp"/);
    const mkdir = texto.indexOf(".pstack-tmp");
    const correr = texto.indexOf('"$OC" serve');
    expect(mkdir >= 0 && correr > mkdir, "mkdir debe ir antes de arrancar el servidor").toBe(true);
    expect(texto, "el script no debe escribir rutas absolutas en /tmp").not.toMatch(/(^|[^A-Za-z0-9_.-])\/tmp\//m);
  });

  it(".gitignore cubre .pstack-tmp/", () => {
    const texto = readFileSync(".gitignore", "utf8");
    expect(texto.split("\n").some((l) => l.trim() === ".pstack-tmp/"), "falta `.pstack-tmp/` en .gitignore").toBe(true);
  });
});
