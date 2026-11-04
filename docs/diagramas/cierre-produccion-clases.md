# ABC-299: clases del snapshot de cierre

El repositorio guarda diagramas en `docs/diagramas/`; se añade este diagrama de
clases para el nuevo modelo. [Detalles y pruebas](../../services/produccion-service/src/cierre-produccion/README.md).

```mermaid
classDiagram
    class OrdenProduccion {
        id
        codigo
        estado
        finalizada_en
    }
    class CierreProduccion {
        id
        ordenId
        cierreVersion
        ordenCodigo
        JSONB producto
        cantidadSolicitada
        cantidadProducida
        cantidadConforme
        cantidadDefectuosa
        JSONB consumos
        finalizadaAt
        fechaCierre
    }
    class ConsumoCierreV1 {
        materialId
        materialCodigo
        materialNombre
        cantidad
        unidad
    }
    class AvancesProduccion {
        orden_id
        cantidad_producida
    }
    class ResultadoConforme {
        ordenId
        tipo
        cantidad
    }
    class ConsumoMaterial {
        ordenId
        materialId
        cantidad
        unidad
    }
    OrdenProduccion "1" <-- "0..*" CierreProduccion : orden_id RESTRICT
    CierreProduccion "1" *-- "0..*" ConsumoCierreV1 : valores congelados
    CierreProduccion ..> AvancesProduccion : origen de producidas
    CierreProduccion ..> ResultadoConforme : origen de conformes y defectuosas
    CierreProduccion ..> ConsumoMaterial : origen de consumos por unidad
```

Las dependencias punteadas indican el origen de los datos al construir el
snapshot, no nuevas relaciones de base de datos. `ConsumoCierreV1` es el tipo
ya existente de los valores JSONB; no es otra tabla ni duplica los registros de
ABC-71. Cada orden y versión identifica un único snapshot. Los campos históricos
se leen del cierre y no se vuelven a consultar a través de estas dependencias.
