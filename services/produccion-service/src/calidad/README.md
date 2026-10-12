# Resultado conforme — ABC-82

`ResultadoConforme` se guarda en `resultados_conformes`: orden existente,
cantidad positiva `NUMERIC(14,4)`, identificador del responsable y fecha/hora
automática `TIMESTAMPTZ`. El responsable pertenece a Auth, en otra base de
datos; se guarda su identificador sin una clave foránea entre bases.

`CalidadModule` registra el repositorio mediante `TypeOrmModule.forFeature` y
`AppModule` importa ese módulo. No modifica avances ni inventario.

## API protegida — subtarea 2

- `POST /calidad/conformes`: permiso `calidad.registrar_conformes`.
- `GET /calidad/conformes/orden/:ordenId`: permiso existente `ordenes.consultar`.

El guard existente valida la sesión y los permisos consultando Auth. Sergio debe
crear y asignar `calidad.registrar_conformes` en Auth (pendiente confirmado).
Los permisos de registrar avances no autorizan esta operación.

Body del POST: `{ "ordenId": 1, "cantidad": 10 }`. Responsable y fecha los
establece el servidor; campos adicionales se rechazan con 400. Datos inválidos
dan 400, falta de sesión 401, falta de permiso 403 y orden inexistente 404.

El registro bloquea la orden dentro de una transacción, suma sus avances y sus
conformes y compara los acumulados con cuatro decimales. Un exceso da 409 antes
de insertar. El bloqueo compartido con el registro de avances evita que altas
simultáneas superen lo producido. La consulta devuelve los registros separados.
No hay migración adicional para la subtarea 2.

## Verificar la migración en la base de producción local

Desde `services/produccion-service`, con las credenciales de PostgreSQL local
configuradas, usar PowerShell:

```powershell
$env:DB_DATABASE = 'produccion_db'
npm run migration:show
npm run migration:run
npm run migration:show
```

`DB_DATABASE` tiene prioridad sobre las otras variables de nombre de base.
Si la base de producción de tu entorno tiene otro nombre, usa ese nombre.
`migration:run` aplica todas las migraciones pendientes del servicio; revisar
primero la lista. La nueva debe aparecer aplicada como
`ResultadosConformes1710000000014`.

En una conexión SQL a esa misma base, verificar:

```sql
SELECT current_database(); -- debe ser produccion_db
SELECT to_regclass('public.resultados_conformes');
SELECT id, orden_id, cantidad, responsable_usuario_id, fecha_hora
FROM resultados_conformes ORDER BY id;
```

## Pruebas

```powershell
$env:DB_DATABASE = 'produccion_db'
$env:CALIDAD_DB_REAL = '1'
npm test -- --runInBand calidad
npm run build
```

La prueba usa un esquema aislado: confirma un resultado, cierra y reabre la
conexión y consulta de nuevo sus datos. Comprueba restricciones y reversión de
la migración, y elimina su esquema al finalizar. No aplica la migración a las
tablas de la aplicación ni requiere reiniciar el servicio en ejecución.
