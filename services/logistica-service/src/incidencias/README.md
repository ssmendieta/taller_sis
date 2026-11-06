# Incidencias y reprogramaciones de rutas (ABC-379)

## Modelo (ABC-380)

| Tabla | Contenido |
| --- | --- |
| `incidencias_transporte` | ruta, parada opcional (de la misma ruta), tipo, motivo, autor y fecha |
| `rutas_reprogramaciones` | cada cambio de `rutas.fecha_programada`: fecha anterior y nueva, motivo, autor, fecha e incidencia opcional |

La fecha original de una ruta es la `fecha_anterior` de su primera reprogramación;
sin reprogramaciones, es su `fecha_programada`. Las filas no se modifican ni se borran.

Tipos: `RETRASO`, `AVERIA_VEHICULO`, `CLIENTE_AUSENTE`, `DIRECCION_INCORRECTA`,
`CARGA_DANADA`, `OTRO`.

## API propuesta para ABC-381

La pantalla de ABC-382 (`frontend/src/pages/RutaDetallePage.jsx`) usa este
contrato. Está **pendiente de confirmar** por quien implemente ABC-381. Vía gateway:
`/api/logistica`.

### `GET /rutas/:id/incidencias` — permiso `logistica.rutas.consultar`

```json
{
  "rutaId": "9",
  "fechaOriginal": "2026-11-10",
  "fechaProgramada": "2026-11-12",
  "incidencias": [
    {
      "id": "3", "rutaId": "9", "paradaId": "11", "tipo": "CLIENTE_AUSENTE",
      "motivo": "Local cerrado", "registradaPorUsuarioId": "42",
      "registradaEn": "2026-11-10T15:20:00.000Z"
    }
  ],
  "reprogramaciones": [
    {
      "id": "1", "rutaId": "9", "incidenciaId": "3", "fechaAnterior": "2026-11-10",
      "fechaNueva": "2026-11-12", "motivo": "Local cerrado",
      "registradaPorUsuarioId": "42", "registradaEn": "2026-11-10T15:20:00.000Z"
    }
  ]
}
```

Ambas listas van de la más antigua a la más reciente.

### `POST /rutas/:id/incidencias` — permiso `logistica.rutas.gestionar`

```json
{ "tipo": "CLIENTE_AUSENTE", "motivo": "Local cerrado", "paradaId": "11", "nuevaFecha": "2026-11-12" }
```

- `tipo` y `motivo` (1 a 500 caracteres) son obligatorios; `paradaId` es opcional
  (`null` = toda la ruta) y debe ser de la ruta.
- `nuevaFecha` es opcional. Si se envía, en la misma transacción se registra la
  incidencia, una fila en `rutas_reprogramaciones` con `incidencia_id` y el nuevo
  `fecha_programada`.
- Fecha y autor los fija el servidor; otros campos devuelven 400.
- Respuesta `201`: el mismo cuerpo de `GET /rutas/:id/incidencias`, ya actualizado.

### Errores que muestra la pantalla

| HTTP | Caso | Cuerpo |
| --- | --- | --- |
| 400 | tipo, motivo o fecha inválidos | `{ "message": "..." }` |
| 404 | ruta o parada inexistente | `{ "message": "..." }` |
| 409 | nueva fecha no futura o igual a la actual; ruta `COMPLETADA` o `CANCELADA` (CA-03) | `{ "message": "..." }` |
| 409 | vehículo o chofer no disponibles o con otra ruta ese día (CA-04) | ver abajo |

```json
{
  "statusCode": 409,
  "codigo": "CONFLICTO_RECURSOS",
  "message": "El vehículo o el chofer no están disponibles el 2026-11-12",
  "conflictos": [
    { "recurso": "VEHICULO", "idExterno": "VEH-01", "motivo": "Asignado a la ruta 12" },
    { "recurso": "CHOFER", "idExterno": "CHO-12", "motivo": "No disponible en el ERP" }
  ]
}
```

Ante cualquier error la pantalla conserva lo escrito en el formulario.
