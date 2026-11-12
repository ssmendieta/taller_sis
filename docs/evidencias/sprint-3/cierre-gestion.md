# Cierre de gestión — Sprint 3 (ABC-409)

Corte de verificación: **12/11/2026**. Sprint Jira: **ABC Sprint 3** (id 72). Ventana de la rúbrica: 26/10–12/11, America/La_Paz. La fecha técnica de inicio `2026-10-27T00:04Z` corresponde al 26/10 a las 20:04 en La Paz. Paquete local preparado para la subtarea [ABC-409](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-409); no constituye un cierre aprobado.

## Responsables confirmados por el equipo

- **Project Manager:** Diana Tatiana Patzy Gomez, según confirmación del equipo. Responsable de mantener Jira actualizado y contrastar estados con criterios y evidencias. Jira muestra la variante “Pattzy” (`DIANA TATIANA PATTZY GOMEZ`); su actividad de Git aparece bajo `TatianaPattzy27` / `tpattzyg@gmail.com`. Para el nombre se conserva la grafía proporcionada por el equipo y se deja visible la diferencia con Jira.
- **Product Owner:** Andres Ignacio Pabon Sotomayor (`ANDRES IGNACIO PABON SOTOMAYOR` en Jira). Responsable de presentar la demo.

## Jira al corte

Consulta de las 20 historias de ABC Sprint 3 realizada el 12/11/2026. Los estados reflejan Jira y no certifican por sí solos las pruebas o evidencias técnicas.

| Estado Jira | Historias |
| --- | --- |
| Listo (18) | ABC-70, ABC-74, ABC-100, ABC-105, ABC-108, ABC-109, ABC-110, ABC-115, ABC-122, ABC-128, ABC-130, ABC-368, ABC-374, ABC-379, ABC-384, ABC-390, ABC-394, ABC-399 |
| En curso (2) | ABC-114, ABC-404 |

[ABC-408](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-408) figura Listo en Jira. [ABC-409](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-409) aún figura Por hacer; ABC-404 figura En curso.

La consulta directa de las **82 subtareas** bajo esas historias devuelve 80 Listo, 1 En curso y 1 Por hacer. Las pendientes o activas al corte son:

| Subtarea | Estado | Responsable Jira | Estimación declarada |
| --- | --- | --- | ---: |
| ABC-347 | En curso | Andrea Carolina Narváez Ortega | 3 h |
| ABC-409 | Por hacer | Sergio Samuel Mendieta Barrera | 4 h |

Las estimaciones aparecen en el resumen de cada subtarea; no se sustituyen por tiempos trabajados. ABC-373/ABC-368 y ABC-403/ABC-399 ahora figuran Listo; ABC-406 también figura Listo. Consultas reproducibles: `project = ABC AND sprint = 72` y `parent in (...)` con las 20 claves anteriores; la segunda devuelve las subtareas aunque no tengan sprint propio. Se consultó Jira en modo lectura, sin transiciones ni comentarios.

## Pendientes arrastrados del Sprint 2

**Aclaración:** [ABC-276](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-276) está en el backlog, según confirmación del equipo. La consulta directa devuelve Por hacer y sin sprint asignado; no se considera un pendiente arrastrado del Sprint 2. Su subtarea ABC-279 tampoco demuestra arrastre. No hace falta atribuir una causa a ABC-276 para este cierre.

La consulta `project = ABC AND sprint = 36 AND issuetype = Story` devuelve 20 historias, todas actualmente Listo: ABC-71, ABC-72, ABC-73, ABC-75, ABC-78, ABC-79, ABC-82, ABC-83, ABC-113, ABC-120, ABC-121, ABC-123, ABC-124, ABC-125, ABC-126, ABC-127, ABC-129, ABC-294, ABC-299 y ABC-305. No se detectan pendientes actuales en ese conjunto. Este estado actual no demuestra cuándo se terminaron ni cómo estaban al cierre del Sprint 2: falta validación de PM y responsables sobre eventuales arrastres históricos y sus causas. No se fabrica una explicación de retraso ni se declara que nunca lo hubo.

## Reportes individuales

Los reportes con autor Git, fecha, SHA, clave Jira y mensaje están en [commits/README.md](commits/README.md), siguiendo [las reglas Git](../../GIT.md). Se excluyen merges; commits cuyo mensaje no contiene clave Jira aparecen señalados sin asociación inferida. Los dos commits locales de Sergio se distinguen de los publicados y no se les inventa un enlace remoto. El corte se debe regenerar si hay commits nuevos hasta el fin del 12/11. Cada integrante debe validar su identidad Git y su reporte.

## Paquete local y límite de validación

- [Índice de evidencias](README.md), [guion de demo](demo-20-min.md), [reportes individuales](commits/README.md) y [correcciones locales verificadas](correcciones-locales-2026-11-12.md).
- Todo este ajuste queda en `RamaSergio`, sin commits nuevos ni publicación. La lista de commits no cuenta archivos modificados sin commit.
- Por instrucción expresa del usuario no se modifica Pub/Sub, su configuración ni sus recursos compartidos. El riesgo identificado se acepta para este trabajo; esa aceptación no equivale a demostrar los criterios de integración real de Jira.

## Confirmaciones que faltan para completar el cierre

- Resolver la diferencia ortográfica del apellido de Diana antes de la entrega formal, contrastándola con el nombre oficial del equipo.
- Validación de PM/responsables sobre arrastres históricos reales del Sprint 2: **pendiente de confirmación**. Si no los hubo, registrar esa confirmación; si los hubo, documentar solo causas verificadas. ABC-276 queda excluida.
- Confirmación individual de autoría y reportes; publicación autorizada de los dos SHA exclusivamente locales: **pendiente**.
- Cumplimiento de la autoevaluación confidencial por cada integrante: **pendiente de confirmar**; no guardar respuestas.
- Fecha/duración real del ensayo de demo: **pendiente de registrar**.
- Entrega individual de reportes en el LMS y envío del paquete por el líder: **pendientes de confirmar**.

No se cambia el estado de Jira hasta adjuntar evidencia y validar los pendientes requeridos por ABC-409.
