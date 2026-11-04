# Consumos de material — ABC-71

El catálogo y las migraciones actuales de Auth no incluyen un permiso para
registrar consumo. Sergio debe agregar `materiales.registrar_consumo` y
asignarlo al rol que registre consumos. El POST exige ese permiso y responde
403 mientras el usuario no lo tenga; no acepta permisos de avance o solicitud.
Las consultas requieren `ordenes.consultar`.

Rutas del servicio (el gateway agrega `/api/produccion`):

- `POST /consumos-material`
- `GET /consumos-material/orden/:ordenId`
- `GET /consumos-material/orden/:ordenId/totales`

Ambos GET aceptan `?materialId=1`. Devuelven una lista vacía si la orden y el
material existen pero no tienen consumos para ese filtro.

Ejemplo de POST:

```json
{
  "ordenId": 1,
  "materialId": 1,
  "cantidad": 10,
  "unidad": "kg"
}
```

El material debe pertenecer a la receta de la orden y su unidad debe coincidir.
Usuario y fecha los establece el servidor. El body rechaza campos adicionales.
Cada POST crea un registro independiente, sin descontar inventario.
Los totales se agrupan por orden, material y unidad; las cantidades se devuelven
como texto decimal para conservar precisión. Dos consumos de 10 y 13 dan
`"cantidadTotal": "23.0000"`.

Desde `services/produccion-service`, las pruebas PostgreSQL se habilitan con
`$env:CONSUMOS_DB_REAL='1'; npm test -- --runInBand consumos-material`.
Usan un esquema temporal dentro de una transacción que se revierte al terminar.
