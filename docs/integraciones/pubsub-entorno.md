# Entorno de publicación Google Cloud Pub/Sub

## Objetivo actual

`produccion-service` publica mensajes en un único topic compartido de Google
Cloud Pub/Sub. Esta etapa no crea topics ni suscripciones, no consume mensajes y
no se comunica todavía con Inventarios o Contabilidad.

```text
produccion-service -- publish --> projects/{projectId}/topics/{topicId}
```

## Configuración

| Variable | Descripción |
| --- | --- |
| `PUBSUB_ENABLED` | Habilita el cliente y exige el resto de la configuración. |
| `GCP_PROJECT_ID` | ID del proyecto de Google Cloud. |
| `PUBSUB_TOPIC_ID` | ID corto o nombre completo del topic existente. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta que usa Application Default Credentials. |
| `GCP_CREDENTIALS_HOST_PATH` | Ruta del JSON en el host para el montaje de Docker. |

El archivo JSON debe permanecer fuera del repositorio. No se deben copiar
`private_key`, `private_key_id` ni el contenido del archivo a `.env.example`, a
la imagen Docker o a la documentación.

La cuenta de servicio necesita `pubsub.topics.publish` sobre el topic. El rol
predefinido mínimo habitual es `roles/pubsub.publisher`.

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

`docker-compose.yml` monta `GCP_CREDENTIALS_HOST_PATH` dentro del contenedor en
`/run/secrets/gcp/pubsub-service-account.json` como archivo de solo lectura. La
ruta del host puede usar barras `/` en Windows.

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
- No hay consumidores, ACK/NACK ni redelivery.
- No hay simuladores, inbox, outbox ni reintentos persistentes.
- Los contratos de Inventarios y Contabilidad se definirán en sus tareas.
