---
id: PRD-NEG-01
tipo: prd
estado: propuesto
modulos: [inventario]
depende_de: [ADR-0012, PRD-LANDING-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-NEG-01 - Negocio y catálogo ModoOps (R2)

Fuente: `consultoria/CONTEXT.md` (42k), `modoops-configurador.md`, `catalogo-modoops-inicial.md`, ADR 0005. Restringido por ADR-0012. Tipo proceso según ADR-0012.

## Épica NEG-E1. Marca blanca

Requisito NEG1: vender ModoOps Sistema de Gestión Modular sin exponer Odoo en la venta.

- Historia NEG-S1. Vender ModoOps Sistema de Gestión Modular sin nombrar Odoo en marketing ni en propuesta. AC: Given leo la propuesta comercial When busco `Odoo` Then no aparece ninguna mención. ADR: 0012. Talla S. Depende de: nada.
- Historia NEG-S2. Explicitar Odoo CE 19 más módulos solo en anexo técnico y en licencia, con shell Astro BFF que oculta la UI nativa en el uso diario. AC: Given abro el anexo técnico When leo el stack Then figura Odoo CE 19 más módulos, y Given opero a diario When navego Then no veo la UI nativa. ADR: 0012. Talla S. Depende de: NEG-S1.

## Épica NEG-E2. Catálogo cerrado

Requisito NEG2: el universo ofrecible es igual al Catálogo ModoOps y crece solo con validación real.

- Historia NEG-S3. Mantener como validados Mostrador con 2 cajas, Depósito Inteligente con 1 almacén, Ventas, Compras, Fiscal AR con anexo fiscal, Contactos, Plataforma siempre incluida sin cobrar, Puente Factura Web y Taller como add-on de 155. AC: Given pido un módulo validado When reviso el catálogo Then figura con su alcance exacto y precio cuando corresponde. ADR: 0012. Talla M. Depende de: nada.
- Historia NEG-S4. Tratar como candidatos con add-on B2B por 155, CRM excluido como ancla, eCommerce en Fase 2, integraciones desde 104, MRP con descubrimiento extenso y migración Excel por 155 hasta 500 productos. AC: Given pido eCommerce o MRP When reviso la respuesta Then se cotiza como add-on con descubrimiento y no como base. ADR: 0012. Talla S. Depende de: NEG-S3.

## Épica NEG-E3. Configurador interno

Requisito NEG3: herramienta interna, sin self-service, con salida cerrada.

- Historia NEG-S5. Cargar entradas de vertical, sucursales, almacenes, cajas, módulos, anexo fiscal, datos, infra y recursos del cliente. AC: Given completo todas las entradas When genero la salida Then no falta ningún campo de entrada en el resumen. ADR: 0012. Talla M. Depende de: NEG-S3.
- Historia NEG-S6. Aplicar reglas de que el ancla es combo base, lo fuera del combo es add-on, más de 92h va a Fase 2 y se bloquea el tercer proyecto simultáneo. AC: Given armo un alcance de 100h When valido Then el excedente queda marcado como Fase 2. ADR: 0012. Talla M. Depende de: NEG-S5.
- Historia NEG-S7. Emitir lista cerrada más exclusiones más hitos más propuesta de 10 secciones con 20 días de validez. AC: Given emito la propuesta When cuento secciones y leo vigencia Then hay 10 secciones y validez de 20 días. ADR: 0012. Talla M. Depende de: NEG-S5, NEG-S6.

## Épica NEG-E4. Precios

Requisito NEG4: precios en USD con un solo precio publicado.

- Historia NEG-S8. Cobrar Descubrimiento a 155 fijo por 3 días, con día extra a 52, como único precio publicado. AC: Given leo el sitio When busco `$` Then el único precio público es el de Descubrimiento. ADR: 0012. Talla S. Depende de: NEG-S7.

> Nota 2026-10-12: superado por PRD-LANDING-01 / decisión del dueño: sin precio de servicio ni implementación; revisable.
- Historia NEG-S9. Cotizar Ancla a 800 en esquema híbrido 50/25/25 contra aceptación, con techo de 92h, 8h de ajustes, 6h de capacitación e hipercare de 10 días. AC: Given firmo un ancla When leo el cronograma de pagos Then respeta 50/25/25 contra aceptación con techo de 92h. ADR: 0012. Talla M. Depende de: NEG-S7.
- Historia NEG-S10. Aplicar crédito de 77.5 al anticipo si firma en 20 días sin publicarlo, hora extra a 10.5, abono a 45 por mes con 4h que vencen, mes 1 de transición y mes 2 obligatorio, con meta de 600 por mes. AC: Given el cliente firma el día 15 When liquido Then el anticipo descuenta 77.5 y el abono figura como no publicado. ADR: 0012. Talla S. Depende de: NEG-S9.

## Épica NEG-E5. Capacidad y criterios

Requisito NEG5 y NEG6: hasta 2 anclas en paralelo y nada fuera de catálogo.

- Historia NEG-S11. Operar hasta 2 anclas en paralelo con red a demanda, de 15 a 18h semanales por ancla, con full-time solo si hay runway de 6 meses más 2 a 3 clientes con abono. AC: Given planifico tres anclas a la vez When valido capacidad Then el tercero queda bloqueado. ADR: 0012. Talla S. Depende de: NEG-S6.
- Historia NEG-S12. Verificar que ninguna propuesta prometa fuera de catálogo, ningún ancla salga sin lista cerrada, ningún fiscal salga sin anexo firmado y que los precios públicos se limiten a descubrimiento. AC: Given audito una propuesta When la comparo con el catálogo Then todo lo ofrecido figura en catálogo con lista cerrada y anexo fiscal cuando aplica. ADR: 0012. Talla S. Depende de: NEG-S3, NEG-S7.

## Dependencias externas

NEG-S1 y NEG-S3 no esperan a nadie. NEG-S5 espera a NEG-S3. NEG-S7 espera a NEG-S5 y NEG-S6. Precios y capacidad esperan a propuesta y catálogo.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Propuesta válida | Entradas completas más catálogo | Lista cerrada más exclusiones más hitos, 10 secciones y 20 días de validez |
| Fallo | Fiscal sin anexo | Módulo fiscal sin anexo firmado | Bloqueo hasta firmar anexo |
| Regresión | Precio público | Revisión del sitio | Solo Descubrimiento publicado, ancla y crédito sin publicar |

Arch-tests: AT1 propuesta valida contra catálogo cerrado (test unitario: falla si un módulo fuera de catálogo pasa la validación).
