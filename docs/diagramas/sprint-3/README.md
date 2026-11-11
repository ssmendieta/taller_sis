# Diagramas del Sprint 3 (ABC-404)

Diagramas del incremento del Sprint 3, trazados al código de `develop` al
10/11/2026. Cada diagrama tiene su **fuente editable** (`.mmd`, Mermaid) y sus
exportaciones **SVG, PNG y PDF**. Las fuentes son las que se actualizan; las
exportaciones se regeneran con el comando de la sección 4.

| Subtarea | Contenido | Carpeta | Estado |
| --- | --- | --- | --- |
| ABC-405 | Diagramas de clases de produccion-service y logistica-service | `clases/` | **Pendiente** (Andrés) |
| ABC-406 | Secuencias de integración con Contabilidad e Inventarios | `secuencia/` | **Pendiente** (Andrea) |
| ABC-407 | Secuencias de demanda, rutas y despacho, y escenarios agrupados | `secuencia/01` a `08` | **Hecho** |

## 1. Secuencias de ABC-407

| N.º | Diagrama | HU | Qué muestra |
| --- | --- | --- | --- |
| 01 | [Recepción de demanda](secuencia/01-demanda-recepcion.svg) ([PNG](secuencia/01-demanda-recepcion.png), [PDF](secuencia/01-demanda-recepcion.pdf)) | ABC-122 | Inbox transaccional, ACK tras el commit, duplicados por eventId y por id externo, rechazos trazados, NACK ante fallo transitorio |
| 02 | [Confirmación de demanda](secuencia/02-demanda-confirmacion.svg) ([PNG](secuencia/02-demanda-confirmacion.png), [PDF](secuencia/02-demanda-confirmacion.pdf)) | ABC-130 | La misma demanda pasa a CONFIRMADA; confirmación que llega antes que la demanda queda PENDIENTE y se reprocesa |
| 03 | [Agrupación y planificación de ruta](secuencia/03-ruta-planificacion.svg) ([PNG](secuencia/03-ruta-planificacion.png), [PDF](secuencia/03-ruta-planificacion.pdf)) | ABC-128, ABC-368, ABC-115 | Reglas de compatibilidad, consulta al ERP fuera de la transacción, bloqueos por recurso y día, boletas emitidas, capacidad |
| 04 | [Despacho y entrega](secuencia/04-ruta-despacho-entrega.svg) ([PNG](secuencia/04-ruta-despacho-entrega.png), [PDF](secuencia/04-ruta-despacho-entrega.pdf)) | ABC-374, ABC-384 | Bloqueo de ruta, paradas y boletas; evento de salida en el mismo commit; entrega parcial; cierre de la ruta |
| 05 | [Incidencia y reprogramación](secuencia/05-ruta-incidencia-reprogramacion.svg) ([PNG](secuencia/05-ruta-incidencia-reprogramacion.png), [PDF](secuencia/05-ruta-incidencia-reprogramacion.pdf)) | ABC-379 | Preparación fuera de la transacción, revalidación de recursos, rollback sin cambios parciales, fecha original |
| 06 | [Inicio de orden con verificación de materiales](secuencia/06-produccion-inicio-orden.svg) ([PNG](secuencia/06-produccion-inicio-orden.png), [PDF](secuencia/06-produccion-inicio-orden.pdf)) | ABC-70 | Consulta asíncrona a Inventarios y bloqueo del inicio con faltantes |
| 07 | [Ejecución de la orden (agrupado)](secuencia/07-produccion-ejecucion.svg) ([PNG](secuencia/07-produccion-ejecucion.png), [PDF](secuencia/07-produccion-ejecucion.pdf)) | ABC-74, ABC-100, ABC-105, ABC-394 | Mermas, observaciones e incidencias, avance y reproceso con saldo defectuoso |
| 08 | [Historiales y reportes (agrupado)](secuencia/08-consultas-historiales-reportes.svg) ([PNG](secuencia/08-consultas-historiales-reportes.png), [PDF](secuencia/08-consultas-historiales-reportes.pdf)) | ABC-108, ABC-109, ABC-390, ABC-110 | Consultas paginadas de solo lectura, detalle de ruta aislado, vista previa y exportación con los mismos filtros |

