# ABC-244: consumidor idempotente de respuestas de Almacén

Producción consume `SolicitudMaterialAlmacenEstadoActualizado.v1` desde una
suscripción existente. El transporte valida el JSON y los atributos, delega el
procesamiento y envía ACK solo después del commit. Un error transitorio recibe
NACK; un mensaje inválido permanente recibe ACK y deja un diagnóstico seguro en
los logs para evitar ciclos infinitos.

El procesamiento valida el contrato y busca el evento original del outbox por
`requestEventId`. Deben coincidir `correlationId`, `solicitudId` y `ordenId`.
Después bloquea la solicitud y guarda en una sola transacción:

- el nuevo estado y `solicitud_version`;
- la fecha y motivo externos;
- un registro de `eventos_inbox` con `eventId`, hash canónico y `messageId`.

Una redelivery con el mismo `eventId` y contenido devuelve `DUPLICADO`. El mismo
ID con otro contenido es un conflicto de integridad. Las versiones anteriores
se guardan como `IGNORADO` y nunca retroceden el estado.

## Configuración

```env
PUBSUB_CONSUMER_ENABLED=false
PUBSUB_SUBSCRIPTION_ID=projects/PROJECT_ID/subscriptions/SUBSCRIPTION_ID
```

La suscripción debe existir y conviene que filtre por el atributo:

```text
eventType="SolicitudMaterialAlmacenEstadoActualizado.v1"
```

La identidad necesita permiso `pubsub.subscriptions.consume`. No se guardan
credenciales ni se crean recursos de Google desde la aplicación.

## Verificación local

```powershell
cd services/produccion-service
$env:DB_DATABASE = 'produccion_db'
$env:INBOX_DB_REAL = '1'
$env:PUBSUB_ENABLED = 'false'
$env:PUBSUB_CONSUMER_ENABLED = 'false'
npm.cmd test -- --runInBand inbox
npm.cmd test -- --runInBand integraciones solicitudes-material
npm.cmd run build
```

Para habilitar el transporte real, aplicar primero la migración 19, configurar
la suscripción y credenciales ADC, y cambiar `PUBSUB_CONSUMER_ENABLED=true`.
