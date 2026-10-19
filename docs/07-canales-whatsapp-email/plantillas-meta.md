---
id: PLANTILLAS-META
tipo: spec
estado: propuesto
modulos: [bot]
depende_de: [PRD-BOT-03, ADR-0041, ADR-0091]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Borradores de las plantillas que hay que aprobar en Meta para encender el envío real del bot. Incluye
  categoría, variables, botones y el texto listo para cargar en el administrador de WhatsApp.
---
# Plantillas de Meta para el número central

Estas plantillas son las que `PRD-BOT-03` necesita para salir de la ventana de 24 horas. El texto es un borrador para cargar en el administrador de Meta; la aprobación y los IDs finales los gestiona Mauri.

Reglas que se aplican a todos los borradores:

- Idioma `es_AR`. Si Meta no lo admite, usar `es`.
- Categoría `utility` para avisos transaccionales del inventario. Categoría `authentication` solo para el código de respaldo.
- Sin promociones ni lenguaje de marketing en las de utilidad.
- Variables numeradas `{{1}}`, `{{2}}`, y valores de muestra al cargarlas.
- Cuerpo de hasta 1.024 caracteres y botones de hasta 20 caracteres. Confirmar los límites vigentes en Meta antes de cargar.
- Ningún envío sale sin opt-in registrado. La pausa y la baja se respetan en todos los casos.
- Los nombres y los IDs aprobados se guardan en configuración. No se hardcodean en `src/`.

## alerta_stock_bajo

Categoría: `utility`. Disparador: aviso matutino con novedades de stock. Historia: B5, BOT3-S3.

Variables:

| Variable | Valor de muestra |
|---|---|
| `{{1}}` | Kiosco La Esquina |
| `{{2}}` | 7 |
| `{{3}}` | 2 |

Cuerpo:

```
Buen día, {{1}}.

En los últimos días quedaron {{2}} productos con stock bajo ({{3}} urgentes, sin stock).

¿Qué querés hacer?
```

Botones de respuesta rápida: `Ver y pedir`, `Guardar p/ viernes`, `Pausar avisos`.

## resumen_semanal

Categoría: `utility`. Disparador: resumen del viernes. Historia: B9.

Variables:

| Variable | Valor de muestra |
|---|---|
| `{{1}}` | Kiosco La Esquina |
| `{{2}}` | 5 al 9/10 |
| `{{3}}` | 1.240 |
| `{{4}}` | Coca-Cola 500 ml (96), Alfajor Jorgito (80), Beldent (64) |
| `{{5}}` | 12 productos de 3 proveedores |

Cuerpo:

```
Resumen semanal de {{1}} ({{2}}).

Vendiste {{3}} unidades. Lo más vendido: {{4}}.

Te faltan {{5}}. El pedido sugerido ya está armado para el lunes.
```

Botones de respuesta rápida: `Ver pedido sugerido`, `Programar p/ lunes`, `Resumen completo`.

## resumen_cierre_caja

Categoría: `utility`. Disparador: cierre de caja. Historia: B14.

Variables:

| Variable | Valor de muestra |
|---|---|
| `{{1}}` | Kiosco La Esquina |
| `{{2}}` | 9/10 |
| `{{3}}` | $412.300 |
| `{{4}}` | $96.000 |
| `{{5}}` | $316.300 |
| `{{6}}` | Mauricio 8:02 |
| `{{7}}` | Mauricio 21:30 |

Cuerpo:

```
Cierre de caja de {{1}}, {{2}}.

Ingresos {{3}}, egresos {{4}}, resultado {{5}}.

Abrió {{6}}, cerró {{7}}.
```

Botón de respuesta rápida: `Ver detalle`.

## pedido_para_revisar

Categoría: `utility`. Disparador: un empleado armó un pedido y el dueño tiene que revisarlo. Historia: B8.

Variables:

| Variable | Valor de muestra |
|---|---|
| `{{1}}` | Lucas |
| `{{2}}` | Distribuidora X |
| `{{3}}` | 4 |
| `{{4}}` | $96.000 |

Cuerpo:

```
{{1}} armó un pedido a {{2}} ({{3}} líneas, total estimado {{4}}).
```

Botones de respuesta rápida: `Ver y confirmar`, `Descartar`.

## codigo_verificacion

Categoría: `authentication`. Disparador: código de respaldo de la vinculación. Historia: B1.2.

Variables:

| Variable | Valor de muestra |
|---|---|
| `{{1}}` | 731205 |

Cuerpo:

```
{{1}} es tu código de verificación. Vence en 10 minutos.
```

Sin botones. Meta puede exigir el formato fijo de la categoría de autenticación; si es así, se usa ese formato y se conserva el mismo nombre.

## alerta_vencimiento_promo

Categoría: `utility`. Disparador: alerta urgente de vencimiento, solo si el dueño la activa. Historia: B15.7. Opcional para el primer alta.

Variables:

| Variable | Valor de muestra |
|---|---|
| `{{1}}` | Kiosco La Esquina |
| `{{2}}` | 3 productos |
| `{{3}}` | antes del viernes |

Cuerpo:

```
{{1}}: {{2}} vencen {{3}} y todavía tenés stock.

¿Querés armar una promo?
```

Botones de respuesta rápida: `Crear promo`, `Ahora no`.

## Alta y verificación

1. Cargar cada plantilla con sus valores de muestra y confirmar la categoría que asigna Meta.
2. Si Meta recategoriza una plantilla como marketing, corregir el texto o retirarla. No se envía una plantilla de marketing dentro de un plan que no la incluye.
3. Guardar nombre, idioma, categoría e ID aprobado en la configuración.
4. Probar cada plantilla contra un número de prueba del equipo antes de encender el número central.
5. Registrar en el Control Plane la fecha de aprobación y la próxima revisión.

## Pendiente de confirmar en Meta

- Límite exacto de variables, caracteres y botones por plantilla.
- Si la categoría de autenticación admite texto libre o impone formato fijo.
- Si el emoji del borrador original de `bot-whatsapp-parte-1.md` afecta la aprobación. Los borradores de arriba no lo incluyen.
- Tarifa vigente de Argentina para utility y service. Sin ese dato no se cierran los cupos de `PRD-PLAN-02`.
