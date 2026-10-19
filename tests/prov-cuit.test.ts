import { describe, expect, it } from "vitest";
import {
  vincular_cuit_contacto,
  type ContactoProveedor,
  type ProveedorResumen,
} from "../src/modules/whatsapp/proveedor.js";

const CONTACTO: ContactoProveedor = {
  numeroE164: "+5491100000001",
  tenantId: "t-1",
  supplierCuit: null,
  estado: "verificado",
  creadoEn: "2026-10-19T12:00:00.000Z",
};

const PROVEEDORES: ReadonlyArray<ProveedorResumen> = [
  { cuit: "20933331726", nombre: "Panadería Sur" },
  { cuit: "30712345678", nombre: "Harinas SA" },
];

describe("PROV-S6/S7 vincular_cuit_contacto", () => {
  it("sin CUIT legible no cambia la identidad", () => {
    expect(vincular_cuit_contacto({ contacto: CONTACTO, cuitLeido: null, proveedores: PROVEEDORES })).toEqual({
      cambio: false,
      motivo: "sin_cuit",
      supplierCuit: null,
      proveedorExiste: false,
      proveedorNombre: null,
    });
    expect(vincular_cuit_contacto({ contacto: CONTACTO, cuitLeido: "20-9333", proveedores: PROVEEDORES })).toEqual({
      cambio: false,
      motivo: "sin_cuit",
      supplierCuit: null,
      proveedorExiste: false,
      proveedorNombre: null,
    });
  });

  it("el mismo CUIT normalizado no se vuelve a escribir", () => {
    expect(
      vincular_cuit_contacto({
        contacto: { ...CONTACTO, supplierCuit: "20933331726" },
        cuitLeido: "20-93333172-6",
        proveedores: PROVEEDORES,
      }),
    ).toEqual({
      cambio: false,
      motivo: "ya_igual",
      supplierCuit: "20933331726",
      proveedorExiste: true,
      proveedorNombre: "Panadería Sur",
    });
  });

  it("un CUIT distinto no pisa la identidad previa", () => {
    expect(
      vincular_cuit_contacto({
        contacto: { ...CONTACTO, supplierCuit: "30712345678" },
        cuitLeido: "20-93333172-6",
        proveedores: PROVEEDORES,
      }),
    ).toEqual({
      cambio: false,
      motivo: "conflicto",
      supplierCuit: "30712345678",
      proveedorExiste: true,
      proveedorNombre: "Panadería Sur",
    });
  });

  it("un CUIT nuevo que ya es proveedor del comercio queda vinculado", () => {
    expect(vincular_cuit_contacto({ contacto: CONTACTO, cuitLeido: "20-93333172-6", proveedores: PROVEEDORES })).toEqual({
      cambio: true,
      contacto: { ...CONTACTO, supplierCuit: "20933331726" },
      proveedorExiste: true,
      proveedorNombre: "Panadería Sur",
    });
  });

  it("un CUIT nuevo sin proveedor conocido queda vinculado igual", () => {
    expect(vincular_cuit_contacto({ contacto: CONTACTO, cuitLeido: "20-11111111-2", proveedores: PROVEEDORES })).toEqual({
      cambio: true,
      contacto: { ...CONTACTO, supplierCuit: "20111111112" },
      proveedorExiste: false,
      proveedorNombre: null,
    });
  });
});
