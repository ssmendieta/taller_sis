# Evidencias del Sprint 3 (ABC-404)

## Actualización de ABC-409

El corte histórico de este paquete refleja el estado de 06/11. Para el cierre
administrativo actualizado al 12/11, consultar [cierre-gestion.md](cierre-gestion.md)
y los [reportes individuales de commits](commits/README.md). No completar causas
de pendientes del Sprint 2 sin confirmación de los responsables.

Las [correcciones locales del 12/11](correcciones-locales-2026-11-12.md) registran
el alcance implementado, las pruebas ejecutadas y los pendientes de aplicación.

Paquete de evidencias para la rúbrica y la demo. Subtarea S3-20.04.
Corte: **06/11/2026**, rama `develop` en `41ad432`. Cada fila indica si la
evidencia existe en el repositorio, si es **real** (servicios y base reales) o
**simulada** (dobles, emulador o base en memoria), y qué falta. No se declara
como hecha ninguna evidencia que todavía no está en el repositorio.

- Guion de la demo: [demo-20-min.md](demo-20-min.md)
- Jira: `https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-…`
- Commits: `https://github.com/ssmendieta/taller_sis/commit/<hash>`

## 1. Estado del paquete

| Entregable | Dónde | Estado al corte |
| --- | --- | --- |
| Diagramas de clases (ABC-405) | `docs/diagramas/sprint-3/README.md` | **Pendiente**: la carpeta no existe en `develop` |
| Secuencias síncronas (ABC-406) | `docs/diagramas/sprint-3/README.md` | **Pendiente** |
| Secuencias asíncronas: outbox/inbox, ACK tras commit, duplicados (ABC-407) | `docs/diagramas/sprint-3/README.md` | **Pendiente**. Existen diagramas de sprints anteriores en `docs/diagramas/` (contabilidad, inventarios, cierre, boleta) |
| PNG/PDF legibles de cada diagrama | `docs/diagramas/sprint-3/` | **Pendiente** |
| Captura real de Google Cloud Pub/Sub con fecha/hora, cuerpo y `messageId` (ABC-389) | Sección 4 | **Pendiente**. Las pruebas de demanda (ABC-355/356/357) y de cierre contable (ABC-349) usaron el **emulador** |
| Captura de Docker con Producción, Logística, frontend y health checks (ABC-403) | `docs/despliegue/sprint-3.md` | **Parcial**: hay evidencia del 03/11 de `produccion-service` y `logistica-service` *healthy* ([ABC-400](ABC-gemina-rutas-docker.md)); falta `docs/despliegue/sprint-3.md`, el frontend y la prueba de humo |
| Guion de demo de 20 minutos | [demo-20-min.md](demo-20-min.md) | **Preparado**; ensayo cronometrado **pendiente** |
| Datos de demostración | [demo-20-min.md § 2](demo-20-min.md#2-preparación-antes-de-la-demo) | **Preparados como pasos y scripts**; no ejecutados en un entorno de demo |
| Nombres reales de PM y PO | Sección 6 | **Pendiente** (lo completa el equipo) |
| Explicación de pendientes del Sprint 2 | Sección 6 | **Pendiente** (lo completa el equipo) |
| Reportes individuales de commits (26/10–12/11/2026) | Sección 5 | Tabla al corte y comandos; el reporte final se genera el 12/11 |
| Envío al LMS | Sección 7 | Lo realiza y confirma el líder |

## 2. HU elegidas para la demo

La selección se ajusta a lo que está terminado en `develop`. La HU sugerida
ABC-394 no aparece en ningún commit, y la integración ABC-384 (evento de salida
a Inventarios) aún no está implementada: Logística no tiene outbox (ABC-386).

| Bloque | HU | Por qué |
| --- | --- | --- |
| Producción | [ABC-74](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-74) [S3-04] Pérdidas de materia prima | API e interfaz completas (ABC-314/315/316), sin dependencias externas |
| Producción (apoyo) | [ABC-70](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-70) [S3-03] Verificar materiales antes de iniciar | API e interfaz (ABC-311/312) con evidencia en Docker |
| Logística | [ABC-374](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-374) [S3-14] Despacho y entrega | Estados (ABC-375), API (ABC-376) e interfaz (ABC-377) |
| Logística (apoyo) | [ABC-368](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-368) [S3-13] Rutas y [ABC-115](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-115) [S3-11] Recursos del ERP | La ruta y sus recursos se preparan antes; se muestra su vigencia y la copia de respaldo |
| Integración adicional | [ABC-122](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-122) [S3-01] Demanda por Pub/Sub | Inbox transaccional, duplicados y rechazos (ABC-355 a 358). En vivo con emulador; la evidencia real es ABC-389 |

Si ABC-384/386 se terminan antes de la demo, pueden reemplazar a ABC-122 en el
bloque de integración. En ese caso hay que actualizar esta tabla y el guion.

## 3. Cobertura por HU según el repositorio

Incluye solo las HU con commits en `develop` del 26/10 al 06/11/2026. La matriz
completa de las 20 HU debe contrastarse con Jira. Tipos de evidencia: **real**
(servicios en Docker con PostgreSQL), **simulada** (emulador, dobles o base en
memoria) y **unitaria**.

| HU | Subtareas con commit | Evidencia en el repo | Tipo | Pendiente |
| --- | --- | --- | --- | --- |
| [ABC-122](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-122) Demanda por Pub/Sub | ABC-355 `a49f199`, ABC-356 `cff5590`, ABC-357 `df312ed`, ABC-358 `dfd1ea0` | [Gemina: demanda](ABC-gemina-observaciones-historial-demanda.md), [ABC-358](ABC-358.md) | Simulada (emulador) y real (consulta en Docker) | ABC-359: Pub/Sub real |
| [ABC-130](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-130) Confirmación de demanda | ABC-364 `aa8a4b3` | [ABC-364](ABC-364.md) | Real (PostgreSQL en Docker) | Demás subtareas de la HU |
| [ABC-70](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-70) Verificar materiales | ABC-311 `8353668`, ABC-312 `f502b88` | [ABC-311](ABC-311.md), [ABC-312](ABC-312.md) | Real (Docker) | — |
| [ABC-74](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-74) Pérdidas de materia prima | ABC-314 `8fef6c0`, ABC-315 `0628f49`, ABC-316 `f27ba4c` | Pruebas en `perdidas-materia-prima/` y `frontend/scripts/perdidas-materia-prima.test.mjs` | Simulada; prueba con PostgreSQL escrita (`PERDIDAS_DB_REAL=1`), no ejecutada | Evidencia con PostgreSQL/Docker |
| [ABC-100](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-100) Observaciones de la orden | ABC-321 `473ae57`, ABC-322 `13b3cae`, ABC-323 `90b2c4a` | [Gemina: observaciones](ABC-gemina-observaciones-historial-demanda.md) | Real (API vía Docker) | — |
| [ABC-114](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-114) Cierre contable | ABC-349 `64caad9` | [ABC-349](ABC-349.md) | Simulada (emulador) | Pub/Sub real |
| [ABC-115](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-115) Recursos del ERP | ABC-350 `eb024e7`, ABC-351 `1888a26`, ABC-352 `697358d`, ABC-353 `8ef9d44` | [ABC-352](ABC-352.md), [contrato v1](../../integraciones/recursos-logisticos-v1.md) | Simulada (ERP local en pruebas) | ERP o simulador en Docker |
| [ABC-128](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-128) Agrupación de solicitudes | ABC-360 `62453cb`, ABC-361 `6e706dc` | [Gemina: rutas](ABC-gemina-rutas-docker.md) | Unitaria | Entidad de grupo (ABC-362) |
| [ABC-368](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-368) Rutas con vehículo y chofer | ABC-369 `f699937`, ABC-370 `8e9a7d9`, ABC-371 `28a427a` | [Gemina: rutas](ABC-gemina-rutas-docker.md) (369/370), `rutas/rutas.asignacion.spec.ts` (371) | Real (369/370); simulada (371) | Pantalla de planificación (CA-05) |
| [ABC-374](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-374) Despacho y entrega | ABC-375 `caad7b4`, ABC-376 `be32743`, ABC-377 `204ae62` | [Gemina: rutas](ABC-gemina-rutas-docker.md) (375), `despacho/*.spec.ts`, `frontend/scripts/despacho-ruta.test.mjs` | Unitaria y simulada | Evento a Inventarios (ABC-384/386) |
| [ABC-379](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-379) Incidencias y reprogramación | ABC-380 `bf7eb03`, ABC-382 `912b217` | `incidencias/*.spec.ts`, `frontend/scripts/incidencias-ruta.test.mjs` | Simulada; prueba con PostgreSQL escrita, no ejecutada | Endpoints ABC-381 |
| [ABC-390](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-390) Historial de rutas | ABC-391 `32690dc`, ABC-392 `9dbd877` | [Gemina: historial](ABC-gemina-observaciones-historial-demanda.md) | Real (API vía gateway) | ABC-393 |
| [ABC-110](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-110) Reportes logísticos | ABC-340 `d7a0f2e` | `reportes/*.spec.ts`, [README](../../../services/logistica-service/src/reportes/README.md) | Simulada; prueba con PostgreSQL escrita, no ejecutada | Vista previa, PDF y Excel |
| [ABC-399](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-399) Entorno Docker | ABC-400 `cd98648` | [Gemina: Docker](ABC-gemina-rutas-docker.md) | Real | ABC-403 prueba de humo |
| [ABC-404](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-404) Diagramas | — | Este paquete | — | ABC-405, 406 y 407 |

Fuera del alcance del Sprint 3: los dashboards ABC-106/107 son del Sprint 4,
aunque ya tienen sus primeros endpoints (ABC-324 `41f2404` y ABC-328 `6af9771`).
También hay commits sin HU identificable en el repositorio: ABC-318 `9f16fc0`
(avances de producción). Su HU se debe anotar desde Jira.

### Pruebas con PostgreSQL real pendientes de ejecutar

Están escritas y se omiten si la variable no está activa. Para ejecutarlas hay
que levantar el PostgreSQL de Docker, correr el comando desde el servicio y
adjuntar la salida:

| Prueba | Comando (PowerShell) |
| --- | --- |
| Pérdidas (ABC-314/315) | `cd services/produccion-service; $env:PERDIDAS_DB_REAL='1'; npx jest perdidas-materia-prima` |
| Incidencias tras reinicio (ABC-380) | `cd services/logistica-service; $env:LOGISTICA_DB_REAL='1'; npx jest src/incidencias` |
| Totales del reporte (ABC-340) | `cd services/logistica-service; $env:LOGISTICA_DB_REAL='1'; npx jest src/reportes` |

## 4. Pub/Sub real (ABC-389) — pendiente

La captura debe tomarse de la **consola de Google Cloud** o de `gcloud` contra
el proyecto real. No sirve el emulador. Debe mostrar:

- fecha y hora de publicación o recepción;
- cuerpo del mensaje con `eventId`, `eventType` y `correlationId`;
- `messageId` asignado por Google, el mismo que guardó el outbox o el inbox del
  servicio (por ejemplo, la columna `messageId` de `eventos_inbox`);
- nombre del topic o la suscripción, sin credenciales ni claves.

Como referencia, el Sprint 2 ya tuvo una publicación real
([boleta-v1](../../contratos-internos/boleta-v1.md), `messageId`
`22046936713059191`). **No sustituye** la evidencia del Sprint 3.

## 5. Commits por persona

Período 26/10–12/11/2026. Commits sin merges en todas las ramas, contados por autor de git al
**06/11/2026**. El reporte final se regenera el 12/11 con el mismo comando.
Quien no tiene commits en el período no aparece.

| Autor (git) | Commits |
| --- | --- |
| GeminaPonce27 | 17 |
| TatianaPattzy27 | 12 |
| 4ndrespabon | 7 |
| ssmendieta | 1 |

```bash
git fetch --all
git log --all --since=2026-10-26 --until=2026-11-13 --no-merges --format="%an" | sort | uniq -c | sort -rn
git log --all --since=2026-10-26 --until=2026-11-13 --no-merges --author="TatianaPattzy27" --format="%h %ad %s" --date=short
```

## 6. Cierre (lo completa el equipo)

| Dato | Valor |
| --- | --- |
| Product Owner (presenta la demo) | *Pendiente* |
| Project Manager | *Pendiente* |
| Pendientes del Sprint 2 y su explicación | *Pendiente* |
| Fecha y duración real del ensayo | *Pendiente* ([demo-20-min.md § 5](demo-20-min.md#5-ensayo-cronometrado)) |

## 7. Paquete para el LMS (lo envía el líder)

| # | Entregable | Estado al corte |
| --- | --- | --- |
| 1 | Enlace al repositorio y commit final de `develop` | Disponible |
| 2 | Este README y el guion de la demo | Disponible |
| 3 | Diagramas de clases y secuencia (fuentes, PNG y PDF) | Pendiente (ABC-405/406/407) |
| 4 | Captura real de Pub/Sub (ABC-389) | Pendiente |
| 5 | Captura de Docker con health checks y frontend (ABC-403) | Parcial |
| 6 | Reporte de commits por persona | Tabla al corte; final el 12/11 |
| 7 | Evidencias por HU (sección 3) | Disponible; con pendientes señalados |
| 8 | Video o registro de la demo, si la rúbrica lo pide | Pendiente |

El líder confirma el envío y su fecha en Jira. Antes de enviar, cada fila
pendiente debe estar resuelta o explicada.
