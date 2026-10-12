# ABC-72: requerido frente a consumo real y API protegida

ABC-71 ya ofrece `GET /consumos-material/orden/:ordenId` y
`GET /consumos-material/orden/:ordenId/totales`, con permiso `ordenes.consultar`.
Su persistencia es `consumos_material`, migracion `ConsumosMaterial1710000000013`.
La carpeta real es `consumos-material/`, en lugar de `consumos/` del plan.

`MaterialCalculationService.compararConsumoPorOrden(ordenId)` calcula:

- Requerido: cantidad por material de la receta asociada a la orden multiplicada
  por la cantidad solicitada de la orden (mismo criterio que el calculo existente).
- Consumido: totales de ABC-71, obtenidos de los registros persistidos y agrupados
  por material y unidad. Se reutiliza `ConsumosMaterialService.totales`.
- Diferencia: consumido menos requerido, con la unidad del material.

Sin consumos devuelve cero consumido y una diferencia negativa. Dos registros
de 10 kg y 13 kg dan `cantidadConsumida: "23.0000"`; si se requerian 20 kg,
`diferencia: "3.0000"`. Las cantidades son texto decimal para conservar precision.
El calculo conserva hasta ocho decimales del producto de los valores de receta.

Unidades que no coincidan provocan 409, sin sumarlas ni convertirlas. No se ocultan
consumos historicos fuera de la receta actual: se incluyen con requerido cero.
Orden inexistente da 404; identificador invalido da 400.

La subtarea 2 expone `GET /ordenes/:id/comparacion-materiales` (a traves del gateway:
`GET /api/produccion/ordenes/:id/comparacion-materiales`). Requiere Bearer y el
permiso existente `ordenes.consultar`, comprobado por `PermisoProduccionGuard`.
Devuelve 403 si el usuario autenticado no tiene permiso, 401 sin sesion y 404 si
la orden no existe. El controlador solo delega a `compararConsumoPorOrden`.

Ejemplo para una orden que requiere 20 kg y tiene consumos de 10 kg y 13 kg:

```json
{
  "ordenId": "2",
  "materiales": [
    {
      "materialId": "1",
      "materialCodigo": "M1",
      "materialNombre": "Harina",
      "unidad": "kg",
      "cantidadRequerida": "20.0000",
      "cantidadConsumida": "23.0000",
      "diferencia": "3.0000"
    }
  ]
}
```

`cantidadConsumida` es el material utilizado. Se conserva el formato decimal de
la subtarea 1 y de las consultas de ABC-71.

`MaterialCalculationModule` importa `ConsumosMaterialModule` y exporta el
servicio de calculo para `OrdenesModule`. `AppModule` importa ese modulo en lugar
de registrar por separado el controlador y servicio de calculo. El POST anterior
de calculo mantiene su comportamiento. No agrega permisos, tablas ni migraciones
ni modifica consumos o existencias. No incluye pantalla.

Desde `services/produccion-service`, PowerShell:

```powershell
$env:DB_DATABASE = 'produccion_db'
$env:MATERIALES_DB_REAL = '1'
npm test -- --runInBand material-calculation ordenes
npm run build
```

Las pruebas reales usan un esquema aislado de PostgreSQL y consultan la ruta HTTP
con el guard real (solo se simula la respuesta de Auth). Verifican una orden sin
consumos, dos registros persistidos de 10 y 13 kg, 404, 403, unidades incompatibles
y que inventario y consumos quedan intactos. El esquema se elimina al terminar.
