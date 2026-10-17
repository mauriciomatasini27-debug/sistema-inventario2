import type { ErroresCampo } from "./errores-campo.js";

const CLASE = "error-campo";

function idError(id: string): string {
  return id + "-error";
}

export function limpiarErrores(form: HTMLElement): void {
  const doc = form.ownerDocument;
  for (const p of Array.from(form.querySelectorAll("." + CLASE))) p.remove();
  for (const el of Array.from(form.querySelectorAll<HTMLElement>("[aria-describedby]"))) {
    const restantes = (el.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((v) => v.length > 0 && doc.getElementById(v) !== null);
    if (restantes.length > 0) el.setAttribute("aria-describedby", restantes.join(" "));
    else el.removeAttribute("aria-describedby");
  }
  for (const el of Array.from(form.querySelectorAll<HTMLElement>("[aria-invalid]"))) {
    el.removeAttribute("aria-invalid");
  }
}

function marcarError(input: HTMLElement, mensaje: string): void {
  const id = input.id;
  if (!id) return;
  input.setAttribute("aria-invalid", "true");
  const p = input.ownerDocument.createElement("p");
  p.className = CLASE;
  p.id = idError(id);
  p.textContent = mensaje;
  input.insertAdjacentElement("afterend", p);
  const descrito = input.getAttribute("aria-describedby");
  input.setAttribute("aria-describedby", descrito ? `${descrito} ${p.id}` : p.id);
}

export function mostrarErrores(form: HTMLElement, errores: ErroresCampo): HTMLElement | null {
  limpiarErrores(form);
  let primero: HTMLElement | null = null;
  for (const el of Array.from(form.querySelectorAll<HTMLElement>("input, select, textarea"))) {
    const clave = el.dataset.campo ?? el.getAttribute("name") ?? el.id;
    const mensaje = clave ? errores[clave] : undefined;
    if (!mensaje) continue;
    marcarError(el, mensaje);
    if (!primero) primero = el;
  }
  if (primero) primero.focus();
  return primero;
}
