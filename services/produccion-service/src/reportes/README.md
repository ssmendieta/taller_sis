# ABC-336 — Endpoint de datos del reporte (HU ABC-109)

Contrato para ABC-337. Consulta de solo lectura; no crea entidades ni tablas,
no prepara cierres y no genera exportaciones (ABC-338).

## Ruta y permisos

- Servicio: `GET /reportes/produccion`.
- Gateway: `GET /api/produccion/reportes/produccion`.
- El gateway elimina `/api/produccion`; el controlador usa el prefijo corto.
- Cabecera `Authorization: Bearer <token>` y permiso `ordenes.consultar`,
  mediante el `PermisoProduccionGuard` existente que consulta Auth.
- 200: reporte, incluso vacío. 400: consulta inválida. 401: sesión ausente o
  inválida. 403: permiso ausente. 503: Auth no disponible.

## Filtros y período

Los tres parámetros son opcionales, se combinan con AND y no admiten valores
vacíos, repetidos, objetos ni parámetros adicionales (tampoco page/limit).
La validación reutiliza las reglas de fechas y producto de ABC-332.

| Parámetro | Regla |
| --- | --- |
| `fechaDesde` | Fecha real YYYY-MM-DD, año 0001–9999. Incluye órdenes con `fecha_programada >= fechaDesde`. |
| `fechaHasta` | Mismo formato. Incluye órdenes con `fecha_programada <= fechaHasta`. |
| `producto` | 1–150 caracteres tras recortar espacios exteriores. Búsqueda parcial por código o nombre, sin distinguir mayúsculas. `%`, `_` y `\` son literales. |

`fechaDesde <= fechaHasta`. Se permiten rangos abiertos; omitir ambas fechas
selecciona todos los períodos. Se usa **la fecha programada actual de la orden**,
columna DATE, con ambos extremos inclusivos, sin conversión horaria, igual que
ABC-332. El reporte reúne todos los registros de esas órdenes, incluso si el
evento de avance, pérdida o reproceso ocurrió fuera del rango. No representa
actividad realizada exclusivamente durante los días del filtro.

Sin filtro de producto se incluyen todos los productos y estados de orden.
Para órdenes con cierre, el filtro de producto utiliza código/nombre congelados;
sin cierre, utiliza la receta actual. Esta diferencia respecto al historial
ABC-332 es intencional para conservar la identidad del snapshot.

## Fuentes y reglas de cálculo

La consulta SQL es una sola sentencia SELECT con una instantánea consistente
de PostgreSQL. Cada relación 1:N se suma por separado en una subconsulta antes
de combinar sus resultados; nunca se unen directamente avances, calidad,
consumos, pérdidas y reprocesos entre sí.

| Medida | Orden sin cierre | Orden con cierre |
| --- | --- | --- |
| `solicitada` | `ordenes_produccion.cantidad_solicitada` | `cantidad_solicitada` del cierre elegido |
| `producida` | SUM de `avances_produccion.cantidad_producida` | `cantidad_producida` del cierre |
| `conforme` | SUM de `resultados_conformes.cantidad` con tipo CONFORME | `cantidad_conforme` del cierre |
| `defectuosa` | SUM de la misma tabla con tipo DEFECTUOSO | `cantidad_defectuosa` del cierre |
| `consumos` | SUM de `consumos_material.cantidad` por material y unidad | SUM de los elementos JSONB `consumos` del cierre por material y unidad |
| `perdidas` | SUM de `perdidas_materia_prima.cantidad` por material y unidad | Misma fuente; no está incluida en el cierre |
| `reprocesada`, `recuperada`, `descartada` | SUM de `reprocesos.cantidad_procesada`, `cantidad_recuperada`, `cantidad_descartada` | Misma fuente; no está incluida en el cierre |

Se elige **solo la mayor `cierre_version` de cada orden** (desempate por id).
No se usa `estado_contable` para seleccionar versiones. Nunca se suma el cierre
con sus avances, calidad o consumos originales, ni con versiones anteriores.
Código de orden y datos completos de producto, incluido el id de receta,
provienen del snapshot cuando existe. No se modifica ninguna versión.

Pérdidas y reprocesos son acumulados actuales y pueden ser posteriores al
cierre: el reporte completo no constituye otro cierre inmutable. Se indican
`fuente` y `cierre` por orden para hacer explícita la procedencia de cantidades
principales y consumos. No hay que interpretar `fuente: CIERRE` como procedencia
de las pérdidas o reprocesos.

Los reprocesos representan tratamiento de defectos ya contabilizados, no nueva
producción: lo recuperado no se suma a producida ni a conforme, ni se resta de
defectuosa. Se conservan las clasificaciones originales y se presentan los tres
acumulados de reproceso en columnas separadas, en la unidad del producto.
El descarte de producto reprocesado no se mezcla con pérdidas de materia prima.
`reprocesada` suma tratamientos registrados; no representa unidades originales
distintas si una misma cantidad se procesó más de una vez.

Las sumas en SQL usan NUMERIC; las sumas entre órdenes usan BigInt escalado a
cuatro decimales. Todas las cantidades se devuelven como **strings con cuatro
decimales**, incluso cero; no se suman ni redondean con `number`.

Los totales de producto se separan por id de receta, código, nombre y unidad:
no se combinan recetas/versiones distintas aunque compartan código. Si falta
la unidad, se conserva un grupo independiente por orden, con unidad null.
Los totales de materia prima se separan por id de material y unidad, a través
de todas las órdenes seleccionadas. No se convierten kg a g ni otras unidades,
ni se devuelve un gran total de cantidades de productos incompatibles.

## Contrato de respuesta

| Campo | Contenido |
| --- | --- |
| `filtros` | `fechaDesde`, `fechaHasta`, `producto` efectivos o null; `campoFecha: "fecha_programada"`. |
| `ordenes` | Detalle ordenado por `fecha_programada DESC, id DESC`. Sin paginación en esta subtarea. |
| `ordenes[].ordenId` | Número entero, id de orden. |
| `ordenes[].codigo` | String, código de orden actual o congelado. |
| `ordenes[].fechaProgramada` | String YYYY-MM-DD, fecha usada para seleccionar la orden. |
| `ordenes[].producto` | `recetaId` numérico (es receta_id, no id externo), `codigo`, `nombre`, `unidad` strings, estos tres últimos pueden ser null si falta receta sin cierre. |
| `ordenes[].fuente` | `REGISTROS` o `CIERRE`, aplica a cantidades principales y consumos. |
| `ordenes[].cierre` | null o `{id: string, version: number}`; BIGINT conservado como string. |
| `ordenes[].cantidades` | Strings: `solicitada`, `producida`, `conforme`, `defectuosa`, `reprocesada`, `recuperada`, `descartada`. Unidad en `producto.unidad`. |
| `ordenes[].consumos`, `ordenes[].perdidas` | Listas de `{materialId: string, unidad: string, cantidad: string}`; unidad persistida en cada registro. |
| `totales.ordenes` | Número de órdenes seleccionadas. |
| `totales.productos` | Listas de `{producto, cantidades}` con los mismos campos del detalle, acumulados por grupo compatible. Orden de primera aparición en el detalle. |
| `totales.consumos`, `totales.perdidas` | Mismo formato que en detalle, agrupados por material/unidad y ordenados por materialId textual y unidad. |

Los materiales del detalle se ordenan por materialId numérico y unidad. Los
nombres de material se pueden resolver por id en el catálogo existente; no se
mezclan etiquetas actuales con los nombres históricos del snapshot.

Ejemplo ilustrativo:

```http
GET /api/produccion/reportes/produccion?fechaDesde=2026-11-01&fechaHasta=2026-11-07&producto=pan
Authorization: Bearer <token>
```

```json
{
  "filtros": {"fechaDesde":"2026-11-01","fechaHasta":"2026-11-07","producto":"pan","campoFecha":"fecha_programada"},
  "ordenes": [{
    "ordenId":42,"codigo":"ORD-2026-00042","fechaProgramada":"2026-11-02",
    "producto":{"recetaId":3,"codigo":"PAN-01","nombre":"Pan","unidad":"kg"},
    "fuente":"CIERRE","cierre":{"id":"12","version":2},
    "cantidades":{"solicitada":"10.0000","producida":"8.0000","conforme":"6.0000","defectuosa":"2.0000","reprocesada":"1.0000","recuperada":"0.8000","descartada":"0.2000"},
    "consumos":[{"materialId":"1","unidad":"kg","cantidad":"3.0000"}],
    "perdidas":[{"materialId":"1","unidad":"kg","cantidad":"0.5000"}]
  }],
  "totales": {
    "ordenes":1,
    "productos":[{
      "producto":{"recetaId":3,"codigo":"PAN-01","nombre":"Pan","unidad":"kg"},
      "cantidades":{"solicitada":"10.0000","producida":"8.0000","conforme":"6.0000","defectuosa":"2.0000","reprocesada":"1.0000","recuperada":"0.8000","descartada":"0.2000"}
    }],
    "consumos":[{"materialId":"1","unidad":"kg","cantidad":"3.0000"}],
    "perdidas":[{"materialId":"1","unidad":"kg","cantidad":"0.5000"}]
  }
}
```

Sin coincidencias se conserva la estructura:

```json
{
  "filtros":{"fechaDesde":null,"fechaHasta":null,"producto":"inexistente","campoFecha":"fecha_programada"},
  "ordenes":[],
  "totales":{"ordenes":0,"productos":[],"consumos":[],"perdidas":[]}
}
```

## Exportaciones ABC-338

Las exportaciones reutilizan exactamente el resultado normalizado del endpoint
anterior, incluidos filtros, cantidades con cuatro decimales, unidades y
totales. No vuelven a consultar ni recalculan los datos por separado.

```http
GET /api/produccion/reportes/produccion/exportar/pdf?fechaDesde=2026-11-01&fechaHasta=2026-11-07&producto=pan
GET /api/produccion/reportes/produccion/exportar/xlsx?fechaDesde=2026-11-01&fechaHasta=2026-11-07&producto=pan
Authorization: Bearer <token>
```

Ambas rutas exigen `ordenes.consultar` y aceptan las mismas reglas de filtros
que la vista previa. El PDF usa formato A4 horizontal, repite los encabezados
al paginar e incluye detalle y totales. El libro Excel contiene las hojas
`Resumen`, `Ordenes` y `Materiales por orden`, con filtros de tabla y paneles
inmovilizados. Las respuestas usan `Content-Disposition: attachment`, el MIME
del formato y `Cache-Control: no-store`. Solo se admiten `pdf` y `xlsx`.

## Validación local

Desde `services/produccion-service`:

```powershell
$env:REPORTES_DB_REAL='1'; npm test -- --runInBand src/reportes
npm run build
```

Las pruebas de ABC-338 abren el XLSX con ExcelJS y cargan el PDF con un parser
independiente; además comprueban paginación real con un reporte extenso.

Las pruebas PostgreSQL usan tablas temporales de una conexión exclusiva, sin
modificar datos ni secuencias reales ni aplicar migraciones. Tras preparar los
datos, ejecutan el reporte dentro de una transacción READ ONLY y la revierten
al terminar. Requieren PostgreSQL disponible con la configuración existente de
AppDataSource y permiso TEMPORARY. Sin `REPORTES_DB_REAL=1`, sus 11 casos se
omiten explícitamente. Las pruebas HTTP usan Nest y el guard real, simulando
Auth y el servicio de cálculo.
