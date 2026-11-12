# Diagramas del Sprint 3 (ABC-404)

Diagramas del incremento del Sprint 3, trazados al código de `develop` al
11/11/2026. Cada diagrama tiene su **fuente editable** (`.mmd`, Mermaid) y sus
exportaciones **SVG, PNG y PDF**. Las fuentes son las que se actualizan; las
exportaciones se regeneran con el comando de la sección 5.

| Subtarea | Contenido | Carpeta | Estado |
| --- | --- | --- | --- |
| ABC-405 | Diagramas de clases de produccion-service y logistica-service | [`clases/`](clases/) | **Hecho** (Andrés) |
| ABC-406 | Secuencias de integración con Contabilidad e Inventarios | [`secuencia/`](secuencia/) | **Pendiente** (Andrea) |
| ABC-407 | Secuencias de demanda, rutas y despacho, y escenarios agrupados | [`secuencia/`](secuencia/) (`01` a `08`) | **Hecho** |

---

## 1. Diagramas de Clases de ABC-405

Modelan la totalidad de las **40 entidades relacionales TypeORM** implementadas en `produccion-service` y `logistica-service`. Reflejan fielmente los tipos de columna, claves primarias (`PK`), claves foráneas (`FK`), restricciones y cardinalidades de base de datos.

| N.º | Diagrama | Microservicio | Entidades modeladas | Formatos disponibles |
| --- | --- | --- | --- | --- |
| 01 | [Producción Service](clases/01-produccion-service.svg) | `produccion-service`<br>(DB: `produccion_db`) | **23 entidades:** `OrdenProduccion`, `HistorialEstadoOrden`, `AvancesProduccion`, `PerdidaMateriaPrima`, `ObservacionOrden`, `ResultadoConforme`, `Reproceso`, `CierreProduccion`, `Receta`, `RecetaMaterial`, `Material`, `ConsumoMaterial`, `Lote`, `Inventario`, `SolicitudMaterial`, `SolicitudMaterialItem`, `Demanda`, `DemandaItem`, `DemandaRechazada`, `ConsultaDisponibilidad`, `ConsultaDisponibilidadItem`, `EventoOutbox`, `EventoInbox`. | [SVG](clases/01-produccion-service.svg)<br>[PNG](clases/01-produccion-service.png)<br>[PDF](clases/01-produccion-service.pdf) |
| 02 | [Logística Service](clases/02-logistica-service.svg) | `logistica-service`<br>(DB: `logistica_db`) | **17 entidades:** `Ruta`, `RutaParada`, `RutaParadaBoleta`, `BoletaEnvio`, `BoletaEnvioItem`, `BoletaEnvioHistorial`, `SolicitudSalida`, `SolicitudSalidaItem`, `GrupoSalida`, `GrupoSolicitud`, `RecursoExternoSnapshot`, `RecursoExternoVehiculo`, `RecursoExternoChofer`, `IncidenciaTransporte`, `ReprogramacionRuta`, `EventoOutbox`, `EventoInbox`. | [SVG](clases/02-logistica-service.svg)<br>[PNG](clases/02-logistica-service.png)<br>[PDF](clases/02-logistica-service.pdf) |

### Evolución de Entidades: Sprint 2 vs Sprint 3 (CA-05)

En los diagramas de clases, cada entidad cuenta con el estereotipo `<<Sprint 2>>` o `<<Nuevo Sprint 3>>` para identificar con precisión la evolución del modelo de dominio:

#### A. `produccion-service` (23 entidades)
- **Línea base Sprint 2 (12 entidades):** `OrdenProduccion`, `AvancesProduccion`, `ResultadoConforme`, `ConsumoMaterial`, `Receta`, `RecetaMaterial`, `Material`, `Lote`, `Inventario`, `SolicitudMaterial`, `SolicitudMaterialItem`, `CierreProduccion` (snapshot básico de cierre ABC-299).
- **Nuevas entidades Sprint 3 (11 entidades):**
  1. `Demanda` (ABC-122, ABC-130): Almacena órdenes de producción demandadas recibidas asíncronamente desde Pub/Sub.
  2. `DemandaItem` (ABC-122): Detalle de ítems de productos y cantidades solicitadas en la demanda.
  3. `DemandaRechazada` (ABC-122): Trazabilidad y auditoría de mensajes Pub/Sub inválidos o con errores de validación/negocio.
  4. `PerdidaMateriaPrima` (ABC-74): Registro de mermas e incidencias de insumos durante la orden.
  5. `ObservacionOrden` (ABC-100): Registro de observaciones y alertas de turno asociadas a la orden.
  6. `Reproceso` (ABC-394): Control de recuperación y reprocesamiento de unidades defectuosas reportadas por Calidad.
  7. `HistorialEstadoOrden` (ABC-108): Auditoría inmutable de transiciones de ciclo de vida de la orden.
  8. `ConsultaDisponibilidad` (ABC-70): Solicitud asíncrona de disponibilidad de materiales hacia Inventarios antes del inicio.
  9. `ConsultaDisponibilidadItem` (ABC-70): Detalle de cantidades requeridas vs disponibles reportadas por Inventarios.
  10. `EventoOutbox` (ABC-114): Implementación del patrón *Transactional Outbox* para costos a Contabilidad.
  11. `EventoInbox` (ABC-122, ABC-130, ABC-70): Implementación del patrón *Transactional Inbox* para deduplicación e idempotencia.
  - *Ampliación de Sprint 2:* `CierreProduccion` fue ampliado con campos de integración contable (`estado_contable`, `resultado_contable_event_id`, `resultado_contable_en`, `codigo_rechazo_contable`, `detalle_contable`) para ABC-114.

