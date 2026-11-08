# ABC-332 — Historial de órdenes (HU ABC-108)

Contrato para ABC-333. Consulta de solo lectura sobre `OrdenProduccion` y la
receta referenciada por `ordenes_produccion.receta_id`. No requiere migraciones.
El listado incluye todos los estados, salvo que se indique un filtro.

## Ruta y acceso

- Gateway: `GET /api/produccion/historial/ordenes`.
- Servicio: `GET /historial/ordenes`. El gateway elimina `/api/produccion`.
- Cabecera: `Authorization: Bearer <token>`.
- `PermisoProduccionGuard` valida la sesión con Auth y exige `ordenes.consultar`.
- Respuestas: 200 al consultar, 400 por parámetros inválidos, 401 sin sesión
  válida, 403 sin permiso y 503 si Auth no puede comprobar la sesión.

## Parámetros de consulta

Todos son opcionales y se combinan con AND. No se admiten parámetros repetidos,
vacíos, objetos ni parámetros desconocidos.

| Parámetro | Contrato |
| --- | --- |
| `fechaDesde` | Fecha real `YYYY-MM-DD`, año 0001–9999. `fecha_programada >= fechaDesde`. |
| `fechaHasta` | Mismo formato. `fecha_programada <= fechaHasta`. |
| `estado` | Valor exacto: `PENDIENTE`, `PLANIFICADA`, `EN_PRODUCCION`, `FINALIZADA`, `CANCELADA`. |
| `producto` | Texto de 1–150 caracteres tras quitar espacios exteriores. Coincidencia parcial sin distinguir mayúsculas en código **o** nombre de la receta de la orden. `%`, `_` y `\` se buscan literalmente. |
| `page` | Entero positivo en notación decimal, sin ceros iniciales. Por defecto 1. Debe ser un entero seguro de JavaScript y producir un offset seguro. |
| `limit` | Entero entre 1 y 100, sin ceros iniciales. Por defecto 10. |

`fechaDesde` no puede superar `fechaHasta`. Se permiten filtros de un solo
extremo. El campo utilizado es **`fecha_programada`**, de tipo DATE: ambos extremos
son inclusivos y no se realizan conversiones de zona horaria. No se filtra por
fecha de creación, finalización ni cambio de estado.

## Respuesta 200

```http
GET /api/produccion/historial/ordenes?fechaDesde=2026-11-01&fechaHasta=2026-11-07&estado=FINALIZADA&producto=pan&page=1&limit=10
Authorization: Bearer <token>
```

Ejemplo ilustrativo:

```json
{
  "items": [
    {
      "id": 42,
      "codigo": "ORD-2026-00042",
      "producto_id": 3,
      "producto_codigo": "PAN-01",
      "producto_nombre": "Pan integral",
      "unidad_producto": "kg",
      "cantidad_solicitada": "20.00",
      "fecha_programada": "2026-11-02",
      "estado": "FINALIZADA",
      "responsable_usuario_id": 7,
      "responsable_nombre": "Ana Pérez"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

| Campo de cada orden | Tipo y significado |
| --- | --- |
| `id` | Número entero; id de la orden. |
| `codigo` | String; código de la orden. |
| `producto_id` | Número entero; propiedad existente de `OrdenProduccion` que corresponde a **receta_id**, no a un catálogo externo de productos. |
| `producto_codigo`, `producto_nombre`, `unidad_producto` | Strings de la receta referenciada; null si no se encuentra la receta. No se limita a recetas activas ni se unen otras versiones por código. |
| `cantidad_solicitada` | String decimal con dos decimales para conservar la precisión de la columna. |
| `fecha_programada` | String `YYYY-MM-DD`. |
| `estado` | String con el estado actual de la orden. |
| `responsable_usuario_id` | Número entero; responsable registrado en la orden. |
| `responsable_nombre` | String; nombre registrado, o `Usuario #<id>` si es nulo o blanco. |

`total`, `page`, `limit` y `totalPages` son números enteros. `total` cuenta todas
las órdenes que cumplen los filtros, antes de paginar. `totalPages` es
`ceil(total / limit)`; vale 0 cuando no hay coincidencias. Una página fuera del
rango devuelve `items: []` conservando el total y la página solicitada.

Orden explícito: `fecha_programada DESC, id DESC`. LIMIT y OFFSET se aplican en
PostgreSQL. El único join es por la PK de la receta, de cardinalidad 0:1; no se
unen materiales, avances ni cambios de estado que multipliquen las órdenes.
El conteo usa una copia de la misma consulta con los mismos filtros.

La estabilidad del orden se garantiza para datos sin cambios entre consultas.
La paginación por offset no mantiene una instantánea entre solicitudes, y el
conteo y el listado se leen en dos sentencias: escrituras concurrentes pueden
cambiar el total o desplazar filas. Los datos de producto corresponden a la
receta existente, sin crear una nueva instantánea histórica.

Esta subtarea no implementa línea temporal ni frontend. La consulta existente
`GET /ordenes/:id/historial` y la búsqueda `GET /ordenes/buscar` se conservan.

## Validación

Desde `services/produccion-service`:

```powershell
$env:HISTORIAL_DB_REAL='1'; npm test -- --runInBand src/historial
npm run build
```

Las pruebas HTTP arrancan Nest con el guard real, simulan únicamente Auth y el
servicio de consulta y comprueban validación, transformación y permisos. Las
pruebas de persistencia ejecutan el servicio y su QueryBuilder contra PostgreSQL
usando la configuración existente de `AppDataSource`. Crean tablas temporales
en una conexión exclusiva y revierten la transacción al terminar, sin modificar
filas ni secuencias reales. Requieren acceso a PostgreSQL y permiso TEMPORARY.
Sin `HISTORIAL_DB_REAL=1` esos 10 casos se omiten explícitamente.

Resultado de implementación: 40 pruebas aprobadas, 0 omitidas con la variable
activada. La primera ejecución detectó un cast con propiedad TypeORM sin
traducir; se sustituyó por `CAST(... AS text)` y la repetición pasó completa.
