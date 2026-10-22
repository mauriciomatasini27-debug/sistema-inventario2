import { describe, expect, it } from "vitest";
import { levantarBase } from "../scripts/control-app/lib/base.mjs";

type Respuesta = { status?: number; stderr?: string; errorCode?: string };

function runner(respuestas: Respuesta[]) {
  const llamadas: Array<{ comando: string; args: string[] }> = [];
  const correrFn = (comando: string, args: string[] = [], _opciones: Record<string, unknown> = {}) => {
    llamadas.push({ comando, args });
    const r = respuestas.shift() ?? { status: 1 };
    const error = r.errorCode ? Object.assign(new Error(r.errorCode), { code: r.errorCode }) : null;
    return { status: r.status ?? 1, stdout: "", stderr: r.stderr ?? "", error };
  };
  return { correrFn, llamadas };
}

describe("control-app: base local", () => {
  it("devuelve ok cuando Postgres ya está corriendo", () => {
    const { correrFn, llamadas } = runner([{ status: 0 }]);
    expect(levantarBase(correrFn)).toMatchObject({
      ok: true,
      propia: false,
      accion: "ya_estaba",
      corriendo: true,
      puerto: 54329,
    });
    expect(llamadas).toHaveLength(1);
  });

  it("levanta Postgres cuando no está corriendo", () => {
    const { correrFn, llamadas } = runner([{ status: 2 }, { status: 0 }, { status: 0 }]);
    expect(levantarBase(correrFn)).toMatchObject({ ok: true, propia: true, accion: "iniciada", corriendo: true });
    expect(llamadas.map((l) => l.comando)).toEqual(["pg_isready", "bash", "pg_isready"]);
  });

  it("falla con hint cuando no puede levantar Postgres", () => {
    const { correrFn } = runner([{ status: 2 }, { status: 1, stderr: "boom" }, { status: 2 }]);
    expect(levantarBase(correrFn)).toMatchObject({
      ok: false,
      error: expect.stringContaining("No pude levantar Postgres local."),
      detalle: "boom",
      hint: expect.stringContaining("CONTROL_APP_SIN_BASE=1"),
    });
  });

  it("reporta pg_isready ausente", () => {
    const { correrFn } = runner([{ status: 1, errorCode: "ENOENT" }, { status: 1 }, { status: 1, errorCode: "ENOENT" }]);
    expect(levantarBase(correrFn)).toMatchObject({ ok: false, disponible: false, corriendo: null });
  });
});
