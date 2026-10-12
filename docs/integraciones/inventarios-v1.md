# ABC-113, subtarea 1: contrato Producción–Inventarios v1

Este documento reutiliza el contrato de solicitudes de ABC-277, definido en
[`inventario-almacen-v1.ts`](../../services/produccion-service/src/integraciones/contratos/inventario-almacen-v1.ts)
y [documentado previamente](inventario-almacen-v1.md). Describe los mensajes a
partir de las solicitudes persistidas de ABC-73. No conecta esas solicitudes al
publicador ni implementa outbox, simulador, suscripción o consumidor.

## Nombres acordados y diferencias con el plan

Se acordó conservar los nombres existentes en el código:

| Nombre en la tarea de ABC-113 | `eventType` real que se debe enviar | Emisor lógico y `source` existente |
| --- | --- | --- |
| `MaterialesSolicitados.v1` | `SolicitudMaterialAlmacen.v1` | Producción: `produccion-service` |
| `MaterialesSolicitudRespondida.v1` | `SolicitudMaterialAlmacenEstadoActualizado.v1` | Inventarios/Almacén: `almacen-service` |

Los nombres de la primera columna describen los mismos pasos del flujo, pero no
son alias implementados ni valores alternativos aceptados del contrato. Los
ejemplos usan los valores de la segunda columna, exactamente como las constantes
`SOLICITUD_MATERIAL_ALMACEN_V1` y
`SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1`. No se renombran esas constantes.
Inventarios es la contraparte externa de esta tarea; el contrato existente llama
`almacen-service` al emisor de su respuesta. No hay un servicio de Inventarios
implementado en este repositorio.

## Topic y suscripciones

La configuración real de Producción define un único topic mediante
`PUBSUB_TOPIC_ID`, junto con `GCP_PROJECT_ID` y `PUBSUB_ENABLED`. No define un
topic distinto para solicitudes ni variables de suscripción. El publicador
genérico usa ese mismo topic para todos los tipos de eventos.

| Recurso | Situación en el repositorio |
| --- | --- |
| Topic de salida de Producción | El existente indicado por `PUBSUB_TOPIC_ID`; puede ser ID corto o `projects/{projectId}/topics/{topicId}`. |
| Suscripción de Inventarios a solicitudes | Sin nombre ni configuración en el repositorio; pendiente de coordinación con Inventarios. |
| Topic o ruta de respuesta de Inventarios | Sin configuración en Producción; pendiente de coordinación con Inventarios. |
| Suscripción de Producción a respuestas | Sin nombre ni configuración en el repositorio; pendiente de las subtareas de recepción. |

No se adopta ningún nombre de topic o suscripción del plan que no esté en la
configuración real. `.env.example` contiene `topic-id-de-ejemplo`, un marcador,
no un recurso de Google Cloud verificado. Tampoco se supone que Inventarios
publique su respuesta en el topic de salida de Producción.

Referencias: [entorno Pub/Sub](pubsub-entorno.md),
[`pubsub.config.ts`](../../services/produccion-service/src/integraciones/pubsub/pubsub.config.ts),
[`pubsub-publisher.service.ts`](../../services/produccion-service/src/integraciones/pubsub/pubsub-publisher.service.ts)
y [`docker-compose.yml`](../../docker-compose.yml).

## Sobre común

Se conserva `PubSubEvent<T>` de
[`pubsub.types.ts`](../../services/produccion-service/src/integraciones/pubsub/pubsub.types.ts).

| Campo obligatorio | Significado |
| --- | --- |
| `eventId` | Identificador propio del evento, representado como UUID en los ejemplos. La respuesta tiene uno distinto al de la solicitud. |
| `eventType` | Uno de los dos nombres reales de la tabla anterior; `.v1` identifica la versión del contrato. |
| `correlationId` | Identificador del flujo de una solicitud. La respuesta copia exactamente el de la solicitud. |
| `occurredAt` | Fecha/hora del evento en formato ISO 8601 con zona horaria; los ejemplos usan UTC (`Z`). |
| `source` | Emisor del evento: `produccion-service` o `almacen-service`. |
| `data` | Datos de negocio específicos del evento. |

El publicador existente también envía `eventId`, `eventType`, `source` y
`correlationId` como atributos de Pub/Sub. Deben coincidir con el JSON.
`messageId` lo asigna Pub/Sub al publicar y no sustituye a `eventId` ni forma
parte de este payload.

## Solicitud: MaterialesSolicitados.v1 del plan

El nombre real es `SolicitudMaterialAlmacen.v1`. Este ejemplo reproduce
`SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO` del código:

```json
{
  "eventId": "de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6",
  "eventType": "SolicitudMaterialAlmacen.v1",
  "occurredAt": "2026-10-11T18:15:00.000Z",
  "source": "produccion-service",
  "correlationId": "81a265f2-15ec-430c-98e5-e1fa08bb7412",
  "data": {
    "solicitudId": "27",
    "solicitudVersion": 1,
    "ordenId": 15,
    "ordenCodigo": "ORD-0015",
    "solicitanteUsuarioId": "42",
    "fechaNecesaria": "2026-10-13",
    "items": [
      {
        "materialId": "8",
        "materialCodigo": "HAR-001",
        "materialNombre": "Harina de trigo",
        "cantidad": "12.5000",
        "unidad": "kg"
      }
    ]
  }
}
```

