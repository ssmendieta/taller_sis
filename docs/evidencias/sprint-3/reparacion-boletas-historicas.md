# ABC-385 — reparación local de producto/unidad en boletas históricas

## Alcance y garantías

La migración de producto/unidad dejó nulos en boletas emitidas previamente. El despacho requiere esos datos y falla al construir su evento. Se añade un procedimiento explícito de mantenimiento; no se debilita el contrato, no se inventan valores ni se cambian mensajes o configuración de Pub/Sub.

- Solo base, Auth y Producción en localhost. IDs explícitos, sin selección global automática.
- Sesión vigente con permiso `logistica.boletas.gestionar`; actor obtenido de `/me`, nunca de un argumento suministrado por el operador.
- Consulta autenticada a `GET /ordenes/:id` de Producción. No hay lectura cruzada de su base de datos. Código y unidad obligatorios, orden coincidente y unidad válida.
- Solo boletas EMITIDA sin despacho previo; únicamente se completan campos nulos. Un valor conocido contradictorio detiene todo el lote.
- Revisión sin escrituras por defecto. `--apply` bloquea las boletas, vuelve a comprobar el estado y aplica actualización más historial en una transacción.
- Historial con actor, orden, valores anteriores y nuevos. No altera ítems, cantidades, responsable ni estado documental; segunda ejecución sin cambios.
- No publica ni consume mensajes, no despacha rutas y no escribe outbox/inbox. No se ejecuta automáticamente al arrancar ni dentro de una migración.

## Ejecución en PowerShell

Desde `services/logistica-service`, con un token de una sesión local válida. No pegar tokens en el chat, argumentos, archivos ni Git. La entrada siguiente queda oculta:

```powershell
$env:DB_HOST = '127.0.0.1'
$env:DB_DATABASE = 'logistica_db'
$env:AUTH_SERVICE_URL = 'http://127.0.0.1:3001'
$env:PRODUCCION_SERVICE_URL = 'http://127.0.0.1:3002'
$tokenSeguro = Read-Host 'Token de sesión local' -AsSecureString
$env:BOLETAS_REPARACION_TOKEN = [System.Net.NetworkCredential]::new('', $tokenSeguro).Password
try {
  npm.cmd run boletas:reparar-producto -- --ids=3,8,12,13
  # Revisar plan y correspondencia con las órdenes antes de aplicar:
  # npm.cmd run boletas:reparar-producto -- --ids=3,8,12,13 --apply
} finally {
  Remove-Item Env:BOLETAS_REPARACION_TOKEN -ErrorAction SilentlyContinue
  Remove-Variable tokenSeguro -ErrorAction SilentlyContinue
}
```

Los IDs corresponden a la base local inspeccionada el 12/11/2026; no reutilizarlos en otra instalación sin revisar sus documentos. Si Producción no está disponible o no conserva datos verificables, detenerse y pedir revisión: no sustituirlos por un catálogo inventado. La revisión y aplicación consultan de nuevo Producción; comprobar el resultado de ambas.

## Resultado al 12/11/2026

La inspección de solo lectura encontró estas emitidas con ambos campos nulos y sin ruta despachada:

| Boleta | Orden de Producción |
| --- | --- |
| 3 | 1 |
| 8 | 11 |
| 12 | 14 |
| 13 | 16 |

**Aplicado en local:** una sesión válida de Auth identificó al usuario actor 3. La revisión consultó las órdenes 1, 11, 14 y 16 mediante la API de Producción y devolvió `PAN-001 / unidad` para las cuatro. Después se aplicó el lote en una sola transacción. Las boletas 3, 8, 12 y 13 conservaron el estado `EMITIDA`; cada una recibió una entrada de historial `ABC-385` con valores anteriores y nuevos. El historial total pasó de 2 a 6 registros. Outbox e inbox permanecieron en 0, por lo que el procedimiento no generó mensajes. Borradores y anuladas quedaron fuera del procedimiento.

Validación automática: 14 pruebas con PostgreSQL real en un esquema temporal exclusivo. Cubren revisión, preservación de datos, idempotencia, trazabilidad, datos inválidos, contradicciones, fallo HTTP, rollback al fallar historial, modificación concurrente, estados excluidos y despacho antes/después. El despacho de prueba usa únicamente un outbox en ese esquema aislado, sin instanciar publicadores. El esquema se elimina al terminar.

```powershell
$env:LOGISTICA_DB_REAL='1'
$env:DB_HOST='127.0.0.1'
$env:DB_DATABASE='logistica_db'
npm.cmd test -- --runInBand reparar-producto-historico.persistencia.spec.ts
```
