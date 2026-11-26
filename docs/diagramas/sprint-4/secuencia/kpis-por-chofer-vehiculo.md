# ABC-522: secuencia de los KPIs de Logística por chofer y vehículo

Consulta del ranking que compara choferes y vehículos en puntualidad, incidencias y uso de capacidad. Subtarea **ABC-522** de la historia **ABC-430**, elaborada junto con **ABC-520** (agregación) y **ABC-531** (enlace al detalle).

## Reglas

| KPI | Fórmula | Periodo |
| :--- | :--- | :--- |
| Entregas a tiempo | Entregas hechas el día programado de la ruta o antes (hora de Bolivia) / entregas realizadas × 100 | Hora real de entrega |
| Incidencias por 100 entregas | Incidencias registradas en rutas que salieron / paradas no anuladas de esas rutas × 100 | Fecha programada de la ruta |
| Uso de capacidad | Media de las rutas calculables (ver `kpi-uso-capacidad.md`) | Fecha programada de la ruta |

- No existe una hora programada por parada; la puntualidad se mide por el día programado de la ruta (decisión de la Product Owner).
- Cada grupo usa las mismas funciones que el KPI general. Los conteos de los grupos suman los del total, y la fila Total es exactamente el KPI general del periodo.
- Un chofer o vehículo de la copia del ERP sin entregas ni rutas calculables en el periodo aparece como "Sin datos".
- Mejor y peor se marcan con texto en cada columna: más es mejor en puntualidad y uso; menos es mejor en incidencias.

## Diagrama

```mermaid
sequenceDiagram
    autonumber
    actor E as Encargado de Logística
    participant T as RankingRecursos (tabla)
    participant F as dashboardLogisticaService.js
    participant G as API Gateway
    participant C as DashboardController
    participant A as auth-service
    participant V as DashboardService
    participant K as agruparPorRecurso
    participant R as Rutas, entregas e incidencias
    participant X as Recursos logísticos (copia del ERP)
    Note over R,X: Ambos están en logistica_db

    E->>T: Abre el tablero, elige periodo y Por chofer o Por vehículo
    T->>F: obtenerRankingLogistica({ dimension, desde, hasta })
    F->>G: GET /api/logistica/dashboard/kpis/ranking?dimension&desde&hasta
    G->>C: GET /dashboard/kpis/ranking
    C->>A: GET /me con el token Bearer
    A-->>C: Identidad y permisos
    alt Sin sesión, sin logistica.rutas.consultar o Auth caído
        C-->>F: 401, 403 o 503
    else Dimensión distinta de CHOFER o VEHICULO, o fechas inválidas
        C-->>F: 400 Bad Request
    else Solicitud válida
        C->>V: obtenerRanking(filtro)
        par Mismas consultas que los KPIs generales
            V->>R: Entregas realizadas en el periodo (hora real) y si fueron el día programado
        and
            V->>R: Rutas que salieron en el periodo con entregas e incidencias
        and
            V->>R: Carga de cada ruta y capacidad del vehículo esa fecha
            R->>X: LEFT JOIN por vehículo y fecha
        and
            V->>X: Choferes o vehículos conocidos con su nombre o placa
        end
        V->>K: agruparPorRecurso(dimension, datos)
        loop Por cada chofer o vehículo
            K->>K: Entregas a tiempo, incidencias por 100 y uso de capacidad con las mismas fórmulas
            alt Sin entregas ni rutas calculables
                Note over K: sin_datos = true
            end
        end
        K->>K: Totales con todas las filas, iguales a los KPIs generales
        K-->>V: filas y totales
        V-->>F: 200 con dimension, periodo, filas y totales
    end
    F-->>T: Ranking o Error con el mensaje
    T->>T: Ordena por la columna elegida y marca Mejor y Peor según el sentido de cada KPI
    T-->>E: Tabla con fila Total, "Sin datos" o error con Reintentar
    opt Ver entregas de una fila
        E->>T: Pulsa Ver entregas
        T->>G: Abre /logistica/kpis/ENTREGAS_A_TIEMPO?chofer o vehiculo, con el mismo periodo
        Note over T,G: Detalle de KPI (ABC-428) filtrado por el chofer o vehículo
    end
```

Fuente editable: [`kpis-por-chofer-vehiculo.mmd`](kpis-por-chofer-vehiculo.mmd). Exportación: [`kpis-por-chofer-vehiculo.png`](kpis-por-chofer-vehiculo.png).

## Trazabilidad al código

| Elemento | Archivo |
| :--- | :--- |
| Endpoint `GET /dashboard/kpis/ranking` | `services/logistica-service/src/dashboard/dashboard.controller.ts` |
| `obtenerRanking`, `consultarEntregasRealizadas`, `consultarIncidenciasPorRuta` | `services/logistica-service/src/dashboard/dashboard.service.ts` |
| `agruparPorRecurso` y fórmulas | `services/logistica-service/src/dashboard/kpis-recurso.ts` |
| Tabla ordenable | `frontend/src/components/logistica/dashboard/RankingRecursos.jsx` |
| Pruebas | `dashboard.ranking.integracion.spec.ts`, `frontend/scripts/dashboard-logistica.test.mjs` |
