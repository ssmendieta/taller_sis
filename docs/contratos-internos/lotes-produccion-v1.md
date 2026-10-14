# Consulta de lotes de Producción v1 (ABC-296)

## Endpoint

`GET {PRODUCCION_SERVICE_URL}/lotes/orden/:ordenCodigo`

Requiere `Authorization: Bearer <token>` y el permiso existente
`ordenes.consultar` en Producción. El código se recorta antes de consultar y se
codifica como segmento de URL.

## Respuesta 200

Devuelve un arreglo, posiblemente vacío:

```json
[
  {
    "id": "4",
    "codigo": "L-1",
    "ordenId": "8",
    "ordenCodigo": "ORD-7",
    "productoId": "3",
    "cantidad": "10.0000",
    "fechaHora": "2026-10-13T00:00:00.000Z"
  }
]
```

Los identificadores y cantidades se serializan como texto para conservar la
precisión de `BIGINT` y `NUMERIC`. La consulta lee `lotes` y
`ordenes_produccion`; no crea relaciones entre las bases de Producción y
Logística. Logística consume este contrato mediante `LotesProduccionClient`.

## Validación de ABC-214

Antes de crear una boleta, Logística consulta también
`GET {PRODUCCION_SERVICE_URL}/ordenes/:id`, usando el mismo Bearer. Comprueba
que la solicitud local apunta a esa orden, que la respuesta contiene un
`producto_id` válido y un producto, y después exige que cada referencia de la
boleta sea un código de lote devuelto para esa orden. Una respuesta incompleta,
un timeout o un error de Producción aborta la creación.

El `productoId` se deriva de la relación real lote → orden → producto. La
solicitud y la boleta actuales todavía no tienen un `productoId` por ítem; por
eso se comprueba que la referencia pertenezca a la solicitud y que el lote
pertenezca a la orden y al producto de la orden. La comparación de producto
específico por ítem requiere ampliar ese modelo y queda pendiente.
