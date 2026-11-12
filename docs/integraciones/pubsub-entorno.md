# Entorno de publicación Google Cloud Pub/Sub

## Objetivo actual

`produccion-service` y `logistica-service` publican en el topic compartido de
Google Cloud Pub/Sub asignado al proyecto y consumen desde la suscripción
existente. La aplicación no crea ni modifica topics, suscripciones o permisos.
Los contratos comparten el topic y se diferencian mediante el atributo
`eventType`.

```text
produccion-service -- publish --> projects/{projectId}/topics/{topicId}
logistica-service  -- publish --> projects/{projectId}/topics/{topicId}
projects/{projectId}/subscriptions/{subscriptionId} --> consumer habilitado
```

## Configuración

| Variable | Descripción |
| --- | --- |
| `PUBSUB_ENABLED` | Habilita el cliente y exige el resto de la configuración. |
| `GCP_PROJECT_ID` | ID del proyecto de Google Cloud. |
| `PUBSUB_TOPIC_ID` | ID corto o nombre completo del topic existente. |
| `PUBSUB_CONSUMER_ENABLED` | Habilita el consumidor idempotente de ABC-244. |
| `PUBSUB_SUBSCRIPTION_ID` | ID corto o nombre completo de la suscripción de respuestas. |
| `PUBSUB_DEMANDA_CONSUMER_ENABLED` | Habilita el consumidor de demandas. |
| `PUBSUB_DEMANDA_SUBSCRIPTION_ID` | Suscripción existente para demandas. |
| `PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_ENABLED` | Habilita el consumidor de confirmaciones. |
| `PUBSUB_DEMANDA_CONFIRMACION_SUBSCRIPTION_ID` | Suscripción existente para confirmaciones. |
| `LOGISTICA_PUBSUB_ENABLED` | Habilita la publicación de Logística. |
| `LOGISTICA_PUBSUB_SALIDA_TOPIC_ID` | Topic de Logística; si queda vacío reutiliza `PUBSUB_TOPIC_ID`. |
| `LOGISTICA_PUBSUB_RESULTADO_CONSUMER_ENABLED` | Habilita el consumidor de resultados de Logística. |
| `LOGISTICA_PUBSUB_RESULTADO_SUBSCRIPTION_ID` | Suscripción de Logística; si queda vacía reutiliza `PUBSUB_SUBSCRIPTION_ID`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta que usa Application Default Credentials. |
| `GCP_CREDENTIALS_HOST_PATH` | Ruta del JSON en el host para el montaje de Docker. |
| `OUTBOX_BATCH_SIZE` | Máximo de eventos reclamados por ciclo. |
| `OUTBOX_POLL_INTERVAL_MS` | Intervalo entre ciclos de publicación. |
| `OUTBOX_LEASE_MS` | Tiempo reservado a un worker antes de permitir recuperación. |
| `OUTBOX_RETRY_BASE_MS` | Espera inicial para reintentar una publicación fallida. |
| `OUTBOX_RETRY_MAX_MS` | Tope de la espera exponencial entre reintentos. |

El archivo JSON debe permanecer fuera del repositorio. No se deben copiar
`private_key`, `private_key_id` ni el contenido del archivo a `.env.example`, a
la imagen Docker o a la documentación.

La cuenta de servicio necesita `pubsub.topics.publish` sobre el topic. El rol
predefinido mínimo habitual es `roles/pubsub.publisher`.
Para consumir también necesita `pubsub.subscriptions.consume` sobre la
suscripción; el rol predefinido habitual es `roles/pubsub.subscriber`.

## Ejecución local

1. Copiar `.env.example` a `.env` y completar las variables reales.
2. Mantener `GOOGLE_APPLICATION_CREDENTIALS` apuntando al JSON local.
3. Instalar dependencias y ejecutar:

```powershell
cd services/produccion-service
npm run pubsub:smoke
```

Una publicación correcta imprime `PUBLICADO`, `eventId`, `correlationId`,
`topicId` y el `messageId` asignado por Google.

## Docker Compose

`docker-compose.yml` monta `GCP_CREDENTIALS_HOST_PATH` en Producción y Logística
como `/run/secrets/gcp/pubsub-service-account.json`, siempre en modo de solo
lectura. La ruta del host puede usar barras `/` en Windows.

Para una demostración con una sola suscripción compartida se activa un consumidor
por vez. Así cada prueba recibe únicamente el contrato que le corresponde:

1. Mantener `PUBSUB_EMULATOR_HOST` vacío.
2. Habilitar publicación en ambos servicios y un solo flag de consumo.
3. Levantar el perfil `full` y publicar el evento del flujo elegido.
4. Verificar en los logs `messageId`, `eventId` y el resultado persistido.
5. Detener ese consumidor antes de habilitar el siguiente.

## Mensaje técnico de verificación

```json
{
  "eventId": "uuid",
  "eventType": "PubSubConnectionTest.v1",
  "occurredAt": "2026-10-10T15:00:00.000Z",
  "source": "produccion-service",
  "correlationId": "uuid",
  "data": {
    "message": "Prueba de publicación desde Producción"
  }
}
```

`eventId`, `eventType`, `source` y `correlationId` también se envían como
atributos. `messageId` no forma parte del payload: Google Cloud lo devuelve
después de aceptar la publicación.

## Límites de esta etapa

- No se crean ni administran topics.
- No se crean suscripciones.
- El consumidor recibe `SolicitudMaterialAlmacenEstadoActualizado.v1` y
  `DisponibilidadMaterialRespondida.v1`, confirma mensajes permanentes y
  solicita redelivery ante fallos transitorios.
- Existe outbox y reintento persistente para `SolicitudMaterialAlmacen.v1`
  y `ProduccionCerrada.v1`. Ambos reutilizan el mismo publicador y configuración.
- Existe inbox persistente para evitar efectos duplicados y snapshots
  versionados de disponibilidad. El simulador local de
  `simuladores/inventarios/` responde a solicitudes de materiales y, para las
  pruebas ABC-278, a consultas de disponibilidad. Consulta
  `docs/evidencias/inventarios/ABC-278-disponibilidad-local.md` para iniciar la
  prueba local.
- Los contratos están documentados en `contabilidad-v1.md` e
  `inventario-almacen-v1.md`.
