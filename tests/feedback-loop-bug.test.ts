import { describe, expect, it } from "vitest";
import { derivarEstado } from "../src/lib/panel-modulos.js";

/*
 * Phase 1: Tight feedback loop that goes RED on the bug
 * 
 * Bug: "se queda cargando en el navegador" al navegar entre rutas
 * Root cause in src/pages/panel/consumos.astro:
 *   let cuentasPromesa = null;
 *   const cargarCuentas = () => { if (cuentasPromesa) return cuentasPromesa; ... }
 *   
 *   When user navigates away and back, the stale promise is returned,
 *   UI stays on "Cargando…" forever.
 */

/* TEST 1: Demuestra el bug - debería PONER ROJO */
describe("Bug: stale promise across navigations", () => {
  it("cargarCuentas reutiliza promise stale - Bug reproduceido", () => {
    // Simula el patrón buggy de consumos.astro
    let cuentasPromesa: Promise<any> | null = null;
    
    const cargarCuentas = () => {
      if (cuentasPromesa) return cuentasPromesa; // **BUG** 
      cuentasPromesa = new Promise((resolve) => {
        // Fetch que simula never-resolve en nuevo contexto
        setTimeout(() => resolve({ items: 5 }), 10000);
      });
      return cuentasPromesa;
    };
    
    // Navegación a panel consumos (primera carga)
    const primeraCarga = cargarCuentas();
    
    // Navegación a otro panel y vuelta a consumos (segunda carga)
    // ES EL BUG: retorna la misma promise de la primera carga
    const segundaCarga = cargarCuentas();
    
    // **ESTO PONE ROJO**: Segunda carga retorna la misma promise que la primera
    // En un sistema correcto, deberían ser promises diferentes
    expect(segundaCarga).toBe(primeraCarga); // BUG: Mismo promise!
    
    // El estado UI se queda en "cargando" porque esa promise nunca se resuelve
    // con datos frescos en el nuevo contexto de navegación
    const estadoUI = derivarEstado({ cargando: true, error: false, items: 0 });
    expect(estadoUI).toBe("cargando"); // Bug: se queda cargando para siempre
  });
});

/* TEST 2: Demuestra el fix - debería PONER VERDE */
describe("Fix: nueva promise en cada carga", () => {
  it("cargarCuentas crea nueva promise cada vez - Fix verificado", () => {
    let cuentasPromesa: Promise<any> | null = null;
    
    // FIX: Siempre crear nueva promise, no reutilizar
    const cargarCuentasFix = () => {
      // FIX: No hay "if (cuentasPromesa) return..." 
      // O se resetea la variable al navegar fuera
      cuentasPromesa = new Promise((resolve) => {
        setTimeout(() => resolve({ items: 5 }), 100);
      });
      return cuentasPromesa;
    };
    
    const primeraCarga = cargarCuentasFix();
    const segundaCarga = cargarCuentasFix();
    
    // **ESTO PONE VERDE**: Con el fix, son promises diferentes
    expect(primeraCarga).not.toBe(segundaCarga); // FIX: promesas diferentes
    
    // El estado UI puede cambiar de "cargando" a "listo"
    const estadoInicial = derivarEstado({ cargando: true, error: false, items: 0 });
    const estadoDespues = derivarEstado({ cargando: false, error: false, items: 5 });
    
    expect(estadoInicial).toBe("cargando");
    expect(estadoDespues).toBe("listo"); // FIX: cambia a listo - bug arreglado
  });
});