#### B. `logistica-service` (17 entidades)
- **Línea base Sprint 2 (4 entidades):** `SolicitudSalida`, `SolicitudSalidaItem`, `BoletaEnvio` (básica), `BoletaEnvioItem`.
- **Nuevas entidades Sprint 3 (13 entidades):**
  1. `Ruta` (ABC-128, ABC-368, ABC-374, ABC-384): Entidad raíz de despacho con chofer, vehículo, fecha y estado de notificación a inventarios (`inventario_estado`).
  2. `RutaParada` (ABC-368, ABC-374): Secuencia ordenada de destinos de entrega asociados a la ruta.
  3. `RutaParadaBoleta` (ABC-368, ABC-374): Tabla intermedia que asigna boletas de envío a paradas específicas.
  4. `GrupoSalida` (ABC-128): Agrupación lógica de solicitudes de salida por fecha, destino y tipo de carga.
  5. `GrupoSolicitud` (ABC-128): Relación N:M entre grupos de salida y solicitudes.
  6. `RecursoExternoSnapshot` (ABC-115): Respaldo local de vehículos y choferes sincronizados diariamente desde el ERP.
  7. `RecursoExternoVehiculo` (ABC-115, ABC-368): Catálogo de vehículos disponibles, capacidad y placa.
  8. `RecursoExternoChofer` (ABC-115, ABC-368): Catálogo de choferes habilitados y categoría de licencia.
  9. `IncidenciaTransporte` (ABC-379): Registro de eventos mecánicos, climáticos o de tránsito en ruta.
  10. `ReprogramacionRuta` (ABC-379): Ajuste trazable de fecha de entrega manteniendo historial de fechas originales.
  11. `BoletaEnvioHistorial` (ABC-374, ABC-390): Trazabilidad de transiciones de estado de las boletas.
  12. `EventoOutbox` (ABC-384): *Transactional Outbox* para notificaciones `inventarios.salida.v1`.
  13. `EventoInbox` (ABC-384): *Transactional Inbox* para confirmaciones/rechazos de inventarios y datos del ERP.

---

## 2. Secuencias de ABC-407

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

---

## 3. Matriz de las 20 HU del Sprint 3

"Pendiente" indica que el diagrama todavía no existe en el repositorio. Las HU marcadas con ★ son las elegidas para la demo (ver [`docs/evidencias/sprint-3/README.md`](../../evidencias/sprint-3/README.md)).

