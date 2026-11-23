---
id: PRD-AUD-03
tipo: prd
estado: propuesto
modulos: [design-system, persistencia]
depende_de: [ADR-0127, PRD-AUD-01, PRD-AUD-02]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Auditoría de UI/UX: trazar cada pantalla y campo a su handler, repo y columna, y verificar navegación y funcionalidad. Alcance acotado a las pantallas principales.
---
# PRD-AUD-03 - Auditoría de UI/UX (pantalla ↔ código ↔ base de datos)

Fuente: iniciativa de auditoría integral base ↔ código ↔ UI/UX. Restringido por ADR-0127. Depende de PRD-AUD-01 y PRD-AUD-02.

## Problema

Un campo puede existir en la base y en el código pero no en la UI (o al revés), así que no se puede afirmar "está funcional" sin trazabilidad de punta a punta. Hoy no hay un registro que conecte pantalla → handler → repo → columna, ni un checklist de navegación que confirme que cada pantalla carga y persiste.

## Épica AUD-E3. Auditoría de UI/UX

Requisito AUD-R3: cada campo de las pantallas principales debe quedar trazado a su columna y verificado funcionalmente.

- Historia AUD-S5. Registro de trazabilidad por módulo (`docs/roadmap/auditorias/trazabilidad-<modulo>.md`) que mapea pantalla → handler → repo → columna, y marca campos huérfanos (sin columna) o columnas sin pantalla. AC: Given una pantalla When la trazo Then cada campo tiene su columna y no quedan campos sin origen. ADR: 0127. Talla L. Depende de: PRD-AUD-02.
- Historia AUD-S6. Checklist de navegación: recorrer las pantallas principales (panel, venta, caja, stock, proveedores, servicios, pagos, fiscal) y confirmar carga y guardado contra el registro de trazabilidad. AC: Given el checklist When recorro cada pantalla Then carga, guarda y relee sin errores, con evidencia por pantalla. ADR: 0127. Talla L. Depende de: AUD-S5.

## Dependencias externas

Entorno local o de piloto con las pantallas accesibles (WSL2 o preview de Vercel). Para validación visual, control-app (ADR-0111) deja PNG más JSON por pantalla.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Campo trazado | pantalla → handler → repo → columna | cadena completa sin huecos |
| Fallo | Campo huérfano | campo sin columna | el registro lo marca como hallazgo |
| Fallo | Pantalla rota | pantalla que no carga | el checklist la reporta con evidencia |
