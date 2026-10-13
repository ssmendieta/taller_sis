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

El contrato actual no expone un identificador de producto dentro de cada lote
ni la boleta recibe un `productoId` independiente; por eso la comparación de
producto por ítem queda pendiente de una ampliación contractual y no se acepta
automáticamente como válida.
