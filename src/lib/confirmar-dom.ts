import { puedeConfirmar, textosConfirmar, type OpcionesTextoConfirmar } from "./confirmar.js";

const ID_DIALOGO = "confirmar-dialogo";

export interface OpcionesConfirmar extends OpcionesTextoConfirmar {}

interface ElementosConfirmar {
  dialogo: HTMLDialogElement;
  titulo: HTMLElement;
  mensaje: HTMLElement;
  accion: HTMLButtonElement;
  cancelar: HTMLButtonElement;
  campoNombre: HTMLElement;
  inputNombre: HTMLInputElement;
  esperadoNombre: HTMLElement;
}

function buscarElementos(): ElementosConfirmar | null {
  const dialogo = document.getElementById(ID_DIALOGO) as HTMLDialogElement | null;
  if (!dialogo || typeof dialogo.showModal !== "function") return null;
  const titulo = dialogo.querySelector<HTMLElement>("#confirmar-titulo");
  const mensaje = dialogo.querySelector<HTMLElement>("#confirmar-mensaje");
  const accion = dialogo.querySelector<HTMLButtonElement>("#confirmar-aceptar");
  const cancelar = dialogo.querySelector<HTMLButtonElement>("#confirmar-cancelar");
  const campoNombre = dialogo.querySelector<HTMLElement>("#confirmar-nombre-campo");
  const inputNombre = dialogo.querySelector<HTMLInputElement>("#confirmar-nombre");
  const esperadoNombre = dialogo.querySelector<HTMLElement>("#confirmar-nombre-esperado");
  if (!titulo || !mensaje || !accion || !cancelar || !campoNombre || !inputNombre || !esperadoNombre) {
    return null;
  }
  return { dialogo, titulo, mensaje, accion, cancelar, campoNombre, inputNombre, esperadoNombre };
}

function focusablesDe(contenedor: HTMLElement): HTMLElement[] {
  const selector =
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  return Array.from(contenedor.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
  );
}

export function confirmar(opciones: OpcionesConfirmar): Promise<boolean> {
  const textos = textosConfirmar(opciones);
  const els = typeof document === "undefined" ? null : buscarElementos();
  if (!els) {
    return Promise.resolve(
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(textos.titulo + "\n\n" + textos.mensaje)
        : false,
    );
  }
  const { dialogo, titulo, mensaje, accion, cancelar, campoNombre, inputNombre, esperadoNombre } = els;
  titulo.textContent = textos.titulo;
  mensaje.textContent = textos.mensaje;
  accion.textContent = textos.accion;
  const requerido = textos.nombreRequerido;
  campoNombre.hidden = requerido === null;
  esperadoNombre.textContent = requerido ?? "";
  inputNombre.value = "";
  const valido = (): boolean => requerido === null || puedeConfirmar(inputNombre.value, requerido);
  accion.disabled = !valido();

  const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  return new Promise<boolean>((resolve) => {
    let aceptado = false;
    let resuelto = false;

    function limpiar(): void {
      dialogo.removeEventListener("keydown", alTecla);
      dialogo.removeEventListener("cancel", alCancelar);
      dialogo.removeEventListener("close", alCerrar);
      inputNombre.removeEventListener("input", alEscribir);
      accion.removeEventListener("click", alAceptar);
      cancelar.removeEventListener("click", alClickCancelar);
    }
    function terminar(valor: boolean): void {
      if (resuelto) return;
      resuelto = true;
      limpiar();
      if (dialogo.open) dialogo.close();
      previo?.focus();
      resolve(valor);
    }
    function alEscribir(): void {
      accion.disabled = !valido();
    }
    function alAceptar(evento: MouseEvent): void {
      if (!valido()) {
        evento.preventDefault();
        return;
      }
      aceptado = true;
    }
    function alClickCancelar(): void {
      terminar(false);
    }
    function alCancelar(evento: Event): void {
      evento.preventDefault();
      terminar(false);
    }
    function alCerrar(): void {
      terminar(aceptado);
    }
    function alTecla(evento: KeyboardEvent): void {
      if (evento.key !== "Tab") return;
      const focusables = focusablesDe(dialogo);
      if (focusables.length < 2) return;
      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      if (!primero || !ultimo) return;
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }

    dialogo.addEventListener("keydown", alTecla);
    dialogo.addEventListener("cancel", alCancelar);
    dialogo.addEventListener("close", alCerrar);
    inputNombre.addEventListener("input", alEscribir);
    accion.addEventListener("click", alAceptar);
    cancelar.addEventListener("click", alClickCancelar);

    dialogo.showModal();
    (requerido === null ? cancelar : inputNombre).focus();
  });
}
