# Agrupación de solicitudes de salida (ABC-128)

## Reglas de compatibilidad (ABC-360)

`reglas/compatibilidad.ts` decide si un conjunto de solicitudes puede viajar
en el mismo grupo. Es lógica pura: no consulta la base ni otros servicios.

Un grupo es compatible cuando tiene al menos dos solicitudes válidas y todas:

| Criterio | Comparación |
| --- | --- |
| Estado | `BORRADOR` o `PREPARADA` (una anulada se rechaza) |
| Destino / zona | igual, sin distinguir mayúsculas ni espacios repetidos |
| Fecha requerida | misma fecha `YYYY-MM-DD` |
| Tipo de carga | igual, sin distinguir mayúsculas |
| Unidad de carga | exactamente la misma unidad (`kg` ≠ `unidad`) |

Ejemplos:

| Solicitudes | Resultado |
| --- | --- |
| 3 solicitudes a "Zona Sur", 10/11, carga seca en kg | Compatible |
| Las mismas más una a "Zona Norte" | Rechazo `DESTINO_DISTINTO` para esa solicitud |
| Una con fecha 11/11 | Rechazo `FECHA_DISTINTA` |
| Una en estado `ANULADA` | Rechazo `ESTADO_NO_AGRUPABLE` |
| Destino vacío o fecha 30/02 | Rechazo `DATOS_INCOMPLETOS` |

## Cálculo de prioridad (ABC-361)

`reglas/prioridad.ts` ordena solicitudes sin modificarlas. Con las mismas
solicitudes y la misma fecha de referencia el orden es siempre el mismo:

1. **Nivel**: `URGENTE` (vencida o vence en 1 día o menos) → `ALTA` → `MEDIA` → `BAJA`.
   Sin prioridad explícita se usa `MEDIA`.
2. **Fecha requerida** más próxima primero.
3. **Id** numérico ascendente como desempate final.

Pendiente de integración: `solicitudes_salida` todavía no guarda fecha
requerida, tipo ni unidad de carga. La entidad de grupo (ABC-362) debe mapear
esos datos a `SolicitudAgrupable` antes de llamar a la regla.
