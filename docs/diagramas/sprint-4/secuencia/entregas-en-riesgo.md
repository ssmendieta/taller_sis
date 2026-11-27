# ABC-460: secuencia de las entregas en riesgo y el acceso a reprogramar

Diagrama de secuencia de la consulta de las paradas en riesgo de llegar tarde y
del acceso a reprogramar su ruta. Corresponde a la subtarea **ABC-460** de la
historia **ABC-415** y se elaboró junto con **ABC-458** (endpoint en
`logistica-service`) y **ABC-459** (vista en el frontend). Lo entregado se
distingue con la hora real de entrega de **ABC-414** (`rutas_paradas.entregada_en`).

Fuente: [`entregas-en-riesgo.mmd`](entregas-en-riesgo.mmd) · Exportación:
[`entregas-en-riesgo.png`](entregas-en-riesgo.png)

---

## 1. Alcance

- **Incluido:** `GET /rutas/paradas-en-riesgo` (`RutasService.findParadasEnRiesgo`),
  la vista `EntregasEnRiesgo` en `LogisticaPage` y el acceso a reprogramar, que
  reutiliza `POST /rutas/:id/incidencias` con `nuevaFecha` (`IncidenciasService.registrar`).
- **No incluido:** el detalle interno de la validación de recursos al reprogramar
  (solapes y capacidad, ABC-371), que ya está documentado con las rutas.

## 2. Reglas que muestra el diagrama

| Regla | Dónde está |
| --- | --- |
| La hora programada es el fin del día programado en Bolivia (UTC-4) | `limiteEntrega` en `despacho/retraso-entrega.ts` (ABC-524) |
| En riesgo = parada `PENDIENTE` de ruta `PLANIFICADA` o `DESPACHADA` cuyo límite ya pasó (`VENCIDA`) o llega dentro del margen (`POR_VENCER`) | `evaluarRiesgo` en `rutas/riesgo-entrega.ts` |
| El margen se configura con `ENTREGA_MARGEN_RIESGO_HORAS` (0 a 720; 24 h por defecto) | `margenRiesgoHoras` en `rutas/riesgo-entrega.ts` |
| Las paradas `ENTREGADA` (con `entregada_en`) o `ANULADA` no aparecen | SQL de `findParadasEnRiesgo` y `evaluarRiesgo` |
| Consultar exige `logistica.rutas.consultar`; `desde`/`hasta` deben ser fechas `YYYY-MM-DD` válidas | `RutasController` y `validarFiltroParadasRiesgo` |
| Reprogramar exige `logistica.rutas.gestionar`, una ruta activa y una fecha futura distinta | `IncidenciasService.registrar` |
| Sin `logistica.rutas.gestionar` el acceso de la fila es "Ver ruta" | `EntregasEnRiesgo.jsx` |

---

## 3. Diagrama

```mermaid
sequenceDiagram
    autonumber
    actor L as Encargado de Logística
    participant V as EntregasEnRiesgo (LogisticaPage)
    participant D as RutaDetallePage (FormularioIncidencia)
    participant G as API Gateway
    participant A as auth-service
    participant RC as RutasController
    participant RS as RutasService
    participant IC as IncidenciasController
    participant IS as IncidenciasService
    participant E as ERP / Producción
    participant DB as logistica_db

    rect rgb(240, 240, 240)
    Note over L,DB: A. Consultar las entregas en riesgo (ABC-458 y ABC-459)
    L->>V: Abrir /logistica/inicio (o Actualizar)
    V->>G: GET /api/logistica/rutas/paradas-en-riesgo?desde&hasta
    G->>RC: GET /rutas/paradas-en-riesgo
    RC->>A: GET /me con el token Bearer
    A-->>RC: Identidad y permisos
    alt Sin sesión / sin logistica.rutas.consultar / fecha inválida o desde > hasta
        RC-->>V: 401 / 403 / 400
        V-->>L: Mensaje de error y botón Reintentar
    else Permiso y filtro válidos
        RC->>RS: findParadasEnRiesgo({ desde, hasta })
        RS->>RS: margen = ENTREGA_MARGEN_RIESGO_HORAS (24 h por defecto)
        RS->>RS: fechaMaxima = fechaMaximaEnRiesgo(ahora, margen)
        RS->>DB: SELECT paradas JOIN rutas WHERE estado_entrega = PENDIENTE AND entregada_en IS NULL AND ruta PLANIFICADA o DESPACHADA AND fecha_programada <= fechaMaxima [y desde/hasta]
        DB-->>RS: Paradas pendientes ordenadas por fecha, ruta y secuencia
        loop Cada parada
            RS->>RS: evaluarRiesgo: límite = fin del día programado en Bolivia
            alt límite <= ahora
                Note over RS: motivo VENCIDA
            else límite <= ahora + margen
                Note over RS: motivo POR_VENCER
            else Fuera del margen o ya ENTREGADA / ANULADA
                Note over RS: Se descarta
            end
        end
        RS-->>V: 200 { margenHoras, total, paradas[ruta, parada, fechaProgramada, motivo, motivoDetalle] }
        alt Sin paradas en riesgo
            V-->>L: "No hay entregas en riesgo de llegar tarde."
        else Hay paradas
            V-->>L: Tabla: ruta, parada, fecha programada, motivo y botón Reprogramar
        end
    end
    end

    rect rgb(240, 240, 240)
    Note over L,DB: B. Reprogramar la ruta (acción existente de incidencias)
    L->>V: Reprogramar (o Ver ruta, sin logistica.rutas.gestionar)
    V->>D: Navegar a /logistica/rutas/:rutaId
    L->>D: Incidencia con "Reprogramar la entrega a otra fecha" y nueva fecha
    D->>G: POST /api/logistica/rutas/:id/incidencias { tipo, paradaId, motivo, nuevaFecha }
    G->>IC: POST /rutas/:id/incidencias
    IC->>A: GET /me con el token Bearer
    A-->>IC: Identidad y permisos
    alt Sin logistica.rutas.gestionar / cuerpo inválido
        IC-->>D: 401 / 403 / 400
    else Permiso válido
        IC->>IS: registrar(id, dto, autor, authorization)
        IS->>DB: Ruta con paradas pendientes y sus boletas
        IS->>E: Recursos del nuevo día y unidades de carga (fuera de la transacción)
        E-->>IS: Vehículo, chofer y unidades
        IS->>DB: BEGIN READ COMMITTED · ruta FOR UPDATE
        alt Ruta no PLANIFICADA ni DESPACHADA / parada ya resuelta / fecha no futura / la ruta cambió
            IS->>DB: ROLLBACK
            IS-->>D: 404 / 409 con el motivo
        else Fecha y recursos válidos
            IS->>DB: Bloquear vehículo y chofer · validar solapes y capacidad
            IS->>DB: INSERT incidencias_transporte · INSERT rutas_reprogramaciones
            IS->>DB: UPDATE rutas SET fecha_programada = nuevaFecha
            IS->>DB: COMMIT
            IS-->>D: 201 historial de incidencias y reprogramaciones
            Note over V,RS: Al volver a consultar, la parada sale de la lista hasta que la nueva fecha entre en el margen
        end
    end
    end
```

## 4. Exportación

Desde `docs/diagramas/sprint-4/secuencia`, con `mermaid-cli` (mismo procedimiento
que `docs/diagramas/sprint-3/README.md`):

```powershell
npx @mermaid-js/mermaid-cli -i entregas-en-riesgo.mmd -o entregas-en-riesgo.png -b white -s 2
```
