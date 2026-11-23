# ABC-492: secuencia del cálculo y la consulta del uso de capacidad

Diagrama de secuencia del uso de capacidad del vehículo por ruta, incluida la regla de unidades compatibles. Corresponde a la subtarea **ABC-492** de la historia **ABC-423** y se elaboró junto con **ABC-490**, que implementó el cálculo en `logistica-service`.

## 1. Alcance

- **Incluido:** `GET /dashboard/metricas` con filtro de periodo (`uso_capacidad`) y el valor de `USO_CAPACIDAD` en `GET /dashboard/kpis`.
- **No incluido:** configuración de metas y umbrales (ver `meta-y-semaforo.md`, ABC-498).
- **Frontend:** el servicio `obtenerMetricasDashboardLogistica` ya existe. El widget aún no muestra este KPI; su participación en el diagrama es la prevista y debe revisarse cuando se implemente.

## 2. Regla del cálculo (ABC-490)

| Aspecto | Regla |
| :--- | :--- |
| Rutas incluidas | `DESPACHADA` y `COMPLETADA`, por fecha programada dentro del periodo |
| Carga | Suma de los ítems de sus boletas; una boleta repetida en la ruta cuenta una vez |
| Paradas anuladas | Antes del despacho no se cargaron y no suman; después del despacho sí viajaron |
| Capacidad | La del vehículo en la copia local del ERP de la misma fecha; no se usa la de otra fecha |
| Porcentaje de la ruta | `carga / capacidad × 100`, 2 decimales, solo con la misma unidad |
| Porcentaje por vehículo y general | Media simple de los porcentajes de sus rutas calculables; `null` = sin datos |
| No calculable | `CARGA_NO_CALCULABLE`, `CAPACIDAD_FALTANTE` o `UNIDAD_INCOMPATIBLE`, con su detalle |

Se usa la media de porcentajes porque las capacidades pueden estar en unidades distintas (kg, caja) y no se pueden sumar.

## 3. Diagrama

```mermaid
sequenceDiagram
    autonumber
    actor E as Encargado de Logística
    participant W as Widget del dashboard
    participant F as dashboardLogisticaService.js
    participant G as API Gateway
    participant A as auth-service
    participant C as DashboardController
    participant V as DashboardService
    participant U as calcularUsoCapacidad
    participant R as Rutas y boletas
    participant X as Recursos logísticos (copia del ERP)
    Note over R,X: Ambos están en logistica_db

    rect rgb(240, 240, 240)
    Note over E,X: A. Consultar el uso de capacidad con filtro de periodo
    E->>W: Abre el dashboard o elige un periodo
    W->>F: obtenerMetricasDashboardLogistica({ desde, hasta })
    F->>G: GET /api/logistica/dashboard/metricas?desde&hasta
    G->>C: GET /dashboard/metricas
    C->>A: GET /me con el token Bearer
    A-->>C: Identidad y permisos
    alt Sin token, sesión inválida o Auth caído
        C-->>F: 401 o 503
    else Sin el permiso logistica.rutas.consultar
        C-->>F: 403 Forbidden
    else Fecha inválida o desde posterior a hasta
        C-->>F: 400 Bad Request
    else Solicitud válida
        C->>V: obtenerMetricas(filtro)
        V->>R: consultarUsoCapacidad: rutas DESPACHADA o COMPLETADA del periodo con sus boletas, unidad y cantidades
        R->>X: LEFT JOIN por vehículo y fecha programada
        X-->>R: Placa, capacidad y unidad, o nulos
        R-->>V: Una fila por ítem de carga
        V->>U: calcularUsoCapacidad(filas)
        loop Por cada ruta
            U->>U: calcularCarga(boletas, ítems) sin convertir unidades
            alt Sin carga, unidad desconocida o unidades mezcladas
                Note over U: No calculable: CARGA_NO_CALCULABLE
            else Sin capacidad para el vehículo en esa fecha
                Note over U: No calculable: CAPACIDAD_FALTANTE
            else Carga y capacidad en unidades distintas
                Note over U: No calculable: UNIDAD_INCOMPATIBLE, sin convertir ni estimar
            else Unidades compatibles
                Note over U: porcentaje = carga / capacidad x 100
            end
        end
        U->>U: Media de las rutas calculables, por vehículo y general
        alt Ninguna ruta calculable
            Note over U: porcentaje = null (sin datos)
        end
        U-->>V: porcentaje, conteos, por_vehiculo y por_ruta
        V-->>F: 200 con uso_capacidad
    end
    F-->>W: Datos de métricas o Error con el mensaje
    W-->>E: Porcentaje, "no calculable", "sin datos" o error
    end

    rect rgb(240, 240, 240)
    Note over E,X: B. Consultar el semáforo (histórico, sin filtro)
    G->>C: GET /dashboard/kpis (con el mismo permiso)
    C->>V: obtenerKpisConSemaforo()
    V->>V: listarMetas() y obtenerValorKpi("USO_CAPACIDAD")
    V->>R: consultarUsoCapacidad(null, null)
    R-->>V: Filas de rutas con la capacidad de la copia del ERP
    V->>U: calcularUsoCapacidad(filas)
    U-->>V: porcentaje o null
    V->>V: calcularSemaforo(porcentaje, meta, umbrales, MAYOR_ES_MEJOR)
    V-->>G: 200 con valor, meta y color (null si no hay valor o meta)
    end
```

Fuente editable: [`kpi-uso-capacidad.mmd`](kpi-uso-capacidad.mmd). Exportación: [`kpi-uso-capacidad.png`](kpi-uso-capacidad.png).

## 4. Trazabilidad al código

| Elemento | Archivo |
| :--- | :--- |
| Endpoints `metricas` y `kpis` | `services/logistica-service/src/dashboard/dashboard.controller.ts` |
| `consultarUsoCapacidad` y `obtenerValorKpi` | `services/logistica-service/src/dashboard/dashboard.service.ts` |
| `calcularUsoCapacidad` | `services/logistica-service/src/dashboard/uso-capacidad.ts` |
| `calcularCarga` | `services/logistica-service/src/rutas/validaciones/carga.ts` |
| `compararCapacidad` | `services/logistica-service/src/recursos-externos/dto/recursos-logisticos-v1.validator.ts` |
| Pruebas | `dashboard.service.spec.ts` y `dashboard.uso-capacidad.integracion.spec.ts` |

## 5. Regenerar la exportación

```powershell
cd docs/diagramas/sprint-4/secuencia
npx @mermaid-js/mermaid-cli -i kpi-uso-capacidad.mmd -o kpi-uso-capacidad.png -c ../../sprint-3/mermaid-integraciones.config.json -b white -s 2
```
