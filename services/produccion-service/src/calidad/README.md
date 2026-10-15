# Resultado conforme — ABC-82

## Clasificación de resultados — ABC-83, subtarea 1

Se reutiliza `ResultadoConforme` y su tabla `resultados_conformes` para conservar
la integración de ABC-82. La migración `TipoResultadoCalidad1710000000015`
añade `tipo` (`CONFORME` o `DEFECTUOSO`) y `causa_defecto` (hasta 500 caracteres).
Los registros anteriores quedan como `CONFORME`, sin causa. Un defecto exige
causa no vacía; un conforme no admite causa. Se mantienen las restricciones de
cantidad positiva, orden existente, responsable y fecha/hora automática.

Los resultados se consultan por `ordenId` y `tipo` mediante el repositorio
existente. La subtarea 1 no añadió una API de defectos ni cambió permisos.
No registra merma ni modifica consumos.

```sql
SELECT tipo, cantidad, causa_defecto, responsable_usuario_id, fecha_hora
FROM resultados_conformes WHERE orden_id = 1 ORDER BY tipo, id;
```

Las pruebas guardan 95 conformes y 5 defectuosas sobre 100 producidas, cierran
y reabren la conexión y consultan cada tipo por separado. La reversión de esta
migración se rechaza si hay defectos para evitar perder su clasificación y causa.

`ResultadoConforme` se guarda en `resultados_conformes`: orden existente,
cantidad positiva `NUMERIC(14,4)`, identificador del responsable y fecha/hora
automática `TIMESTAMPTZ`. El responsable pertenece a Auth, en otra base de
datos; se guarda su identificador sin una clave foránea entre bases.

`CalidadModule` registra el repositorio mediante `TypeOrmModule.forFeature` y
`AppModule` importa ese módulo. No modifica avances ni inventario.

## API protegida — ABC-82 y ABC-83, subtarea 2

- `POST /calidad/conformes`: permiso `calidad.registrar_conformes`.
- `GET /calidad/conformes/orden/:ordenId`: permiso existente `ordenes.consultar`.

El guard existente valida la sesión y los permisos consultando Auth. Sergio debe
crear y asignar `calidad.registrar_conformes` en Auth (pendiente confirmado).
Los permisos de registrar avances no autorizan esta operación.

Body del POST: `{ "ordenId": 1, "cantidad": 10 }`. Responsable y fecha los
establece el servidor; campos adicionales se rechazan con 400. Datos inválidos
dan 400, falta de sesión 401, falta de permiso 403 y orden inexistente 404.

Se reutiliza el POST existente para registrar defectos, con el mismo permiso
de calidad, sin añadir rutas ni permisos. El nombre de la ruta se conserva por
compatibilidad con ABC-82. Si se omite `tipo`, se registra un conforme.

```json
{
  "ordenId": 1,
  "cantidad": 5,
  "tipo": "DEFECTUOSO",
  "causaDefecto": "Sellado incompleto"
}
```

La causa es obligatoria para defectos, se recortan los espacios de los extremos
y admite hasta 500 caracteres. Los conformes no admiten causa.
El GET permite `?tipo=DEFECTUOSO`; sin filtro devuelve conformes.

El registro bloquea la orden dentro de una transacción, suma sus avances y sus
resultados (conformes y defectuosos) y compara con cuatro decimales que el
acumulado conjunto más la cantidad nueva no supere lo producido. La validación
se aplica a los dos tipos. Un exceso da 409 antes
de insertar. El bloqueo compartido con el registro de avances evita que altas
simultáneas superen lo producido. La consulta devuelve los registros separados.
No hay migración adicional para la subtarea 2.

Las pruebas verifican 100 producidas, 95 conformes y 5 defectuosas; rechazan
causa vacía y 6 defectuosas sin cambiar los registros anteriores. Comparan los
consumos de ABC-71 antes y después y prueban altas simultáneas de ambos tipos.

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
`ResultadosConformes1710000000014` y `TipoResultadoCalidad1710000000015`.

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
