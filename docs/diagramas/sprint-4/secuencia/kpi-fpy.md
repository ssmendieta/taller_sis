# ABC-472: secuencia del cálculo y la consulta del FPY

Diagrama de secuencia del cálculo y la consulta del FPY (First Pass Yield, porcentaje de unidades conformes a la primera, sin reprocesos). Corresponde a la subtarea **ABC-472** de la historia **ABC-418** y se elaboró junto con **ABC-470**, que implementó el cálculo en `produccion-service`.

---

## 1. Alcance

- **Incluido:** consulta de métricas con filtro de periodo (`GET /dashboard/metricas`), cálculo del FPY excluyendo reprocesos y consulta del semáforo (`GET /dashboard/kpis`).
- **No incluido:** la configuración de metas y umbrales (ver `meta-y-semaforo.md`, ABC-498).
- **Frontend:** el servicio `obtenerMetricasDashboard` ya existe. El widget del FPY en producción aún no existe en el repositorio, por lo que su participación en el diagrama es la prevista y debe revisarse cuando se implemente.

## 2. Regla del FPY (ABC-470)

| Dato | Definición |
| :--- | :--- |
| `evaluadas` | Suma de `cantidad` de `resultados_conformes` del periodo |
| `conformes_primera` | Suma de `cantidad` con `tipo = 'CONFORME'` y sin ningún registro en `reprocesos` para ese resultado |
| `recuperadas` | Suma de `cantidad_recuperada` de los `reprocesos` de esos resultados |
| `fpy` | `conformes_primera / evaluadas × 100`, 2 decimales; `null` si `evaluadas = 0` |
| `porcentaje_conformes_final` | `(conformes_primera + recuperadas) / evaluadas × 100`; `null` si `evaluadas = 0` |

Una unidad que pasó por reproceso no cuenta como conforme a la primera; las recuperadas se informan aparte.

---

## 3. Diagrama

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
    participant Q as resultados_conformes (calidad)
    participant R as reprocesos
    Note over Q,R: Ambas tablas están en produccion_db

    rect rgb(240, 240, 240)
    Note over S,R: A. Consultar el FPY con filtro de periodo
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
                V->>V: consultarOrdenes, consultarCalidad, consultarAvances, consultarPerdidas y consultarObservaciones
            and consultarFpy(desde, hasta)
                V->>Q: SUM(cantidad) de resultados del periodo (evaluadas)
                V->>Q: SUM(cantidad) donde tipo CONFORME y NOT EXISTS reproceso (conformes_primera)
                Q->>R: NOT EXISTS reprocesos con resultado_calidad_id = r.id
                R-->>Q: Existe o no reproceso
                V->>R: SUM(cantidad_recuperada) de los resultados reprocesados (recuperadas)
                Q-->>V: Una fila con evaluadas, conformes_primera y recuperadas
            end
            V->>V: calcularFpy(fila)
            alt evaluadas igual a 0
                Note over V: fpy y porcentaje_conformes_final quedan en null (sin datos)
            else evaluadas mayor que 0
                Note over V: fpy = conformes_primera / evaluadas x 100, 2 decimales
                Note over V: porcentaje_conformes_final = (conformes_primera + recuperadas) / evaluadas x 100
            end
            V-->>F: 200 con calidad: fpy, unidades_conformes_primera, unidades_recuperadas y porcentaje_conformes_final
        end
    end
    F-->>W: Datos de métricas o Error con el mensaje
    W-->>S: Widget con el FPY (o "sin datos" / mensaje de error)
    end

    rect rgb(240, 240, 240)
    Note over S,R: B. Consultar el FPY con semáforo (histórico, sin filtro)
    S->>W: Abre el dashboard
    W->>G: GET /api/produccion/dashboard/kpis
    G->>C: GET /dashboard/kpis
    C->>A: GET /me con el token Bearer
    A-->>C: Identidad y permisos
    C->>V: obtenerKpisConSemaforo()
    V->>V: listarMetas() lee metas_kpi (meta, umbrales y sentido)
    loop Por cada KPI, aquí FPY
        V->>V: obtenerValorKpi("FPY")
        V->>Q: consultarFpy(null, null), mismas consultas sin periodo
        Q->>R: NOT EXISTS reprocesos
        R-->>Q: Existe o no reproceso
        Q-->>V: evaluadas, conformes_primera y recuperadas
        V->>V: calcularFpy(fila).fpy
        V->>V: calcularSemaforo(fpy, meta, umbrales, MAYOR_ES_MEJOR)
        alt fpy null o sin meta
            Note over V: color null, el KPI sale sin color
        else fpy y meta válidos
            Note over V: VERDE, AMARILLO o ROJO según la desviación adversa (meta menos fpy)
        end
    end
    V-->>W: 200 con kpis: kpi, valor, meta, unidad, sentido, desviacionPct y color
    W-->>S: Widget con el color del semáforo
    end
```

Fuente editable: [`kpi-fpy.mmd`](kpi-fpy.mmd). Exportación: [`kpi-fpy.png`](kpi-fpy.png).

---

## 4. Trazabilidad al código

| Elemento | Archivo |
| :--- | :--- |
| Endpoints `metricas` y `kpis` | `services/produccion-service/src/dashboard/dashboard.controller.ts` |
| `consultarFpy`, `calcularFpy`, `obtenerValorKpi` y `obtenerKpisConSemaforo` | `services/produccion-service/src/dashboard/dashboard.service.ts` |
| Campos `fpy`, `unidades_conformes_primera`, `unidades_recuperadas` y `porcentaje_conformes_final` | `services/produccion-service/src/dashboard/dashboard.interface.ts` |
| Regla del semáforo | `services/produccion-service/src/dashboard/semaforo.ts` |
| Servicio del frontend | `frontend/src/services/dashboardService.js` |
| Permisos y sesión | `services/produccion-service/src/auth/permiso-produccion.guard.ts` |

## 5. Regenerar la exportación

```powershell
cd docs/diagramas/sprint-4/secuencia
npx @mermaid-js/mermaid-cli -i kpi-fpy.mmd -o kpi-fpy.png -c ../../sprint-3/mermaid-integraciones.config.json -b white -s 2
```
