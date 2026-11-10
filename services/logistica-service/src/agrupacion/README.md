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

## API y pantalla (ABC-362)

En **Logística → Solicitudes de salida → Agrupación de solicitudes**, seleccionar
de dos a veinte solicitudes y completar la fecha requerida y tipo de carga
de cada una. Las solicitudes existentes carecen de esos dos campos, por lo que
se capturan al planificar y se conservan en el grupo. El destino proviene de
cada solicitud y la unidad se consulta en su orden de Producción. Los grupos
muestran miembros, datos de carga y estado de despacho.

| Método y ruta en el gateway | Permiso | Resultado |
| --- | --- | --- |
| `GET /api/logistica/agrupaciones` | `logistica.solicitudes.consultar` | Grupos activos, con miembros y estado de despacho |
| `POST /api/logistica/agrupaciones` | `logistica.solicitudes.gestionar` y acceso a la orden de Producción | 201, grupo nuevo |
| `POST /api/logistica/agrupaciones/:id/deshacer` | `logistica.solicitudes.gestionar` | 200, id y fecha de deshacer |

Ejemplo de cuerpo para agrupar:

```json
{
  "solicitudes": [
    { "solicitudId": "1", "fechaRequerida": "2026-11-12", "tipoCarga": "Seca" },
    { "solicitudId": "2", "fechaRequerida": "2026-11-12", "tipoCarga": "Seca" }
  ]
}
```

Si falla la regla de compatibilidad, se responde 409 con `conflictos`, donde
cada elemento identifica la solicitud y el motivo. Las pertenencias se guardan
en la misma transacción, con un índice único sobre miembros activos. Deshacer
registra autor y fecha, libera los miembros y desvincula las rutas todavía sin
despacho en la misma transacción. Una ruta que ya fue despachada impide deshacer
su grupo. Reintentar un deshacer exitoso devuelve la fecha original de deshacer.

Aplicar la migración `1710000000010-CrearGruposSalida` antes de usar la pantalla.
Los identificadores de grupo preexistentes en rutas se conservan y se reservan
al inicializar la secuencia. Las nuevas asignaciones de ruta verifican que el
grupo seleccionado exista y esté activo.

### Verificación

- Compilación de Logística y frontend. 152 pruebas aprobadas de Agrupación,
  Rutas y Despacho.
- Integración HTTP por el gateway con Auth, Logística, Producción y migraciones
  en PGlite. Se verificaron permisos, destino, fecha, tipo, unidad, concurrencia
  (201 y 409), deshacer, reasignación y protección de grupos despachados.
  Para crear la ruta del escenario se usó un ERP de prueba.
- Componente React montado contra el gateway para seleccionar dos solicitudes,
  completar sus datos, agrupar y deshacer. Validación funcional con React Test
  Renderer.
