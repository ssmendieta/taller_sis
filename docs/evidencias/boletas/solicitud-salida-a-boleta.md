# Flujo persistente: solicitud de salida a boleta

Fecha: 19/10/2026, America/La_Paz. Rama: `RamaAndrea`.

## Comportamiento implementado

`/logistica/inicio` consulta `GET /api/logistica/solicitudes-salida` y muestra los
registros devueltos. El formulario consulta órdenes y lotes reales de Producción,
selecciona una orden del listado y permite uno o varios ítems con código de lote
y cantidad positiva, como texto decimal de cuatro posiciones.

El POST de solicitud envía exclusivamente `ordenId` como texto numérico,
`destinoDocumental`, `motivo` e `items[{referencia,cantidad}]`. Reutiliza el Bearer
de la sesión existente. Estado, responsable y fecha los determina el backend.
No hay documentos demo ni persistencia de documentos en el navegador.

La pantalla no confirma el guardado mientras el POST está pendiente ni si falla.
Los errores muestran el código HTTP y el mensaje del servidor; un 403 identifica
el permiso requerido y un 401 pide iniciar sesión. Después de confirmar ID,
estado e ítems del servidor, vuelve a consultar el listado. Si ese GET falla,
conserva la confirmación del POST y muestra el error de refresco por separado,
evitando inducir un segundo envío de la misma solicitud.

“Boletas → Crear boleta” vuelve a consultar esas mismas solicitudes mediante GET.
La recién guardada es seleccionable; sus referencias se contrastan con los lotes
reales de la orden. La creación usa el POST existente de boletas y navega al
detalle solo después de que el backend confirme ID y estado. No hay cantidad ni
referencias inventadas como alternativa si faltan datos.

## Causa comprobada del 500

Los logs de `logistica-service` mostraron:

```text
TypeError: Cannot read properties of undefined (reading 'databaseName')
at SelectQueryBuilder.createOrderByCombinedWithSelectExpression
at SelectQueryBuilder.getManyAndCount
at BoletasService.findAll
```

El listado usa joins y paginación `skip/take`. El ORDER BY usaba el nombre SQL
`boleta.creado_en`, pero TypeORM necesita la propiedad de entidad `boleta.creadoEn`
para construir esa consulta paginada. Se corrigió únicamente esa expresión del
servicio y su expectativa unitaria. La prueba HTTP con PostgreSQL comprueba tanto
el listado vacío como varios documentos con varios ítems, sin duplicar cabeceras.

`migration:show` confirmó las cuatro migraciones de Logística aplicadas. No se
creó ni ejecutó otra migración de Logística para ocultar el error.

## Permisos y configuración

| Operación | Permiso existente |
| --- | --- |
| Consultar solicitudes | `logistica.solicitudes.consultar` |
| Crear solicitud | `logistica.solicitudes.gestionar` |
| Consultar órdenes y lotes de Producción | `ordenes.consultar` |
| Crear boleta | `logistica.boletas.gestionar` |
| Consultar boletas | `logistica.boletas.consultar` |

Se comprobó en `auth_db` que el Encargado de Logística tenía los cuatro permisos
de Logística, pero no `ordenes.consultar`. Andrea autorizó expresamente asignar
esa lectura mediante migración. `LogisticaConsultaProduccion1710000000018` utiliza
el siguiente identificador libre de Auth, posterior a `1710000000017`. Reutiliza
el permiso del catálogo y agrega solo la asociación de ese rol: no concede crear
órdenes ni registrar calidad/consumos. La migración es idempotente y su down
conserva el permiso del catálogo y las asignaciones de otros roles.

Se aplicó en la base local `auth_db`, comprobando primero que era la única
migración pendiente. `migration:show` confirmó su aplicación y una consulta de
solo lectura confirmó la asociación del rol con `ordenes.consultar`.

El contenedor no tenía `PRODUCCION_SERVICE_URL`; el cliente intentaba consultar
`localhost:3002` dentro de Logística. `docker-compose.yml` ahora configura
`http://produccion-service:3002` y `http://auth-service:3001`, siguiendo las URLs
internas del proyecto. Se preservó el override local `docker-compose.auth-fix.yml`.
No se cambiaron credenciales ni se desactivaron guards.

## Comprobaciones ejecutadas

Desde `frontend`:

```powershell
npm run test:logistica
npm run test:session
npm run test:audit
npm run build
```

Resultados: **20 pruebas de Logística, 5 de sesión y 3 de auditoría aprobadas**;
compilación Vite correcta. Las pruebas de React recorren los servicios HTTP sin
reemplazarlos, simulando las respuestas de red y la identidad de la sesión.
Verifican el contrato, Bearer, varios ítems, cantidades, errores 401/403/404/409/500,
ausencia de éxito prematuro, GET después del POST, selección posterior al volver
a Crear boleta, navegación tras confirmar la boleta y protección de rutas. Los
stores de navegador de prueba rechazan cualquier escritura de documentos.

Desde `services/logistica-service`:

```powershell
$env:DB_DATABASE='logistica_db'
$env:LOGISTICA_DB_REAL='1'
$env:RUN_DB_INTEGRATION='true'
npm test -- --runInBand
npm run build
```

