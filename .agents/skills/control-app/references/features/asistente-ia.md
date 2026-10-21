# Asistente del negocio

Vive en un drawer dentro de `/panel`. Rol duenio. El plan `plus` del seed lo habilita.

## Selectores

- `#asistente-abrir` botón que abre. Puede estar `hidden` hasta que `GET /api/asistente` confirme cupo.
- `#asistente-drawer` dialog.
- `#asistente-cerrar` cierra.
- `#asistente-pregunta` input de la pregunta.
- `#asistente-form` formulario.
- `#asistente-enviar` envía.
- `#asistente-respuesta` respuesta.
- `#asistente-cifras` cifras.
- `#asistente-estado` estado y errores.
- `#asistente-medidor`, `#asistente-medidor-texto` cupo usado.
- `#asistente-reintentar` reintento.
- `#asistente-chips` preguntas sugeridas.

## Receta

```sh
node scripts/control-app/control-app.mjs login --rol duenio
node scripts/control-app/control-app.mjs ir /panel
node scripts/control-app/control-app.mjs api GET /api/asistente
node scripts/control-app/control-app.mjs clic '#asistente-abrir'
node scripts/control-app/control-app.mjs escribir '#asistente-pregunta' '¿Cuánto vendí este mes?'
node scripts/control-app/control-app.mjs clic '#asistente-enviar'
node scripts/control-app/control-app.mjs captura --nombre asistente
```

El proveedor es fake bajo `CONTROL_APP_DEV=1`. La respuesta tiene que ser determinística y no salir a internet. Si `#asistente-abrir` sigue oculto, mirá `#asistente-trigger-estado`, el plan o el cupo.

## APIs

- `GET /api/asistente` devuelve cupo, chips y estado.
- `POST /api/asistente` recibe la pregunta.

## Límites

No prueba un modelo real. La verificación cubre contrato, cupo, render y errores del drawer. Si tocás el prompt o el proveedor real, eso queda fuera de esta skill.
