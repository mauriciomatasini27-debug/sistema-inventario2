import { describe, expect, it } from "vitest";
import { evaluar, marcaNoMergear, migracionesDelPr, parsearRegistro } from "../scripts/cadena/puede-mergear-lib.mjs";

const REGISTRO = "# x\n\n- 0000_sweet_krista_starr\n- 0023_cash_due_items\n";

describe("puede-mergear: marca en título/cuerpo", () => {
  it.each(["No mergear hasta aplicar", "no mergear", "**DO NOT MERGE**", "Do not  merge yet", "Estado: NO MERGEAR."])(
    "bloquea %s",
    (t) => expect(marcaNoMergear("feat: x", t)).not.toBeNull(),
  );
  it.each(["Se puede mergear", "no mergeamos nada raro", "", null])("no bloquea %s", (t) =>
    expect(marcaNoMergear("feat: x", t)).toBeNull(),
  );
  it("mira el título", () => expect(marcaNoMergear("[DO NOT MERGE] wip", "")).toBe("DO NOT MERGE"));
});

describe("puede-mergear: migraciones", () => {
  it("parsea el registro", () => {
    expect([...parsearRegistro(REGISTRO)]).toEqual(["0000_sweet_krista_starr", "0023_cash_due_items"]);
  });
  it("solo cuenta drizzle/*.sql no borrados", () => {
    const files = [
      { filename: "drizzle/0024_nueva.sql", status: "added" },
      { filename: "drizzle/meta/_journal.json", status: "modified" },
      { filename: "drizzle/0001_vieja.sql", status: "removed" },
      { filename: "src/x.sql", status: "added" },
    ];
    expect(migracionesDelPr(files)).toEqual(["0024_nueva"]);
  });
  it("bloquea migración no registrada y deja pasar la registrada", () => {
    const base = { titulo: "feat", cuerpo: "ok", registroMd: REGISTRO };
    expect(evaluar({ ...base, files: [{ filename: "drizzle/0024_nueva.sql", status: "added" }] }).ok).toBe(false);
    expect(evaluar({ ...base, files: [{ filename: "drizzle/0023_cash_due_items.sql", status: "modified" }] }).ok).toBe(true);
    expect(evaluar({ ...base, files: [] }).ok).toBe(true);
  });
  it("junta ambos motivos", () => {
    const r = evaluar({ titulo: "x", cuerpo: "No mergear", registroMd: "", files: [{ filename: "drizzle/0024_a.sql", status: "added" }] });
    expect(r.motivos).toHaveLength(2);
  });
});
