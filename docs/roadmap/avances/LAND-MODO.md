---
item: LAND-MODO
estado: hecho
prd: PRD-LP-04
fecha: 2026-11-16
---
LAND-MODO: el flotante de la landing es Modo y el panel de chat baja desde el bot con WhatsApp primero.

## Decisión
El botón flotante de la landing deja de mostrar un icono de chat genérico y pasa a mostrar a Modo, el bot de la app, con flotado y parpadeo. El panel se ancla arriba del muñeco y entra con una animación de descenso desde su esquina inferior derecha, con transform y opacity, y se apaga con prefers-reduced-motion. WhatsApp deja de competir con el trigger y pasa a ser la primera acción del panel, con el número visible. Se conservan sugerencias, input libre, derivación, formulario y aviso Ley 25.326, y los mismos hooks data-chat-* que usa el script existente.
