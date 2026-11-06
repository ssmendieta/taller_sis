# Observaciones e incidencias de una orden (ABC-100)

Registro de lo ocurrido durante una orden. No registra mermas (ABC-74) ni
resultados de calidad.

| Método | Ruta (vía gateway `/api/produccion`) | Permiso |
| --- | --- | --- |
| `POST` | `/observaciones` | `ordenes.registrar_avance` |
| `GET` | `/observaciones/orden/:ordenId` | `ordenes.consultar` |

Cuerpo de `POST`: `{ "ordenId": 2, "tipo": "OBSERVACION" | "INCIDENCIA", "descripcion": "..." }`.

- El autor (`autorUsuarioId`, `autorNombre`) se toma de la sesión y la fecha del
  servidor; enviarlos en el cuerpo devuelve 400.
- Descripción vacía o con solo espacios → 400; orden inexistente → 404.
- El listado devuelve solo la orden pedida, de la más reciente a la más antigua.
