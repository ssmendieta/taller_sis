# ABC-299: snapshot persistente y API de resumen de cierre

`CierreProduccion` se guarda en `cierres_produccion`. Cada registro conserva una
versión inmutable del cierre de una orden `FINALIZADA` con fecha de finalización.
No se modifica la orden ni se vuelven a guardar avances, resultados de calidad
o registros individuales de consumo: el snapshot almacena sus totales al cierre.

## Datos conservados

- Relación `orden_id` con la orden existente, usando `ON DELETE RESTRICT`.
- `cierreVersion`, entero positivo con valor inicial 1, como el contrato de
  Contabilidad. La combinación orden y versión es única incluso ante inserciones
  simultáneas; otra versión ocupa un registro diferente.
- Cantidades solicitada, producida, conforme y defectuosa, como texto decimal
  `NUMERIC(14,4)`. Las cantidades reales pueden ser cero. Conformes más defectuosas
  no pueden superar lo producido, siguiendo la regla existente de calidad.
- `consumos`, JSONB con los campos de `ConsumoCierreV1`: material ID, código,
  nombre, cantidad y unidad. El servicio suma registros del mismo
  material **y unidad**, siguiendo ABC-71; no combina kg con g, por ejemplo.
  Un cierre sin consumos conserva un arreglo vacío.
- Código de orden, datos del producto y fecha de finalización congelados, para
  que una lectura futura no dependa de nombres o fechas actuales del catálogo.
  Se reutiliza `ProduccionCerradaV1Data['producto']`; no se crea otra entidad de
  producto ni otro contrato de mensaje.
- `fechaCierre`, fecha/hora de creación del snapshot generada por PostgreSQL.

Las cantidades producidas se obtienen de avances, y las conformes/defectuosas de
los respectivos tipos de `ResultadoConforme` (ABC-82/83). La subtarea 2 incorpora
`CierreProduccionService`: verifica la orden y sus datos de producto, calcula
desde las fuentes persistidas y guarda el snapshot en una transacción
`REPEATABLE READ`, con bloqueo de escritura de la orden. Todas las consultas
de preparación usan el mismo `EntityManager`, con una vista consistente de las
fuentes. Los totales decimales se mantienen como texto y se validan con enteros
escalados, sin sumar cantidades mediante `number`.
La lectura del cierre se hace desde sus columnas y JSONB, sin recalcular desde
las fuentes. La relación `orden` sigue siendo una referencia a la orden actual;
sus campos vivos no sustituyen a los campos históricos del snapshot.

## Inmutabilidad y relación con el contrato existente

La migración impide `UPDATE`, `DELETE` y `TRUNCATE` mediante triggers PostgreSQL,
siguiendo el patrón de inmutabilidad usado en auditoría. También valida el
estado y la fecha de finalización de la orden antes de insertar, tomando un
bloqueo compartido mientras comprueba el estado. No impide que las fuentes
cambien posteriormente: sus cambios no alteran el contenido ya guardado.

La restricción única devuelve el error PostgreSQL `23505` para una orden/versión
duplicada. Una orden no finalizada o datos numéricos inválidos producen `23514`;
una orden inexistente produce `23503`. Los intentos de modificar el snapshot
producen `55000`. La API valida las precondiciones y devuelve 404 para orden o
snapshot inexistentes, 409 para orden no finalizada, totales inconsistentes o
versión repetida, y 400 para referencias inválidas. El servicio también convierte
la violación de la restricción única y los conflictos de serialización en 409.
Un conflicto de serialización permite volver a intentar la operación; nunca
confirma un snapshot parcial.

## API protegida (subtarea 2)

Se reutilizan `PermisoProduccionGuard` y los permisos existentes en Auth:

| Operación | Ruta del servicio | Permiso |
| --- | --- | --- |
| Preparar | `POST /cierres-produccion` | `ordenes.finalizar_cancelar` |
| Consultar una versión | `GET /cierres-produccion/orden/:ordenId?cierreVersion=1` | `ordenes.consultar` |

El gateway antepone `/api/produccion`. La preparación usa el permiso de cierre
de órdenes, sin crear permisos nuevos; no cambia el estado de la orden.
Sin sesión devuelve 401 y sin el permiso de la operación devuelve 403.

Body del POST:

```json
{
  "ordenId": 15,
  "cierreVersion": 1
}
```

