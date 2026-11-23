# ABC-514: secuencia del detalle de un KPI

Apertura del detalle de un KPI y navegación hacia la orden o ruta. Subtarea **ABC-514** de la historia **ABC-428**, elaborada junto con **ABC-512** (endpoint) y **ABC-513** (pantalla).

## Alcance

- Con detalle hoy: **FPY** y **USO_CAPACIDAD**, los únicos KPIs con cálculo. Los otros seis responden `disponible: false` hasta que exista su cálculo; cada uno se conecta en `obtenerDetalleKpi`.
- Las tarjetas muestran el valor de todo el historial, igual que el semáforo, y abren el detalle sin periodo. El detalle admite `?desde&hasta` en la dirección.
- El detalle usa el mismo criterio que el KPI (`COLUMNAS_FPY` y `calcularUsoCapacidad`), por eso el valor coincide.

## Diagrama

```mermaid
sequenceDiagram
    autonumber
    actor S as Supervisor
    participant W as TarjetasKpi (widget)
    participant D as DetalleKpiPage
    participant F as Servicio del frontend
    participant G as API Gateway
    participant C as DashboardController
    participant A as auth-service
    participant V as DashboardService
    participant R as Registros de origen
    participant O as Orden o ruta (página)
    Note over C,R: Producción (FPY) o Logística (USO_CAPACIDAD), cada uno con su base

    S->>W: Pulsa Ver detalle en un KPI
    W->>D: Navega a /produccion/kpis/:kpi o /logistica/kpis/:kpi
    D->>D: Lee desde y hasta de la dirección
    D->>F: detalle(kpi, { desde, hasta })
    F->>G: GET /api/{area}/dashboard/kpis/:kpi/detalle?desde&hasta
    G->>C: GET /dashboard/kpis/:kpi/detalle
    C->>A: GET /me con el token Bearer
    A-->>C: Identidad y permisos
    alt Sin sesión, sin permiso o Auth caído
        C-->>F: 401, 403 o 503
    else Permiso válido
        C->>V: obtenerDetalleKpi(kpi, filtro)
        alt KPI inexistente en el servicio
            V-->>F: 404 Not Found
        else Fechas inválidas
            V-->>F: 400 Bad Request
        else KPI todavía sin cálculo
            V-->>F: 200 con disponible = false y registros vacíos
        else FPY (Producción)
            V->>R: resultados_conformes por orden, mismo criterio del KPI
            R-->>V: Órdenes con conformes a la primera y evaluadas
            V->>R: Defectuosos agrupados por causa_defecto, de mayor a menor
            R-->>V: Causas y cantidades
            V->>V: valor = suma de conformes a la primera / suma de evaluadas
            V-->>F: 200 con valor, órdenes, causas y unidades defectuosas
        else USO_CAPACIDAD (Logística)
            V->>R: Rutas despachadas o completadas, carga y capacidad
            R-->>V: Filas de carga
            V->>V: calcularUsoCapacidad, la misma función del KPI
            V-->>F: 200 con valor y rutas (incluye las no calculables)
        end
    end
    F-->>D: Detalle o Error con el mensaje
    D-->>S: Tabla, detalle vacío, no disponible o error con Reintentar
    opt Cambia el periodo
        S->>D: Elige otro periodo
        D->>D: Actualiza la dirección y vuelve a consultar
    end
    opt Abre un registro
        S->>D: Pulsa una orden o ruta
        D->>O: Navega a /ordenes/:id o /logistica/rutas/:id
        O-->>S: Detalle del registro
        S->>D: Vuelve con Atrás y conserva el periodo
    end
```

Fuente editable: [`detalle-kpi.mmd`](detalle-kpi.mmd). Exportación: [`detalle-kpi.png`](detalle-kpi.png).

## Trazabilidad al código

| Elemento | Archivo |
| :--- | :--- |
| Endpoint y cálculo | `services/{produccion,logistica}-service/src/dashboard/dashboard.{controller,service}.ts` |
| Tarjetas con semáforo | `frontend/src/components/kpis/TarjetasKpi.jsx` |
| Pantalla de detalle | `frontend/src/pages/DetalleKpiPage.jsx` |
| Servicios del frontend | `frontend/src/services/kpis.js`, `dashboardService.js`, `dashboardLogisticaService.js` |
| Pruebas | `dashboard.service.spec.ts`, `dashboard.http.spec.ts`, `dashboard.detalle-kpi.integracion.spec.ts`, `frontend/scripts/kpis.test.mjs` |
