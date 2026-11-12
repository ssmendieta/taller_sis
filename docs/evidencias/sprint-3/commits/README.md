# Reportes individuales de commits — Sprint 3

Corte consultado: **12/11/2026**, con `origin/develop` en `f977f5cf602cfe7bf8b9efec946fbb578b36dfde` y `RamaSergio` en `98b15f13ce74b59b3ea34d97d43e444afdb92973`. Ventana inclusiva por fecha de autor: 26/10/2026–12/11/2026, zona `America/La_Paz`.

Se toma la unión sin duplicados por SHA de ambas referencias, no todas las ramas del repositorio. Se vincula cada autor por el correo Git observado y se excluyen merges y los dos commits firmados por Codex, que no se atribuyen a ningún integrante. Cada informe incluye fecha, SHA, enlace remoto cuando existe, clave Jira explícita y asunto original. La ausencia de clave queda visible para que el equipo confirme su asociación. El número de commits no mide esfuerzo ni acredita por sí solo cumplimiento de Jira.

| Integrante | Informe | Commits |
| --- | --- | ---: |
| Sergio Samuel Mendieta Barrera | [sergio-mendieta.md](sergio-mendieta.md) | 20 (18 remotos + 2 locales) |
| Andrés Ignacio Pabón Sotomayor | [andres-ignacio-pabon.md](andres-ignacio-pabon.md) | 15 |
| Diana Tatiana Patzy Gomez | [diana-tatiana-patzy-gomez.md](diana-tatiana-patzy-gomez.md) | 16 |
| Gemina Ponce | [gemina-ponce.md](gemina-ponce.md) | 33 |
| Andrea Carolina Narváez Ortega | [andrea-carolina-narvaez.md](andrea-carolina-narvaez.md) | 18 |

Este es un corte al 12/11; si se incorporan commits adicionales antes del cierre del día, regenerar los informes. Los SHA `a3ccab240dbb72b4d3b9f5675ea9d661344e96c7` y `98b15f13ce74b59b3ea34d97d43e444afdb92973` existen solo localmente al corte: se verifican con `git show <SHA>`; no se inventan enlaces de GitHub. Los ajustes actuales sin commit no incrementan ningún conteo.

Para reproducir: `git log origin/develop RamaSergio --no-merges --format="%H%x09%aI%x09%an%x09%ae%x09%s"`; filtrar `%aI` entre `2026-10-26T00:00:00-04:00` (incluido) y `2026-11-13T00:00:00-04:00` (excluido), agrupar por los correos indicados en cada informe y ordenar por fecha. Se usa la fecha de autor de forma explícita; `git log --since` por sí solo filtra por fecha de commit y no sustituye este filtro. Identificar commits sin publicar con `git log RamaSergio --not --remotes --no-merges`.

Identidades y contenido pendientes de confirmación individual. Entrega LMS y envío por el líder pendientes; véase [cierre de gestión](../cierre-gestion.md) y [reglas Git](../../../GIT.md). No se hizo commit, push ni cambio de Jira durante este ajuste.
