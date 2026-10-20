# Prueba local de disponibilidad de materiales (ABC-278)

Esta prueba conecta la pantalla de Producción, su API, el emulador local de
Pub/Sub y el simulador de Inventarios. No usa Google Cloud ni credenciales
reales. El simulador exige stock explícito en `INVENTARIOS_STOCK_JSON`; no toma
lo requerido como disponibilidad. La guía actualizada, con migración, reintentos
y pruebas, está en [ABC-113-disponibilidad.md](ABC-113-disponibilidad.md).

## 1. Iniciar el emulador y crear el topic compartido

Desde la raíz del repositorio, en PowerShell:

```powershell
docker compose --profile emulator up -d pubsub-emulator
Start-Sleep -Seconds 5
$env:PUBSUB_EMULATOR_HOST = '127.0.0.1:8085'
.\scripts\emulador-pubsub.ps1 `
  -ProjectId 'taller-local' `
  -IdaTopic 'taller-inventarios-local' `
  -IdaSubscription 'taller-inventarios-simulator-local' `
  -VueltaTopic 'taller-inventarios-local' `
  -VueltaSubscription 'taller-produccion-inventarios-local'
```

Ambas suscripciones deben pertenecer al mismo topic: el simulador recibe la
solicitud y Producción recibe la respuesta.

## 2. Conectar Producción al emulador

En esa misma ventana de PowerShell, configura el servicio y recréalo:

```powershell
$env:PUBSUB_ENABLED = 'true'
$env:GCP_PROJECT_ID = 'taller-local'
$env:PUBSUB_TOPIC_ID = 'taller-inventarios-local'
$env:PUBSUB_CONSUMER_ENABLED = 'true'
$env:PUBSUB_SUBSCRIPTION_ID = 'taller-produccion-inventarios-local'
$env:PUBSUB_EMULATOR_HOST = 'host.docker.internal:8085'
$env:OUTBOX_POLL_INTERVAL_MS = '1000'
docker compose up -d --no-deps --force-recreate produccion-service
docker compose up -d --build frontend
docker compose logs --tail=40 produccion-service
```

`host.docker.internal` permite que el contenedor de Producción alcance el
emulador publicado en el puerto de Windows. Estas variables solo aplican a esa
ventana y no son credenciales de Google.

## 3. Ejecutar el simulador de Inventarios

Abre otra ventana de PowerShell:

```powershell
cd .\simuladores\inventarios
node --version
npm ci
$env:PUBSUB_EMULATOR_HOST = '127.0.0.1:8085'
$env:GCP_PROJECT_ID = 'taller-local'
$env:INVENTARIOS_INPUT_SUBSCRIPTION_ID = 'taller-inventarios-simulator-local'
$env:INVENTARIOS_OUTPUT_TOPIC_ID = 'taller-inventarios-local'
$env:INVENTARIOS_STOCK_JSON = Read-Host 'JSON de existencias configuradas de Inventarios, por código de material'
node .\index.js
```

Se requiere Node.js 22.13 o posterior. Al ver `"action":"READY"`, deja esa ventana abierta.
Para ensayar falta de stock, antes de iniciar el simulador puedes establecer,
por ejemplo, `$env:INVENTARIOS_STOCK_JSON = '{"HAR-001":0}'`, exclusivamente
como fixture de prueba. Sin esa variable no se inventa disponibilidad: el
simulador registra un error y mantiene el mensaje para reintento.

## 4. Probar desde la aplicación

1. Entra con un usuario que tenga `materiales.consultar_disponibilidad`.
2. Abre una orden en estado **Planificada** y entra a su detalle.
3. En **Materiales requeridos**, pulsa **Solicitar disponibilidad**.
4. Espera el aviso de respuesta y comprueba cantidad y estado de cada material.
5. La consulta no cambia recetas ni inicia producción. Una receta inactiva
   mantiene bloqueado el inicio, incluso si hay disponibilidad suficiente.

Evidencia técnica esperada: el simulador imprime
`AVAILABILITY_RESPONSE_SENT`; Producción registra la respuesta del consumidor
en sus logs; la API devuelve `estado_consulta: RESPONDIDA` y la pantalla muestra
cantidades disponibles.