## 2. Matriz de las 20 HU del Sprint 3

"Pendiente" indica que el diagrama todavía no existe en el repositorio. Las HU
marcadas con ★ son las elegidas para la demo (ver
[`docs/evidencias/sprint-3/README.md`](../../evidencias/sprint-3/README.md)).

| HU | Título | Secuencia | Clases (ABC-405) | Integración (ABC-406) |
| --- | --- | --- | --- | --- |
| ABC-122 ★ | [S3-01] Recibir demanda por Pub/Sub | 01 | Pendiente | — |
| ABC-130 | [S3-02] Recibir confirmación de demanda | 02 | Pendiente | — |
| ABC-70 ★ | [S3-03] Verificar materiales antes de iniciar | 06 | Pendiente | Inventarios: pendiente |
| ABC-74 ★ | [S3-04] Pérdidas de materia prima | 07 | Pendiente | — |
| ABC-100 | [S3-05] Observaciones e incidencias de la orden | 07 | Pendiente | — |
| ABC-105 | [S3-06] Consultar avance de la orden | 07 | Pendiente | — |
| ABC-394 | [S3-07] Reproceso de defectuosas | 07 | Pendiente | — |
| ABC-108 | [S3-08] Historial de producción | 08 | Pendiente | — |
| ABC-109 | [S3-09] Reportes de producción | 08 | Pendiente | — |
| ABC-114 | [S3-10] Consumos y costos a Contabilidad | — | Pendiente | Contabilidad: pendiente |
| ABC-115 | [S3-11] Vehículos y choferes del ERP | 03 (consulta y respaldo) | Pendiente | — |
| ABC-128 | [S3-12] Priorizar y agrupar solicitudes | 03 | Pendiente | — |
| ABC-368 ★ | [S3-13] Asignar vehículo y chofer a una ruta | 03 | Pendiente | — |
| ABC-374 ★ | [S3-14] Despacho y entrega | 04 | Pendiente | — |
| ABC-379 | [S3-15] Incidencias y reprogramación | 05 | Pendiente | — |
| ABC-384 | [S3-16] Notificar despachos a Inventarios | 04 (evento en el commit) | Pendiente | Inventarios: pendiente |
| ABC-390 | [S3-17] Historial de rutas y entregas | 08 | Pendiente | — |
| ABC-110 | [S3-18] Reportes logísticos | 08 | Pendiente | — |
| ABC-399 | [S3-19] Despliegue con Docker | No aplica (infraestructura) | — | — |
| ABC-404 | [S3-20] Clases y secuencias | Este documento | — | — |

## 3. Legibilidad

Las exportaciones se revisaron visualmente el 10/11/2026: texto a 15 px, PNG a
escala 2, numeración de pasos (`autonumber`) y fondo blanco para impresión. Los
PDF se ajustan al tamaño del diagrama (una página por diagrama).

## 4. Regenerar las exportaciones

Requiere Node.js. Desde `docs/diagramas/sprint-3/secuencia`:

```powershell
npm install --prefix $env:TEMP\mmdc @mermaid-js/mermaid-cli@11.4.2
'{"sequence":{"useMaxWidth":false,"wrap":true,"width":180,"messageFontSize":15,"actorFontSize":15,"noteFontSize":14}}' | Set-Content $env:TEMP\mmdc\config.json
Get-ChildItem *.mmd | ForEach-Object {
  $n = $_.BaseName
  & "$env:TEMP\mmdc\node_modules\.bin\mmdc.cmd" -i $_.Name -o "$n.svg" -c "$env:TEMP\mmdc\config.json" -b white
  & "$env:TEMP\mmdc\node_modules\.bin\mmdc.cmd" -i $_.Name -o "$n.png" -c "$env:TEMP\mmdc\config.json" -b white -s 2
  & "$env:TEMP\mmdc\node_modules\.bin\mmdc.cmd" -i $_.Name -o "$n.pdf" -c "$env:TEMP\mmdc\config.json" -b white -f
}
```
