# Sprint 3: arranque y prueba de humo (ABC-403)

## Requisitos

Trabajar en el repositorio habitual `taller_sis`, con Docker Desktop disponible,
Node.js 18 o superior y el `.env` local ya utilizado por el equipo. No reemplazar
credenciales ni borrar volúmenes. La sesión para el humo debe tener
`ordenes.consultar` y `logistica.rutas.consultar`.

## 1. Arranque local sin Google

Desde la raíz:

```powershell
node scripts/sprint3.mjs iniciar-local
```

Usa explícitamente `docker-compose.sprint3-local.yml`. Elimina solamente los
montajes de credenciales de Producción y Logística y apaga sus publicadores y
consumidores. Conserva PostgreSQL y su volumen. Valida Compose y construye un
servicio por comando; ante un error se detiene antes de recrear contenedores.
No desactiva TLS ni modifica lockfiles. Si `npm ci` falla, conservar el log:
el script no afirma corregir la causa de un error de npm.

El frontend usa el puerto 5173 y el gateway el 3000 por defecto. Para un entorno
con otros puertos se configuran `SPRINT3_FRONTEND` y `SPRINT3_GATEWAY`.
El SHA del informe corresponde al checkout; no identifica por sí solo el código
de una imagen antigua. Ejecutar el arranque con reconstrucción antes del humo.

## 2. Prueba de humo de tres HU

Iniciar sesión en la aplicación con una cuenta autorizada. Obtener su token
localmente, sin enviarlo al chat, guardarlo en documentos ni publicarlo en Git.
Para introducirlo sin mostrarlo en la terminal:

```powershell
$sesion = Read-Host 'Token de la sesión local autorizada' -AsSecureString
$env:SPRINT3_TOKEN = [System.Net.NetworkCredential]::new('', $sesion).Password
try {
    node scripts/sprint3.mjs humo-local
} finally {
    Remove-Item Env:SPRINT3_TOKEN -ErrorAction SilentlyContinue
}
```

| Comprobación | Resultado exigido |
| --- | --- |
| Docker | Los seis contenedores del entorno activos; PostgreSQL saludable |
| Frontend y gateway | HTML de la aplicación y health disponibles |
| Auth | Sesión vigente por el gateway |
| PostgreSQL | Health de Producción conectado y consultas READ ONLY a las tres bases |
| ABC-108 | Historial paginado válido |
| ABC-109 | Reporte de Producción válido |
| ABC-110 | Reporte logístico válido |

Los resultados se guardan en `tmp/sprint3/`, ignorado por Git. No incluyen el
token, contraseñas, correo del usuario ni las filas completas de las respuestas.
Un 401/403, un servicio ausente, una base omitida mediante SKIP_DB o un formato
incorrecto producen un fallo. Los estados vacíos válidos se aceptan en el humo;
los casos de negocio se cubren con las suites de aceptación de cada HU.

Para otro rango, definir `SPRINT3_DESDE` y `SPRINT3_HASTA` con AAAA-MM-DD.

## 3. Persistencia tras recrear procesos

Anotar una orden y una ruta de prueba visibles. Reiniciar solo los servicios de
negocio, mantener PostgreSQL y volver a consultar los mismos registros:

```powershell
docker compose -f docker-compose.yml -f docker-compose.sprint3-local.yml --profile full restart produccion-service logistica-service
```

Comprobar por interfaz los mismos identificadores y datos, y repetir el humo.
No ejecutar `down -v`. Registrar esta ejecución por separado: una consulta SQL
de lectura demuestra acceso a los datos, no un reinicio de contenedores.

## 4. Mensajería real y ABC-347

Coordinar con el responsable de ABC-402 el JSON existente, su ruta local, los
permisos y los recursos reales. El archivo se mantiene fuera del repositorio.
El Compose base monta la cuenta en ambos servicios. El override local no se
utiliza para esta prueba, y `PUBSUB_EMULATOR_HOST` debe estar vacío.

Se puede compartir el topic. Revisar las suscripciones antes de habilitar
simultáneamente consumidores con contratos diferentes: una suscripción
compartida reparte las entregas y un consumidor puede confirmar el evento de
otro. Usar suscripciones separadas o un consumidor que enrute los contratos.

Preparar una orden de prueba FINALIZADA. Crear el cierre con una sesión que
tenga `ordenes.finalizar_cancelar`:

```text
POST /api/produccion/cierres-produccion
{ "ordenId": IDENTIFICADOR_DE_PRUEBA, "cierreVersion": 1 }
```

La outbox guarda `ProduccionCerrada.v1`. Contrastar el registro
`PUBLICACION_OUTBOX_CONFIRMADA`, `eventId`, `correlationId`, `messageId` y la
captura en Google con fecha/hora y cuerpo. El publicador puede enviar otros
pendientes del entorno: preparar el entorno de prueba y revisar su cola antes
de activarlo. No presentar un emulador como Google real.

Después de recibir un `RegistroContableResultado.v1` correlacionado, indicar
`SPRINT3_EVENT_ID` y `SPRINT3_RESPONSE_EVENT_ID`, mantener la sesión autorizada y
ejecutar:

```powershell
node scripts/sprint3.mjs humo-gcp
```

Este comando solo lee la configuración no secreta y los registros existentes.
No publica ni consume mensajes, no crea recursos cloud ni hace ACK. Verifica
que el modo no sea emulado, que la outbox esté PUBLICADO con messageId y que la
respuesta esté PROCESADO con la misma correlación y solicitud. No sustituye
la captura de Google ni demuestra por sí solo el ACK del broker. Los simuladores
deben identificarse como tales cuando se utilicen para representar al otro SI.

## 5. Evidencia y cierre

Adjuntar a ABC-403 el informe real de ejecución, comandos, fecha, entorno,
captura de Docker y captura de Pub/Sub. Mostrar además los tres recorridos en
la demo. El verificador nunca mueve Jira a Done automáticamente.

Validación del propio verificador, con Docker/HTTP simulados:

```powershell
node --test scripts/sprint3.test.mjs
```
