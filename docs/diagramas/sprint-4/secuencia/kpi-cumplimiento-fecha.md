# Diagrama de secuencia — KPI Cumplimiento de Fecha Requerida (ABC-464 / ABC-416)

Flujo de consulta del KPI **Cumplimiento de Fecha** (`CUMPLIMIENTO_FECHA`) desde el tablero de Producción hasta la base de datos PostgreSQL, verificando permisos (`ordenes.consultar`), filtrando órdenes `FINALIZADA` por rango de fechas y devolviendo `null` (*"Sin datos"*) cuando no existen órdenes finalizadas en el período.

![Diagrama de secuencia KPI Cumplimiento de Fecha](./kpi-cumplimiento-fecha.png)

```mermaid
sequenceDiagram
    autonumber
    actor Supervisor
    participant FE as Frontend (Tablero Producción)
    participant GW as API Gateway
    participant DC as DashboardController
    participant Guard as PermisoProduccionGuard
    participant DS as DashboardService
    participant DB as PostgreSQL (ordenes_produccion)

    Supervisor->>FE: Abre Dashboard / Filtra periodo (desde, hasta)
    FE->>GW: GET /api/produccion/dashboard/metricas?desde=...&hasta=...
    GW->>DC: GET /dashboard/metricas?desde=...&hasta=...

    DC->>Guard: Validar JWT y permiso ordenes.consultar
    alt Sin permiso o sesión inválida
        Guard-->>FE: 401 / 403 Forbidden
    else Autorizado
        Guard-->>DC: Acceso permitido
        DC->>DS: obtenerMetricas(filtro)
        DS->>DS: parsearFechas(filtro)
        DS->>DB: SELECT COUNT(*) AS total_finalizadas, COUNT(*) FILTER (WHERE finalizada_en::date <= fecha_programada) AS a_tiempo FROM ordenes_produccion WHERE estado='FINALIZADA' ...
        DB-->>DS: { total_finalizadas, a_tiempo }
        DS->>DS: calcularCumplimientoFecha(fila)
        alt total_finalizadas == 0
            DS-->>DC: cumplimiento_fecha: { porcentaje: null, a_tiempo: 0, total_finalizadas: 0, unidad: "%" }
        else total_finalizadas > 0
            DS-->>DC: cumplimiento_fecha: { porcentaje: (a_tiempo / total_finalizadas) * 100, ... }
        end
        DC-->>GW: 200 OK (MetricasDashboardResponse)
        GW-->>FE: JSON con cumplimiento_fecha
        FE-->>Supervisor: Muestra % de cumplimiento o "Sin datos"
    end
```
