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