Resultado: **220 pruebas aprobadas en 22 suites, ninguna omitida**. El nuevo
`solicitud-boleta.http.persistencia.spec.ts` utiliza Nest, controladores, guards,
pipes, servicios, migraciones, transacciones y PostgreSQL reales en un esquema
aislado. Solo simula Auth y el cliente externo de Producción. Confirma solicitud,
listado, conversión en boleta, lectura tras reiniciar Nest, paginación, 400/401/403,
referencia ajena 404 y rollback ante fallo de un ítem. El error 500 forzado en esa
prueba es esperado. Las tablas de la aplicación no reciben fixtures.

Desde `services/auth-service`:

```powershell
$env:DB_DATABASE='auth_db'
$env:AUTH_DB_REAL='1'
npm test -- --runInBand logistica-consulta-produccion.migration
npm run build
npm run migration:show
npm run migration:run
npm run migration:show
```

Resultado: **1 prueba PostgreSQL aprobada**, compilación correcta y migración
`LogisticaConsultaProduccion1710000000018` aplicada en la base local.

Desde la raíz:

```powershell
docker compose -f docker-compose.yml -f docker-compose.auth-fix.yml --profile full up -d --build --no-deps logistica-service frontend
git diff --check
```

Se actualizaron únicamente los contenedores locales de Logística y frontend.
Desde el contenedor actualizado se invocó `BoletasService.findAll` contra la base
real `logistica_db`: listado OK, 0 documentos existentes, sin el error databaseName.
La conexión interna a los healthchecks de Producción y Auth devolvió HTTP 200.
No se crearon documentos ni usuarios demo para esa comprobación.

## Recorrido manual con la cuenta real

1. Cerrar sesión y volver a entrar con la cuenta Encargado de Logística para
   actualizar los permisos; recargar el frontend actualizado.
2. Abrir “Solicitudes de salida” (`/logistica/inicio`), seleccionar una orden real
   con lotes registrados, completar destino y motivo y agregar al menos un ítem.
3. Guardar y comprobar ID/estado confirmados y la fila recuperada por el GET.
4. Abrir “Boletas → Crear boleta”, seleccionar esa solicitud y guardar.
5. Consultar el detalle y recargar: la boleta y su número provienen de la base.

Las pruebas automatizadas confirman el flujo persistente y la selección de la
solicitud en la pantalla. No se presenta como una sesión manual realizada con las
credenciales del usuario. Si una orden no tiene lotes reales, la pantalla lo
informa y no permite inventarlos. No hay cambios de inventario ni emisión
automática de la boleta. Se conservaron los cambios previos; no se hizo commit,
merge ni push.

## Archivos del cambio

- `frontend/src/pages/LogisticaPage.jsx`: reemplaza el formulario simulado por
  consulta y creación mediante API, con selección de órdenes/lotes y manejo de errores.
- `frontend/src/pages/BoletaNuevaPage.jsx`: conserva el trabajo previo y completa
  permisos, consulta de solicitudes y referencias, protección ante respuestas
  tardías y confirmación antes de navegar.
- `frontend/src/pages/BoletasPage.jsx`: conserva el listado existente y agrega
  navegación hacia solicitudes de salida.
- `frontend/src/services/boletasService.js`: POST de solicitud con contrato exacto,
  confirmación de respuesta y conservación del error HTTP del servidor.
- `frontend/src/services/ordenesService.js`: conserva los cambios previos y añade
  el status HTTP al error de las consultas de órdenes.
- `frontend/src/services/solicitudesSalidaFormulario.js`: valida selección real,
  referencias, cantidades decimales y mensajes de error.
- `frontend/src/routes/AppRoutes.jsx` y `frontend/src/layouts/MainLayout.jsx`:
  navegación e inicio de Logística y rutas protegidas con permisos de solicitudes.
- `frontend/scripts/logistica.test.mjs`, `frontend/package.json` y
  `frontend/package-lock.json`: pruebas del servicio y pantalla; se añade
  `react-test-renderer` 18.3.1, de la misma versión que React, solo para desarrollo.
- `services/logistica-service/src/boletas/boletas.service.ts` y su `.spec.ts`:
  corrección del ORDER BY comprobado en logs y actualización de la expectativa.
- `services/logistica-service/src/solicitudes-salida/solicitud-boleta.http.persistencia.spec.ts`:
  recorrido HTTP y PostgreSQL con reinicio, permisos y rollback.
- `services/logistica-service/src/solicitudes-salida/README.md`: actualiza el
  contrato, permisos y cobertura que habían quedado desactualizados.
- `services/auth-service/src/database/migrations/1710000000018-LogisticaConsultaProduccion.ts`
  y `services/auth-service/src/database/logistica-consulta-produccion.migration.spec.ts`:
  autorización de lectura aprobada y su prueba PostgreSQL.
- `docker-compose.yml`: URLs internas necesarias para las consultas de Logística.
- Este documento: evidencia y reproducción.

Los archivos que ya estaban modificados al iniciar se conservaron. En especial,
no se revirtieron los avances de detalle/impresión de boletas, disponibilidad de
órdenes ni los simuladores de Inventarios.
