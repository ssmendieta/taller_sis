# ABC-294: Identificar con un lote las unidades conformes

El título y la clave fueron confirmados por Andrea a partir de la ficha Jira.
Se implementan las subtareas 1 (modelo y regla de cantidad) y 4 (pruebas).
ABC-82 ya persiste los resultados en `resultados_conformes`; ABC-83 añade
`tipo`. Para lotes solo se cuentan los registros `CONFORME`, no los defectos.

## Modelo y regla

`Lote` se guarda en `lotes`, con orden existente, código, cantidad de conformes
`NUMERIC(14,4)`, responsable y fecha/hora generada por PostgreSQL. El responsable
es un ID de Auth, sin clave foránea entre bases de datos. La relación de orden
usa `ON DELETE RESTRICT`.

El alcance adoptado para “código único” es todo Producción, igual que los códigos
de orden y material del proyecto. `uq_lotes_codigo` aplica esa unicidad en BD.
El servicio recorta espacios exteriores; el código admite hasta 80 caracteres
y distingue mayúsculas de minúsculas. La BD rechaza códigos vacíos o con espacios
exteriores, cantidades no positivas o `NaN`, y responsables no positivos.

`LotesService.create({ ordenId, codigo, cantidad }, usuarioId)` toma el responsable
del llamador y deja que la BD genere la fecha. El método solo copia esos campos.
Valida la existencia de la orden y calcula dentro de una misma transacción:

```text
conformes disponibles = SUM(resultados CONFORME de la orden) - SUM(lotes de la orden)
cantidad nueva <= conformes disponibles
```

La orden se bloquea con `pessimistic_write`, el mismo criterio usado en calidad,
para serializar asignaciones simultáneas. Las comparaciones decimales conservan
los cuatro decimales mediante enteros escalados. No se modifican los registros
de calidad ni se descuentan existencias de Inventarios.

Un código repetido o una cantidad superior a los conformes sin asignar provoca
`ConflictException` (409), sin insertar el lote. La restricción única también
protege el mismo código creado simultáneamente para órdenes distintas; el
servicio traduce ese error de BD a 409 después del rollback. Una orden inexistente
da 404, los datos inválidos 400 y un responsable inválido 401.

El control de disponibilidad acumulada se realiza en el servicio transaccional;
no es un CHECK de fila. Los futuros puntos de escritura deben usar este servicio
para conservar esa regla.

`LotesModule` registra las entidades, el servicio y el controlador; `AppModule`
importa ese módulo. La API actual expone `POST /lotes`, protegido con
`calidad.registrar_conformes`, y `GET /lotes/orden/:ordenCodigo`, protegido con
`ordenes.consultar`. El gateway antepone `/api/produccion`. El permiso de creación
ya se define en Auth mediante `CalidadRegistrarConformes1710000000013`.
La subtarea 4 prueba esa API existente; no añade endpoints, permisos ni pantalla.

## Migración y pruebas

La migración `Lotes1710000000016` usa el identificador libre posterior a
`TipoResultadoCalidad1710000000015`. No cambia las migraciones anteriores.
Para revisar y aplicar en la base correcta, desde `services/produccion-service`:

```powershell
$env:DB_DATABASE = 'produccion_db'
npm run migration:show
npm run migration:run
npm run migration:show
```

`migration:run` aplica todas las migraciones pendientes; revisar su lista antes.
Después debe aparecer aplicada `Lotes1710000000016`. Consultas para verificar:

```sql
SELECT current_database();
SELECT id, codigo, orden_id, cantidad, responsable_usuario_id, fecha_hora
FROM lotes ORDER BY id;
```

Pruebas de las subtareas 1 y 4:

```powershell
$env:DB_DATABASE = 'produccion_db'
$env:LOTES_DB_REAL = '1'
npm test -- --runInBand lotes
npm run build
```

Las pruebas PostgreSQL crean y eliminan un esquema aislado, sin aplicar la
migración a las tablas de la aplicación. Registran conformes mediante el servicio
de ABC-82 y defectos mediante ABC-83. Verifican 10 + 13 conformes asignables como
23, persistencia tras reconectar, código repetido global, asignación excesiva,
defectos excluidos, órdenes sin conformes, concurrencia, restricciones de BD y
reversión/reaplicación. Los rechazos conservan los lotes anteriores sin datos
parciales.

Las pruebas HTTP de `lotes.persistencia.spec.ts` arrancan `LotesModule` con
TypeORM y PostgreSQL reales en el mismo esquema aislado. Solo simulan la respuesta
de identidad/permisos de Auth; no reemplazan el guard, controlador, DTO, servicio
ni la transacción. Verifican 201/200 para creación y consulta, duplicados globales
y saldo insuficiente con 409, orden inexistente con 404, datos inválidos con 400,
permiso ausente con 403 y falta de sesión con 401. Comparan las filas antes y
después de cada rechazo y comprueban rollback ante un fallo simulado después del
INSERT real. La creación tampoco altera los resultados de calidad ni avances.
Estas pruebas no acreditan un login contra el servicio Auth real ni la asignación
efectiva de permisos de una cuenta del entorno.

Resumen para Jira: [ABC-294, subtarea 4](../../../../docs/evidencias/lotes/ABC-294-subtarea-4.md).
