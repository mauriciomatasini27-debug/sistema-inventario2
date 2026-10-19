import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { actualizarEnv, escaparValor } from "../scripts/cargar-credenciales.mjs";

function idaYVuelta(valor: string) {
  return parseEnv(actualizarEnv("X=\n", { X: valor })).X;
}

describe("carga de credenciales en .env", () => {
  it("reemplaza una clave vacía y conserva comentarios y otras claves", () => {
    const antes = "# comentario\nWHATSAPP_TOKEN=\nOTRA=valor\n";
    expect(actualizarEnv(antes, { WHATSAPP_TOKEN: "token" })).toBe("# comentario\nWHATSAPP_TOKEN=token\nOTRA=valor\n");
  });

  it("agrega una clave ausente al final", () => {
    expect(actualizarEnv("A=1\n", { B: "2" })).toBe("A=1\nB=2\n");
  });

  it("sobrevive comillas, numeral, barra invertida, espacios y multilinea", () => {
    const valores = ["foo#bar", 'a"b', "C:\\nueva", "  x  ", "linea1\nlinea2", "a'b", 'linea1\na"b'];
    for (const valor of valores) expect(idaYVuelta(valor)).toBe(valor);
  });

  it("reemplaza todos los duplicados y deja ganar al último al releer", () => {
    const despues = actualizarEnv("A=1\nA=2\n", { A: "3" });
    expect(despues).toBe("A=3\nA=3\n");
    expect(parseEnv(despues).A).toBe("3");
  });

  it("reemplaza bloques multilínea con comillas dobles y simples", () => {
    expect(actualizarEnv('PEM="viejo1\nviejo2"\nOTRA=1\n', { PEM: "nuevo1\nnuevo2" })).toBe(
      "PEM='nuevo1\nnuevo2'\nOTRA=1\n",
    );
    expect(actualizarEnv("PEM='viejo1\nviejo2'\nOTRA=1\n", { PEM: "nuevo1\nnuevo2" })).toBe(
      "PEM='nuevo1\nnuevo2'\nOTRA=1\n",
    );
    expect(actualizarEnv("PEM='viejo1\nviejo2'\n", { PEM: "linea1\nit's" })).toBe('PEM="linea1\nit\'s"\n');
  });

  it("es idempotente", () => {
    const una = actualizarEnv("A=\n", { A: "x#y" });
    expect(actualizarEnv(una, { A: "x#y" })).toBe(una);
  });

  it("no confunde una clave con otra parecida", () => {
    expect(actualizarEnv("A.B=1\nAXB=2\n", { "A.B": "3" })).toBe("A.B=3\nAXB=2\n");
  });

  it("falla ruidosamente si el valor mezcla comillas simples y dobles con un carácter que exige comillas", () => {
    expect(() => escaparValor("linea1\n'\"")).toThrow("comillas simples y dobles");
  });
});
