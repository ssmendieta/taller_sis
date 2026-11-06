# Rutas de transporte (ABC-368)

## Modelo (ABC-369)

| Tabla | Contenido |
| --- | --- |
| `rutas` | grupo, fecha programada, vehículo y chofer (ids externos del ERP), estado, responsable |
| `rutas_paradas` | parada numerada (`secuencia`) con su destino |
| `rutas_paradas_boletas` | boletas que se entregan en cada parada (FK a `boletas_envio`) |

Vehículo, chofer y grupo se guardan como identificadores sin clave foránea:
el ERP es otra base y la tabla de grupos (ABC-362) todavía no existe.

## API (ABC-370)

Vía gateway: `/api/logistica/rutas`.

| Método | Ruta | Permiso |
| --- | --- | --- |
| `POST` | `/rutas` | `logistica.rutas.gestionar` |
| `PUT` | `/rutas/:id` | `logistica.rutas.gestionar` |
| `GET` | `/rutas` | `logistica.rutas.consultar` |
| `GET` | `/rutas/:id` | `logistica.rutas.consultar` |

Cuerpo de `POST` y `PUT`:

```json
{
  "grupoId": "4",
  "fechaProgramada": "2026-11-10",
  "vehiculoExternoId": "VEH-01",
  "choferExternoId": "CHO-07",
  "paradas": [
    { "destino": "Tienda Central", "boletaIds": ["1", "2"] },
    { "destino": "Sucursal Norte", "boletaIds": ["3"] }
  ]
}
```

Reglas aplicadas:

- Solo boletas `EMITIDA`; una anulada o en borrador devuelve 409.
- Una boleta no puede estar en dos rutas `PLANIFICADA`/`DESPACHADA`. Las boletas
  se bloquean con `FOR UPDATE` para que dos guardados simultáneos no la compartan.
- Solo se edita una ruta `PLANIFICADA`; despachada, completada o cancelada devuelve 409.
- `PUT` reemplaza las paradas completas, dentro de la misma transacción.

Pendiente en otras subtareas: solapamiento de vehículo/chofer y capacidad de
carga (ABC-371), verificación del grupo (ABC-362) y validación contra el
catálogo del ERP (ABC-115).

## Despacho y entrega (ABC-376)

Permiso `logistica.rutas.gestionar`. Cuerpo opcional `{ "observacion": "..." }`
(hasta 500 caracteres); fecha, autor y estado los fija el servidor, y cualquier
otro campo devuelve 400.

| Método | Ruta | Efecto |
| --- | --- | --- |
| `POST` | `/rutas/:id/despacho` | `PLANIFICADA` → `DESPACHADA` con `despachada_en`, autor y observación |
| `POST` | `/rutas/:id/paradas/:paradaId/entrega` | parada `PENDIENTE` → `ENTREGADA`; la ruta pasa a `COMPLETADA` al entregar la última parada válida |

Reglas (máquina de estados de ABC-375):

- Despacho: ruta `PLANIFICADA` con vehículo, chofer y al menos una entrega
  pendiente; todas sus boletas deben seguir `EMITIDA` (una anulada después de
  planificar devuelve 409).
- Entrega: solo en ruta `DESPACHADA`; una parada de otra ruta devuelve 409 y una
  inexistente 404; una boleta anulada en la parada devuelve 409. Las entregas
  parciales dejan la ruta `DESPACHADA`; las paradas `ANULADA` no cuentan para el cierre.
- Repetir un despacho o una entrega, o retroceder un estado, devuelve 409 y
  conserva la fecha y el autor originales. Ruta, paradas y boletas se bloquean
  con `FOR UPDATE` para que dos envíos simultáneos no se registren dos veces.
- El despacho llama a `EventosDespacho.registrarDespacho` dentro de su
  transacción (`despacho/eventos-despacho.ts`). ABC-386 debe implementarlo
  guardando el evento en el outbox, sin publicar antes del commit; hasta
  entonces no se genera evento.

## Historial de rutas (ABC-391)

`GET /historial/rutas` (permiso `logistica.rutas.consultar`), solo lectura.

| Parámetro | Uso |
| --- | --- |
| `fechaDesde`, `fechaHasta` | días `YYYY-MM-DD` sobre la fecha programada (inclusive) |
| `estado` | `PLANIFICADA`, `DESPACHADA`, `COMPLETADA` o `CANCELADA` |
| `chofer` | coincidencia parcial del id externo, sin distinguir mayúsculas |
| `page`, `limit` | página desde 1; 1 a 100 registros (10 por defecto) |

Los filtros se combinan con AND. Orden estable: fecha programada descendente y
luego id descendente. Respuesta `{ items, total, page, limit, totalPages }` con
`totalParadas` y `totalBoletas` por ruta, calculados sin duplicar filas.
