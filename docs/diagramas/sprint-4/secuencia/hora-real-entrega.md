# ABC-456: secuencia de la hora real de entrega

Diagrama de secuencia del registro de la hora real al marcar una entrega y de su
consulta en el historial logístico. Corresponde a la subtarea **ABC-456** de la
historia **ABC-414** y se elaboró junto con **ABC-454**, que implementó el
registro en `logistica-service`. El campo `rutas_paradas.entregada_en` lo agregó
**ABC-453** (migración `1710000000016`).

Fuente: [`hora-real-entrega.mmd`](hora-real-entrega.mmd) · Exportación:
[`hora-real-entrega.png`](hora-real-entrega.png)

---

## 1. Alcance

- **Incluido:** `POST /rutas/:id/paradas/:paradaId/entrega` (`DespachoService.entregar`)
  y `GET /historial/rutas/:id` (`HistorialService.detalleRuta`).
- **No incluido:** mostrar la hora en pantalla y su diferencia con la hora
  programada (**ABC-455**) ni el motivo de retraso (CA-06).

## 2. Reglas que muestra el diagrama

| Regla | Dónde está |
| --- | --- |
| La hora es la del servidor (`new Date()`), no la del cliente | `despacho.service.ts`, `entregar` |
| Una parada ya `ENTREGADA` no se vuelve a entregar: 409 y la hora no cambia | `validarTransicionEntrega` (ABC-375) |
| Solo una parada `ENTREGADA` puede tener `entregada_en` | CHECK `ck_ruta_parada_entregada_en` (ABC-453) |
| El historial expone `entregadaEn` en ISO 8601, o `null` si la parada no está entregada | `historial.service.ts`, `detalleRuta` |

---

## 3. Diagrama

```mermaid
sequenceDiagram
    autonumber
    actor L as Encargado de Logística
    participant P as RutaDetallePage (frontend)
    participant G as API Gateway
    participant A as auth-service
    participant DC as DespachoController
    participant DS as DespachoService
    participant HC as HistorialController
    participant HS as HistorialService
    participant DB as logistica_db

    rect rgb(240, 240, 240)
    Note over L,DB: A. Registrar la entrega de una parada
    L->>P: Registrar entrega (observación opcional)
    P->>G: POST /api/logistica/rutas/:id/paradas/:paradaId/entrega
    G->>DC: POST /rutas/:id/paradas/:paradaId/entrega
    DC->>A: GET /me con el token Bearer
    A-->>DC: Identidad y permisos
    alt Sin sesión / sin logistica.rutas.gestionar / campos extra en el cuerpo
        DC-->>P: 401 / 403 / 400
    else Permiso válido
        DC->>DS: entregar(rutaId, paradaId, usuarioId, observacion)
        DS->>DB: BEGIN · ruta FOR UPDATE · paradas de la ruta FOR UPDATE
        alt Ruta o parada inexistente / parada de otra ruta
            DS-->>P: 404 / 409
        else Parada ya ENTREGADA o ruta no DESPACHADA
            Note over DS: validarTransicionEntrega rechaza: la hora real ya guardada no cambia
            DS->>DB: ROLLBACK
            DS-->>P: 409
        else Parada PENDIENTE de ruta DESPACHADA
            DS->>DB: boletas de la parada FOR UPDATE OF boleta
            alt Sin boletas o alguna no EMITIDA
                DS->>DB: ROLLBACK
                DS-->>P: 409
            else Boletas válidas
                DS->>DS: ahora = new Date() (hora del servidor)
                DS->>DB: UPDATE rutas_paradas SET estado ENTREGADA, entregada_en = ahora, autor y observación
                opt Todas las entregas válidas quedan ENTREGADAS
                    DS->>DB: UPDATE rutas SET estado COMPLETADA, completada_en = ahora
                end
                DS->>DB: COMMIT
                DS-->>P: 201 ruta con paradas (entregadaEn incluida)
            end
        end
    end
    end

    rect rgb(240, 240, 240)
    Note over L,DB: B. Consultar la hora real en el historial
    P->>G: GET /api/logistica/historial/rutas/:id
    G->>HC: GET /historial/rutas/:id
    HC->>A: GET /me con el token Bearer
    A-->>HC: Identidad y permisos
    alt Sin logistica.rutas.consultar
        HC-->>P: 401 / 403
    else Permiso válido
        HC->>HS: detalleRuta(id)
        HS->>DB: BEGIN REPEATABLE READ
        HS->>DB: SELECT ... entregada_en FROM rutas_paradas WHERE ruta_id = $1
        DB-->>HS: Paradas con su hora real (NULL si no están entregadas)
        HS->>DB: COMMIT
        HS-->>P: 200 paradas[].entregadaEn (ISO 8601 o null)
        Note over P: Mostrar la hora y la diferencia con la programada es ABC-455
    end
    end
```

## 4. Exportación

Desde `docs/diagramas/sprint-4/secuencia`, con `mermaid-cli` (mismo procedimiento
que `docs/diagramas/sprint-3/README.md`):

```powershell
npx @mermaid-js/mermaid-cli -i hora-real-entrega.mmd -o hora-real-entrega.png -b white -s 2
```