| HU | Título | Secuencia | Clases (ABC-405) | Integración (ABC-406) |
| --- | --- | --- | --- | --- |
| ABC-122 ★ | [S3-01] Recibir demanda por Pub/Sub | 01 | [produccion-service](clases/01-produccion-service.svg) (`Demanda`, `DemandaItem`, `DemandaRechazada`, `EventoInbox`) | — |
| ABC-130 | [S3-02] Recibir confirmación de demanda | 02 | [produccion-service](clases/01-produccion-service.svg) (`Demanda`, `EventoInbox`) | — |
| ABC-70 ★ | [S3-03] Verificar materiales antes de iniciar | 06 | [produccion-service](clases/01-produccion-service.svg) (`ConsultaDisponibilidad`, `ConsultaDisponibilidadItem`, `OrdenProduccion`) | Inventarios: pendiente |
| ABC-74 ★ | [S3-04] Pérdidas de materia prima | 07 | [produccion-service](clases/01-produccion-service.svg) (`PerdidaMateriaPrima`, `OrdenProduccion`, `Material`) | — |
| ABC-100 | [S3-05] Observaciones e incidencias de la orden | 07 | [produccion-service](clases/01-produccion-service.svg) (`ObservacionOrden`, `OrdenProduccion`) | — |
| ABC-105 | [S3-06] Consultar avance de la orden | 07 | [produccion-service](clases/01-produccion-service.svg) (`AvancesProduccion`, `OrdenProduccion`) | — |
| ABC-394 | [S3-07] Reproceso de defectuosas | 07 | [produccion-service](clases/01-produccion-service.svg) (`Reproceso`, `ResultadoConforme`, `OrdenProduccion`) | — |
| ABC-108 | [S3-08] Historial de producción | 08 | [produccion-service](clases/01-produccion-service.svg) (`HistorialEstadoOrden`, `OrdenProduccion`, `CierreProduccion`) | — |
| ABC-109 | [S3-09] Reportes de producción | 08 | [produccion-service](clases/01-produccion-service.svg) (`OrdenProduccion`, `AvancesProduccion`, `PerdidaMateriaPrima`, `ConsumoMaterial`) | — |
| ABC-114 | [S3-10] Consumos y costos a Contabilidad | — | [produccion-service](clases/01-produccion-service.svg) (`CierreProduccion`, `ConsumoMaterial`, `EventoOutbox`) | Contabilidad: pendiente |
| ABC-115 | [S3-11] Vehículos y choferes del ERP | 03 (consulta y respaldo) | [logistica-service](clases/02-logistica-service.svg) (`RecursoExternoVehiculo`, `RecursoExternoChofer`, `RecursoExternoSnapshot`) | — |
| ABC-128 | [S3-12] Priorizar y agrupar solicitudes | 03 | [logistica-service](clases/02-logistica-service.svg) (`GrupoSalida`, `GrupoSolicitud`, `SolicitudSalida`, `SolicitudSalidaItem`) | — |
| ABC-368 ★ | [S3-13] Asignar vehículo y chofer a una ruta | 03 | [logistica-service](clases/02-logistica-service.svg) (`Ruta`, `RutaParada`, `RecursoExternoVehiculo`, `RecursoExternoChofer`) | — |
| ABC-374 ★ | [S3-14] Despacho y entrega | 04 | [logistica-service](clases/02-logistica-service.svg) (`Ruta`, `RutaParada`, `RutaParadaBoleta`, `BoletaEnvio`, `BoletaEnvioItem`, `BoletaEnvioHistorial`) | — |
| ABC-379 | [S3-15] Incidencias y reprogramación | 05 | [logistica-service](clases/02-logistica-service.svg) (`IncidenciaTransporte`, `ReprogramacionRuta`, `Ruta`, `RutaParada`) | — |
| ABC-384 | [S3-16] Notificar despachos a Inventarios | 04 (evento en el commit) | [logistica-service](clases/02-logistica-service.svg) (`Ruta`, `EventoOutbox`, `BoletaEnvio`) | Inventarios: pendiente |
| ABC-390 | [S3-17] Historial de rutas y entregas | 08 | [logistica-service](clases/02-logistica-service.svg) (`Ruta`, `RutaParada`, `BoletaEnvioHistorial`, `IncidenciaTransporte`) | — |
| ABC-110 | [S3-18] Reportes logísticos | 08 | [logistica-service](clases/02-logistica-service.svg) (`Ruta`, `BoletaEnvio`, `IncidenciaTransporte`, `GrupoSalida`) | — |
| ABC-399 | [S3-19] Despliegue con Docker | No aplica (infraestructura) | No aplica (infraestructura) | — |
| ABC-404 | [S3-20] Clases y secuencias | Este documento | [produccion-service](clases/01-produccion-service.svg), [logistica-service](clases/02-logistica-service.svg) | — |

---

## 4. Legibilidad

Las exportaciones se revisaron visualmente: texto legible, PNG a escala 2, estereotipos identificando el incremento del sprint y fondo blanco para impresión. Los PDF se ajustan automáticamente al tamaño total del diagrama (una página completa por diagrama).

---

## 5. Regenerar las exportaciones

Requiere Node.js.

### Diagramas de clases (ABC-405)
Desde la raíz del repositorio o desde `docs/diagramas/sprint-3/clases`:

```powershell
cd docs/diagramas/sprint-3/clases
Get-ChildItem *.mmd | ForEach-Object {
  $n = $_.BaseName
  npx @mermaid-js/mermaid-cli -i $_.Name -o "$n.svg" -b white
  npx @mermaid-js/mermaid-cli -i $_.Name -o "$n.png" -b white -s 2
  npx @mermaid-js/mermaid-cli -i $_.Name -o "$n.pdf"
}
```

### Diagramas de secuencia (ABC-407)
Desde `docs/diagramas/sprint-3/secuencia`:

```powershell
cd docs/diagramas/sprint-3/secuencia
npm install --prefix $env:TEMP\mmdc @mermaid-js/mermaid-cli@11.4.2
'{"sequence":{"useMaxWidth":false,"wrap":true,"width":180,"messageFontSize":15,"actorFontSize":15,"noteFontSize":14}}' | Set-Content $env:TEMP\mmdc\config.json
Get-ChildItem *.mmd | ForEach-Object {
  $n = $_.BaseName
  & "$env:TEMP\mmdc\node_modules\.bin\mmdc.cmd" -i $_.Name -o "$n.svg" -c "$env:TEMP\mmdc\config.json" -b white
  & "$env:TEMP\mmdc\node_modules\.bin\mmdc.cmd" -i $_.Name -o "$n.png" -c "$env:TEMP\mmdc\config.json" -b white -s 2
  & "$env:TEMP\mmdc\node_modules\.bin\mmdc.cmd" -i $_.Name -o "$n.pdf" -c "$env:TEMP\mmdc\config.json" -b white -f
}
```
