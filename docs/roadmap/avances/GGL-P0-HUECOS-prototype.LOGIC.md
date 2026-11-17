# GGL-P0-HUECOS: Prototype de los 5 huecos de ingesta Gmail

**Prototipo throwaway** para validar los 5 huecos P0 detectados en la auditoría 2026-11-15.

## Estado actual (después de probar el HTML)

### Hueco 1: Dedupe explícita por `messageId`
- [x] **Validado**: El webhook de Gmail ya descarta duplicados por `messageId` en el servidor.
- [ ] **Falta en nuestro código**: La cola (`gmail-cola.ts`) usa dedupe por `(connection_id, history_id)` pero **no por `messageId`**.
- **Decisión**: Agregar validación de `messageId` en `encolarIngesta` o en el webhook `webhook.ts` antes de encolar. El `messageId` viene en el payload del PubSub push.

### Hueco 2: Evento en `gmail_connection_events` al cambiar filtros
- [x] **Validado**: Hoy no hay evento publicado cuando el usuario cambia filtros en Gmail.
- [ ] **Falta**: Publicar evento `filtros_cambiados` en la tabla `gmail_connection_events` cuando el consumidor detecte cambios en la configuración de labels/filters de la conexión.
- **Decisión**: Agregar publicación de evento en el job de consumo de ingesta Gmail, con tipo `filtros_cambiados` y metadatos del usuario que cambió.

### Hueco 3: Label elegible para `users.watch`
- [x] **Validado**: `users.watch` hoy solo observa `INBOX` fijo.
- [ ] **Falta**: Permitir al usuario (Dueño) configurar qué labels observar y guardarlo en la conexión Google.
- **Decisión**: Agregar campo `labels` a la tabla `google_connections` o a `gmail_watch_routes`, y UI para seleccionar labels. El `users.watch` se inicializaría con los labels configurados.

### Hueco 4: Rechazo casilla ya activa en otro comercio al conectar
- [x] **Validado**: El error 409 (CasillaEnOtroComercio) solo salta al registrar el `watch`, no al dar de alta la conexión.
- [ ] **Falta**: Validar anticipadamente al crear la conexión (`POST /api/gmail/connect`) si el email ya está conectado a otro comercio.
- **Decisión**: En `google-conexiones.ts` o en el route de connect, consultar `gmail_watch_routes` por `emailHmac` antes de crear la conexión. Lanzar error 409 temprano si hay conflicto.

### Hueco 5: Scheduler del watch (<12h de vida, nada lo invoca cada 24h)
- [x] **Validado**: El watch expira en <12h, y la renovación depende del job de polling (`gmail-poll.ts`).
- [ ] **Falta**: Un scheduler independiente que corra cada ~24h y solo renueve el watch si está por expirar, sin procesar ingesta.
- **Decisión**: Crear un job programado (cron type: `0 6 * * *` = 6:00 UTC diario) que llame a `renovarWatchGmail` por todas las conexiones activas. Este job es aparte del job de polling que procesa los mensajes.

## Cómo se usó el prototipo

1. Abrir `GGL-P0-HUECOS-prototype.html` en el navegador
2. Probar cada uno de los 5 botones por hueco
3. Revisar la consola `log` resultante para ver el estado simulado
4. Las decisiones arriba son el resultado de esa exploración interactiva

## Próximos pasos (después de este prototipo)

1. **P9-2** debe resolverse primero (decisión de Mauri: contador y abogado para RG 5616)
2. Con P9-2 definido, abordar estos 5 huecos en orden de criticidad:
   - Hueco 4 (validación al conectar) - menor riesgo, válidate temprano
   - Hueco 1 (dedupe por messageId) - medio riesgo, afecta idempotency
   - Hueco 2 (evento filtros cambiados) - medio riesgo, enriches data
   - Hueco 3 (labels configurables) - alto riesgo, requiere UI + backend
   - Hueco 5 (scheduler del watch) - medio riesgo, job nuevo en cron

---

*Prototipo generado el 2026-11-17. Archivo throwaway: commitear a una branch prototipo y dejar puntero en el issue GGL-P0-HUECOS.*