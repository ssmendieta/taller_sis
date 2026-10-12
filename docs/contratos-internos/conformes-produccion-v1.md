# Conformes de Producción v1

Contrato interno de lectura entre Logística y Producción para ABC-208.

## Endpoint

`GET /api/produccion/calidad/ordenes/{ordenId}/conformes`

Requiere una sesión válida con el permiso `ordenes.consultar`. Logística debe
tratar cualquier respuesta distinta de `200` como un fallo de la fuente y no
debe sustituirla por una disponibilidad estimada.

## Respuesta correcta

```json
{
  "ordenId": 15,
  "ordenCodigo": "ORD-0015",
  "producto": {
    "id": 3,
    "codigo": "PAN-001",
    "nombre": "Pan integral",
    "unidad": "unidad"
  },
  "cantidadConforme": "30.5000",
  "version": 2,
  "fecha": "2026-10-11T15:30:00.000Z",
  "permisoRequerido": "ordenes.consultar"
}
```

Las cantidades se serializan como texto decimal con cuatro posiciones para no
perder precisión. `version` es el número de avances que forman el acumulado y
`fecha` es la fecha del último avance. Una orden sin avances responde cantidad
`0.0000`, versión `0` y fecha `null`.

## Fuente y límite de esta versión

En el modelo disponible para este sprint no existe una aprobación de Calidad
separada. Por ello, v1 define `cantidadConforme` como la suma persistida de los
avances de producción de la orden. Si posteriormente se incorpora inspección o
rechazo de Calidad, deberá publicarse una nueva versión semántica del contrato
en lugar de cambiar silenciosamente este cálculo.

Producción no descuenta boletas. Logística es responsable de restar únicamente
las cantidades de sus boletas `EMITIDAS`.

## Errores

- `401`: no existe una sesión válida.
- `403`: la sesión no tiene `ordenes.consultar`.
- `404`: la orden no existe.
- `503`: no fue posible validar la sesión con Auth.