Solo se aceptan esos campos: cantidades, consumos, producto y fechas los obtiene
el servidor. Si se omite `cierreVersion`, se usa 1 tanto en POST como en GET.
La versión debe ser un entero positivo representable por el INTEGER de BD.
El POST devuelve 201 y el snapshot recién leído de BD; el GET devuelve 200 y ese
mismo objeto, sin unirlo con datos actuales ni volver a calcular cantidades.
Fechas se serializan como ISO y cantidades/IDs BIGINT como texto.

Repetir el POST para la misma orden/versión devuelve 409 y mantiene el snapshot
anterior. No genera una versión nueva automáticamente. Una versión diferente
debe solicitarse explícitamente; se guarda como otro registro sin sobrescribir
los anteriores. Consultar una versión todavía no preparada da 404.

El contrato `ProduccionCerrada.v1` ya contiene `cierreVersion`, conformes,
consumos y metadatos de orden/producto. No incluye producidas ni defectuosas:
esas cantidades se guardan en el modelo solicitado por ABC-299 sin cambiar el
contrato de otra historia. El identificador persistido es `id` (BIGINT como texto);
la asignación de `cierreId`/`resumenId` al mensaje queda para la integración.
No se conecta el outbox ni se publican mensajes. No hay asientos, costos,
impuestos ni cambios de inventario.

## Migración y verificación

La última migración existente era `EventosOutbox1710000000017`; se añade
`CierresProduccion1710000000018`, sin modificar las anteriores. `AppModule`
importa `CierreProduccionModule`, que registra repositorios, controlador, servicio
y guard. La subtarea 2 amplía ese módulo sin añadir otra importación en AppModule
ni crear una migración nueva.

Desde `services/produccion-service`, revisar y aplicar en la base correcta:

```powershell
$env:DB_DATABASE = 'produccion_db'
npm run migration:show
npm run migration:run
npm run migration:show
```

`migration:run` aplica todas las migraciones pendientes: revisar la lista antes.
En SQL, sobre la misma conexión:

```sql
SELECT current_database();
SELECT id, orden_id, cierre_version, cantidad_producida, cantidad_conforme,
       cantidad_defectuosa, consumos, finalizada_at, fecha_cierre
FROM cierres_produccion ORDER BY orden_id, cierre_version;
```

Pruebas:

```powershell
$env:DB_DATABASE = 'produccion_db'
$env:CIERRE_DB_REAL = '1'
npm test -- --runInBand cierre-produccion
npm run build
```

Las pruebas usan un esquema PostgreSQL aislado y aplican las migraciones reales.
Guardan 100 producidas, 95 conformes, 5 defectuosas y consumos 10+13 kg; mantienen
separado un consumo histórico en g del mismo material. Cierran una aplicación
Nest con este módulo y arrancan otra contra el mismo esquema, comprobando los
datos persistidos. También prueban cambios de las fuentes, duplicados simples
y concurrentes, versiones independientes, estados no finalizados, restricciones,
inmutabilidad y reversión/reaplicación. No reinician el servicio local del usuario
ni aplican la migración a las tablas de la aplicación durante las pruebas.

Las pruebas de API recorren HTTP con controlador, servicio, DTO y guard reales;
solo simulan la identidad de Auth. Comparan las respuestas POST/GET con la fila
persistida, verifican varias unidades y materiales, rechazos 404/409 sin datos
parciales, autorización 401/403, versiones explícitas y repetición concurrente.
Un fallo simulado después del INSERT comprueba el rollback efectivo del snapshot.

### Regresión de congelación (subtarea 3)

Se amplían las pruebas existentes, sin cambiar el flujo de producción. Tras
preparar y consultar una versión, se corrige por separado un consumo histórico
de `500 g` a `0.5 kg` y se reclasifican defectos como conformes en los datos de
prueba. La lectura y la fila persistida deben seguir siendo exactamente iguales
al snapshot original, incluyendo IDs, fechas, cantidades y unidades. Repetir la
preparación devuelve 409 y no genera otra versión automáticamente.

La versión 2 se solicita con el POST existente y captura los valores corregidos.
Se comprueba que las dos versiones siguen intactas tras otras correcciones y
tras cerrar y arrancar la aplicación de prueba. Una corrección inconsistente
rechaza la nueva versión y conserva la anterior.

Las correcciones se simulan con SQL exclusivamente en el esquema aislado: las
APIs actuales de consumos y calidad no ofrecen edición. Tampoco existe todavía
un estado de reporte a Contabilidad; esta regresión verifica el snapshot
preparado y persistido, sin simular un envío ni añadir estados. El diagrama de
clases mantiene el mismo flujo y no requiere cambios.

Diagrama: [clases del cierre](../../../../docs/diagramas/cierre-produccion-clases.md).
