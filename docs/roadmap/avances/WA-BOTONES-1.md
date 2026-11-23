---
item: WA-BOTONES-1
estado: hecho
adr: —
prd: —
fecha: 2026-11-22
---
WA-BOTONES-1: los botones de la alerta de stock bajo se traducen a su comando de texto en vez de caer en «boton_ignorado». El quick reply de una plantilla llega como `type: "button"` sin payload, así que el id del botón no viaja por ese canal: `normalizarBotonEntrada` ahora acepta ese caso y usa `button.payload`; si falta, usa `button.text`. Los tres botones de `alertas.ts` y `aviso-matutino.ts` ya tenían un comando de texto equivalente y probado en el router, así que se traduce el botón a ese texto en vez de duplicar la lógica: menos superficie y ningún camino nuevo. El efecto es que "Ver y pedir", "Guardar p/ viernes" y "Pausar avisos" dejan de ser un no-op fuera de la ventana de 24 h. Ningún botón crea órdenes por su cuenta: "Ver y pedir" muestra la lista y el resto sigue el flujo normal del bot.