Todos los campos mostrados de `data` son obligatorios en el contrato existente.
`items` contiene uno o varios materiales, sin repetir un material en la misma
solicitud. Tanto `materialId` como `materialCodigo` se incluyen, siguiendo el
tipo existente; el código permite identificar el material en la contraparte
sin asumir que sus IDs de base de datos sean iguales a los de Producción.

`cantidad` es texto decimal positivo con hasta cuatro decimales, acorde con
`NUMERIC(14,4)` de ABC-73; su rango es de `0.0001` a `9999999999.9999`.
`unidad` debe coincidir con la unidad del material. Las unidades locales son
`kg`, `g`, `l`, `ml`, `m`, `cm`, `unidad`, `docena`, `caja` y `paquete`.
No se suman cantidades de unidades distintas ni se aplica conversión implícita.

## Respuesta: MaterialesSolicitudRespondida.v1 del plan

El nombre real es `SolicitudMaterialAlmacenEstadoActualizado.v1`. Este ejemplo
reproduce `SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO`:

```json
{
  "eventId": "9d08a84e-1f44-40b0-87be-e161d399371d",
  "eventType": "SolicitudMaterialAlmacenEstadoActualizado.v1",
  "occurredAt": "2026-10-11T18:15:05.000Z",
  "source": "almacen-service",
  "correlationId": "81a265f2-15ec-430c-98e5-e1fa08bb7412",
  "data": {
    "solicitudId": "27",
    "solicitudVersion": 2,
    "requestEventId": "de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6",
    "ordenId": 15,
    "estadoAnterior": "PENDIENTE",
    "estadoNuevo": "APROBADA",
    "actualizadoAt": "2026-10-11T18:15:05.000Z"
  }
}
```

Los campos mostrados de `data` son obligatorios; `motivo` es texto opcional en
el tipo existente. El estado de respuesta es `estadoNuevo`, cuyo vocabulario
actual es `PENDIENTE`, `APROBADA` o `CANCELADA`; `estadoAnterior` usa los mismos
valores. No se agregan `RECHAZADA`, estados de compra o estados de entrega.

La respuesta existente es de estado de la solicitud completa: **no incluye
ítems, material, cantidad ni unidad**. Esos datos se recuperan de la solicitud
original identificada por `correlationId`, `requestEventId`, `solicitudId` y
`ordenId`. Así, en el ejemplo la aprobación corresponde a `12.5000 kg` del
material `8` / `HAR-001`. No significa que esa cantidad ya haya sido entregada
o descontada del inventario. Una respuesta por ítem o con cantidades atendidas
necesitaría un acuerdo adicional y adaptación del tipo existente.

## Relación con la persistencia de ABC-73

| Dato del mensaje | Origen local o situación actual |
| --- | --- |
| `solicitudId` | `SolicitudMaterial.id`, texto porque la columna es `BIGINT`. |
| `ordenId` | Orden relacionada mediante `SolicitudMaterial.ordenId`; el contrato actual usa un número entero seguro. |
| `ordenCodigo` | `OrdenProduccion.codigo`. |
| `solicitanteUsuarioId` | `SolicitudMaterial.solicitanteUsuarioId`, tomado del usuario autenticado por ABC-73. |
| `items[].materialId`, `cantidad`, `unidad` | Registros persistidos de `SolicitudMaterialItem`. |
| `items[].materialCodigo`, `materialNombre` | Material relacionado con cada ítem. |
| Estado inicial | ABC-73 crea la solicitud como `PENDIENTE`; no se añade un campo de estado al mensaje de solicitud. |
| `fechaNecesaria` | Obligatoria en el contrato previo, pero no está en `SolicitudMaterial` ni en su DTO. La implementación futura debe acordar su origen; no se confunde con `SolicitudMaterial.fecha`, que es la fecha de registro. |
| `solicitudVersion` | Versión de negocio del contrato, distinta de `.v1`; no hay columna local de versión. El ejemplo usa 1 al solicitar y 2 al responder. |
| `eventId`, `correlationId`, `occurredAt` | Metadatos del evento, sin columnas de persistencia en ABC-73; su generación y conservación corresponden a las siguientes subtareas. |

Fuentes: [solicitud](../../services/produccion-service/src/solicitudes-material/entities/solicitud-material.entity.ts),
[ítems](../../services/produccion-service/src/solicitudes-material/entities/solicitud-material-item.entity.ts)
y [servicio de solicitudes](../../services/produccion-service/src/solicitudes-material/solicitudes-material.service.ts).
Una publicación futura debe usar la solicitud y todos sus ítems ya confirmados
en la base de datos; este documento no modifica su transacción ni el stock.

## Correlación e idempotencia para las siguientes subtareas

- Los dos ejemplos comparten `correlationId`, `solicitudId` y `ordenId`.
- `data.requestEventId` de la respuesta es el `eventId` de la solicitud, mientras
  que el `eventId` de la respuesta es propio y distinto.
- Reintentar el mismo evento conserva su `eventId`, `correlationId` y contenido.
  Una nueva actualización tiene un nuevo `eventId` y mantiene la correlación.
- Un evento ya procesado no debe volver a producir efectos; el mismo `eventId`
  con contenido diferente es un error de integridad.
- Una `solicitudVersion` anterior no debe retroceder el estado vigente.

Estas son reglas del contrato previo, no capacidades de recepción implementadas
por esta subtarea. Las próximas tareas deben resolver el origen de
`fechaNecesaria`, la conservación de versiones y metadatos, y el transporte de
respuesta con sus suscripciones antes de integrar ambos sistemas.

El [diagrama del flujo](../diagramas/inventarios-v1.md) distingue la
infraestructura existente de los pasos pendientes.
