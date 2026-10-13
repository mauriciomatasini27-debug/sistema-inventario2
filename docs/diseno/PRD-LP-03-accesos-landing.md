# PRD-LP-03 - Accesos a la app desde la landing (R3)

Fuente: auditoría panel 3 workers (`SiteHeader.astro`, `Hero.astro`, `business.ts:293-298` sin ningún link a app; `consultoria/web` tampoco los tenía: hay que crearlos, no copiarlos). Restringido por ADR-0030, ADR-0010, ADR-0022 (E10 acotado, E4 `noindex` vigente).

Alcance decidido: solo botones + copy en `business.ts`. Sin backend propio, sin tocar el `nav` de anclas, sin canvas ni dependencias.

## Épica LP3-E1. Header con entrada

Requisito LP3-1: el visitante que ya es cliente o admin entra desde el header sin scrollear.

- Historia LP3-S1. CTA `Mi comercio` en `SiteHeader` (junto a `Pedir demo`) con `href` desde `accesos.comercio` (`/api/auth/login?next=/panel`). AC: Given abro `/` When miro el header Then veo `Pedir demo` y `Mi comercio`, y Given clickeo `Mi comercio` Then el navegador pide `GET /api/auth/login?next=/panel`. ADR: 0030. Talla S. Depende de: LP3-S3, PRD-AU-02 (el `next` debe existir para que el destino funcione).
- Historia LP3-S2. Link `Admin` discreto en `SiteHeader` con `href` desde `accesos.admin` (`/api/auth/login?next=/admin`), sin romper el `nav` de anclas. AC: Given abro `/` When miro el header Then veo `Admin` separado del nav de secciones, y Given clickeo Then el navegador pide `GET /api/auth/login?next=/admin`. ADR: 0030. Talla S. Depende de: LP3-S3, PRD-AU-02.

## Épica LP3-E2. Hero con segunda fila de acceso

Requisito LP3-2: el hero ofrece la entrada sin quitarle fuerza al `Pedir demo`.

- Historia LP3-S3. Objeto `accesos` en `business.ts` (labels + hrefs, contrato ADR-0030) como única fuente de ambos accesos. AC: Given leo `business.ts` When busco `Mi comercio` y `Admin` Then ambos viven en `accesos` y ningún `.astro` hardcodea esos labels o hrefs. ADR: 0030, 0010. Talla S. Depende de: nada.
- Historia LP3-S4. Fila secundaria en `Hero` con `Mi comercio` y `Admin` (variante `ghost-dark`, `Button` siempre `<a>`). AC: Given abro `/` When miro el hero Then bajo `Pedir demo`/`Ver checklist` veo `Mi comercio` y `Admin` con los hrefs de `accesos`. ADR: 0030. Talla S. Depende de: LP3-S3.

## Épica LP3-E3. Coherencia de entradas existentes

Requisito LP3-3: ningún texto "Entrar" miente sobre su destino.

- Historia LP3-S5. `alta/estado.astro:46` (`Entrar a mi comercio` con `href="/"`) apunta a `/panel`. AC: Given termino el alta When clickeo `Entrar a mi comercio` Then el navegador pide `/panel`, no `/`. ADR: 0030. Talla XS. Depende de: nada.

## Dependencias externas

LP3-S1 y LP3-S2 esperan a LP3-S3 (copy) y a PRD-AU-02 (el `next` en login/callback; sin eso los botones llegan al destino equivocado). LP3-S4 espera a LP3-S3. LP3-S5 es independiente.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Header comercio | Clic `Mi comercio` | `GET /api/auth/login?next=/panel` (302 a Google) |
| Feliz | Header admin | Clic `Admin` | `GET /api/auth/login?next=/admin` (302 a Google) |
| Feliz | Hero secundario | Inspección hero | `Mi comercio` y `Admin` con hrefs de `accesos` |
| Fallo | `next` aún sin implementar | Clic con AU-02 pendiente | Llega al login igual; destino por defecto actual (se documenta como dependencia, no como error) |
| Regresión | Estructura fija | Build Astro | 19 secciones en orden, `nav` solo anclas, `/panel`/`/venta`/`/admin` con `noindex` |

Arch-tests: AT1 `business.ts` sigue única fuente (extender `tests/landing.test.ts`: labels y hrefs de acceso solo importan de `accesos`). AT2 `Button` siempre `<a>` (los accesos no introducen `<button>`). AT3 ningún href a `/panel`/`/admin` dentro del `nav` de anclas.
