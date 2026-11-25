# ABC-468: secuencia del cálculo y la consulta del tiempo de ciclo

Diagrama de secuencia del cálculo y la consulta del KPI de **tiempo de ciclo promedio** de las órdenes finalizadas. Corresponde a la subtarea **ABC-468** de la historia **ABC-417** y se elaboró junto con **ABC-466**, que implementó el cálculo en `produccion-service`.

---

## 1. Alcance

- **Incluido:** consulta de métricas con filtro de periodo (`GET /dashboard/metricas`), cálculo del tiempo de ciclo en horas sobre órdenes `FINALIZADA` y consulta del semáforo (`GET /dashboard/kpis` para `TIEMPO_CICLO`).
- **No incluido:** la configuración de metas y umbrales (ver `meta-y-semaforo.md`, ABC-498).
- **Frontend:** el servicio `obtenerMetricasDashboard` ya existe en `frontend/src/services/dashboardService.js`; el widget específico del dashboard de Producción corresponde a **ABC-467**.

## 2. Regla del tiempo de ciclo (ABC-466)

| Dato | Definición |
| :--- | :--- |
| Universo | Órdenes en `ordenes_produccion` con `estado = 'FINALIZADA'`, `iniciada_en IS NOT NULL`, `finalizada_en IS NOT NULL` y `finalizada_en >= iniciada_en` |
| Filtro de periodo | `finalizada_en >= desde` y `finalizada_en <= hasta` cuando se envían en `FiltroDashboardDto` |
| `promedio_horas` | `AVG(EXTRACT(EPOCH FROM (finalizada_en - iniciada_en)) / 3600.0)` redondeado a 2 decimales; `null` (`"sin datos"`) si `ordenes_evaluadas = 0` |
| `unidad` | `'horas'` (alineado con `metas_kpi` para `TIEMPO_CICLO`, sentido `MENOR_ES_MEJOR`) |

---

## 3. Diagrama

![Diagrama de secuencia del tiempo de ciclo](./kpi-tiempo-ciclo.png)

```mermaid
sequenceDiagram
    autonumber
    actor S as Supervisor
    participant W as Widget del dashboard
    participant F as dashboardService.js (frontend)
    participant G as API Gateway
    participant A as auth-service
    participant C as DashboardController
    participant V as DashboardService
    participant O as ordenes_produccion (produccion_db)

    rect rgb(240, 240, 240)
    Note over S,O: A. Consultar el tiempo de ciclo promedio con filtro de periodo
    S->>W: Abre el dashboard o elige un periodo
    W->>F: obtenerMetricasDashboard({ desde, hasta })
    F->>G: GET /api/produccion/dashboard/metricas?desde&hasta
    G->>C: GET /dashboard/metricas
    C->>A: GET /me con el token Bearer
    A-->>C: Identidad y permisos
    Note over C: Exige el permiso ordenes.consultar
    alt Sin token, sesión inválida o Auth caído
        C-->>F: 401 o 503
    else Sin el permiso ordenes.consultar
        C-->>F: 403 Forbidden
    else Query inválida (campos extra)
        C-->>F: 400 por ValidationPipe
    else Permiso válido
        C->>V: obtenerMetricas(filtro)
        V->>V: parsearFechas(filtro)
        alt Fecha inválida o desde posterior a hasta
            V-->>F: 400 Bad Request
        else Rango válido
            par Consultas en paralelo (Promise.all)
                V->>V: consultarOrdenes, consultarCalidad, consultarAvances, consultarPerdidas, consultarObservaciones y consultarFpy
            and consultarTiempoCiclo(desde, hasta)
                V->>O: COUNT(*) y AVG(EXTRACT(EPOCH FROM (finalizada_en - iniciada_en)) / 3600.0) donde estado = FINALIZADA, fechas no nulas y rango finalizada_en
                O-->>V: Una fila con ordenes_evaluadas y promedio_horas
            end
            V->>V: calcularTiempoCiclo(fila)
            alt ordenes_evaluadas igual a 0
                Note over V: promedio_horas queda en null (sin datos)
            else ordenes_evaluadas mayor que 0
                Note over V: promedio_horas redondeado a 2 decimales (unidad: horas)
            end
            V-->>F: 200 con tiempo_ciclo: promedio_horas, ordenes_evaluadas y unidad
        end
    end
    F-->>W: Datos de métricas o Error con el mensaje
    W-->>S: Widget con el tiempo de ciclo (o "sin datos" / mensaje de error)
    end

    rect rgb(240, 240, 240)
    Note over S,O: B. Consultar el KPI TIEMPO_CICLO con semáforo (sin filtro de periodo)
    S->>W: Abre el dashboard
    W->>G: GET /api/produccion/dashboard/kpis
    G->>C: GET /dashboard/kpis
    C->>A: GET /me con el token Bearer
    A-->>C: Identidad y permisos
    C->>V: obtenerKpisConSemaforo()
    V->>V: listarMetas() lee metas_kpi (meta, umbrales y sentido MENOR_ES_MEJOR)
    loop Por cada KPI, aquí TIEMPO_CICLO
        V->>V: obtenerValorKpi("TIEMPO_CICLO")
        V->>O: consultarTiempoCiclo(null, null)
        O-->>V: ordenes_evaluadas y promedio_horas
        V->>V: calcularTiempoCiclo(fila).promedio_horas
        V->>V: calcularSemaforo(valor, meta, umbrales, MENOR_ES_MEJOR)
        alt promedio_horas null o sin meta
            Note over V: color null, el KPI sale sin color
        else valor y meta válidos
            Note over V: VERDE, AMARILLO o ROJO según desviación respecto a la meta
        end
    end
    V-->>F: 200 con kpis: kpi, valor, meta, unidad, sentido, desviacionPct y color
    W-->>S: Widget con el color del semáforo
    end
```
