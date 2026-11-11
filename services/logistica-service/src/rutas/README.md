# Rutas de transporte (ABC-368)

## Modelo (ABC-369)

| Tabla | Contenido |
| --- | --- |
| `rutas` | grupo, fecha programada, vehículo y chofer (ids externos del ERP), estado, responsable |
| `rutas_paradas` | parada numerada (`secuencia`) con su destino |
| `rutas_paradas_boletas` | boletas que se entregan en cada parada (FK a `boletas_envio`) |

Vehículo y chofer se guardan como identificadores externos sin clave foránea:
el ERP es otra base. El grupo es local (ABC-362); el servicio comprueba y
bloquea el grupo activo antes de guardar la asignación. El identificador se
conserva para las rutas históricas.

## API (ABC-370)

Vía gateway: `/api/logistica/rutas`.

| Método | Ruta | Permiso |
| --- | --- | --- |
| `POST` | `/rutas` | `logistica.rutas.gestionar` |
| `PUT` | `/rutas/:id` | `logistica.rutas.gestionar` |
| `GET` | `/rutas` | `logistica.rutas.consultar` |
| `GET` | `/rutas/:id` | `logistica.rutas.consultar` |

Cuerpo de `POST` y `PUT`:

```json
{
  "grupoId": "4",
  "fechaProgramada": "2026-11-10",
  "vehiculoExternoId": "VEH-01",
  "choferExternoId": "CHO-07",
  "paradas": [
    { "destino": "Tienda Central", "boletaIds": ["1", "2"] },
    { "destino": "Sucursal Norte", "boletaIds": ["3"] }
  ]
}
```

Reglas aplicadas:

- Solo boletas `EMITIDA`; una anulada o en borrador devuelve 409.
- Una boleta no puede estar en dos rutas `PLANIFICADA`/`DESPACHADA`. Las boletas
  se bloquean con `FOR UPDATE` para que dos guardados simultáneos no la compartan.
- Solo se edita una ruta `PLANIFICADA`; despachada, completada o cancelada devuelve 409.
- `PUT` reemplaza las paradas completas, dentro de la misma transacción.

Un grupo inexistente o deshecho devuelve 409 antes de guardar la ruta.

## Disponibilidad y capacidad (ABC-371)

`POST` y `PUT` validan además (`validaciones/`):

| Regla | Respuesta |
| --- | --- |
| Vehículo y chofer deben figurar como disponibles en los recursos del ERP de `fechaProgramada` (ABC-353); si el ERP falla se usa su copia de respaldo (ABC-352) | 409 si no figuran o no están disponibles; 503 si no hay ERP ni copia |
| Ninguna otra ruta `PLANIFICADA` o `DESPACHADA` del mismo día usa ese vehículo o chofer | 409 `Recursos ya asignados el …` |
| Carga = suma de los ítems de las boletas, en la unidad del producto de su orden (`GET /ordenes/:id` de Producción, con la sesión del usuario) | 409 si una boleta no tiene ítems, si la unidad es desconocida o no es del contrato (`kg`, `l`, `m3`, `unidad`, `caja`, `paquete`) o si se mezclan unidades; 503 si Producción no responde |
| La carga no supera la capacidad del vehículo y está en la misma unidad (sin conversiones) | 409 `Sobrecarga: …` o unidad incompatible |

Concurrencia: dentro de la transacción del guardado se toma
`pg_advisory_xact_lock` por vehículo y por chofer del día, en orden fijo y antes
de bloquear las boletas. Dos guardados simultáneos con el mismo recurso se
ejecutan uno tras otro y el segundo ve la ruta del primero (409).

Recursos del ERP y unidades de Producción se consultan antes de abrir la
transacción, para no retener bloqueos mientras se espera a otro servicio.
Asignar una ruta **no reserva** el vehículo ni el chofer en el ERP: el contrato
v1 no tiene esa operación.

Consecuencia para los entornos: sin datos de recursos para la fecha (ERP o
simulador configurado con `ERP_RECURSOS_URL`, o una copia de respaldo previa)
no se puede crear ni editar rutas.

## Despacho y entrega (ABC-376)

Permiso `logistica.rutas.gestionar`. Cuerpo opcional `{ "observacion": "..." }`
(hasta 500 caracteres); fecha, autor y estado los fija el servidor, y cualquier
otro campo devuelve 400.

| Método | Ruta | Efecto |
| --- | --- | --- |
| `POST` | `/rutas/:id/despacho` | `PLANIFICADA` → `DESPACHADA` con `despachada_en`, autor y observación |
| `POST` | `/rutas/:id/paradas/:paradaId/entrega` | parada `PENDIENTE` → `ENTREGADA`; la ruta pasa a `COMPLETADA` al entregar la última parada válida |

Reglas (máquina de estados de ABC-375):

- Despacho: ruta `PLANIFICADA` con vehículo, chofer y al menos una entrega
  pendiente; todas sus boletas deben seguir `EMITIDA` (una anulada después de
  planificar devuelve 409).
- Entrega: solo en ruta `DESPACHADA`; una parada de otra ruta devuelve 409 y una
  inexistente 404; una boleta anulada en la parada devuelve 409. Las entregas
  parciales dejan la ruta `DESPACHADA`; las paradas `ANULADA` no cuentan para el cierre.
- Repetir un despacho o una entrega, o retroceder un estado, devuelve 409 y
  conserva la fecha y el autor originales. Ruta, paradas y boletas se bloquean
  con `FOR UPDATE` para que dos envíos simultáneos no se registren dos veces.
- El despacho llama a `EventosDespacho.registrarDespacho` dentro de su
  transacción (`despacho/eventos-despacho.ts`). `OutboxEventosDespacho` (ABC-386)
  guarda el evento en el outbox en ese mismo commit; el publicador lo envía
  después. Planificar una ruta no genera todavía el evento de despacho.

## Historial de rutas (ABC-391)

`GET /historial/rutas` (permiso `logistica.rutas.consultar`), solo lectura.

| Parámetro | Uso |
| --- | --- |
| `fechaDesde`, `fechaHasta` | días `YYYY-MM-DD` sobre la fecha programada (inclusive) |
| `estado` | `PLANIFICADA`, `DESPACHADA`, `COMPLETADA` o `CANCELADA` |
| `chofer` | coincidencia parcial del id externo, sin distinguir mayúsculas |
| `page`, `limit` | página desde 1; 1 a 100 registros (10 por defecto) |

Los filtros se combinan con AND. Orden estable: fecha programada descendente y
luego id descendente. Respuesta `{ items, total, page, limit, totalPages }` con
`totalParadas` y `totalBoletas` por ruta, calculados sin duplicar filas.

## Aceptación y regresión (ABC-373)

`rutas.aceptacion.spec.ts` ejecuta peticiones HTTP contra `RutasModule`, su
guard y sus validadores reales, con las migraciones del proyecto en un esquema
PostgreSQL temporal. Comprueba persistencia tras reiniciar la aplicación,
conflictos concurrentes de recursos observando bloqueos reales en `pg_locks`,
precisión de capacidad, unidades, boletas, permisos y rollback completo de una
edición ante un fallo SQL.

Auth, ERP y Producción son **simuladores HTTP locales** en esta suite. No
demuestra conexión con sistemas externos reales, Docker ni Google Pub/Sub.
Las filas y restricciones auxiliares quedan dentro de `abc373_*`; se retiran
al finalizar. Activar únicamente contra una base de prueba accesible con las
variables `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` y `DB_DATABASE`.

Desde `services/logistica-service`:

```powershell
$env:LOGISTICA_DB_REAL='1'
npm test -- --runInBand src/rutas src/recursos-externos
npm run build
```

El recorrido de planificación desde la interfaz (CA-05) sigue dependiendo de
ABC-372. La evidencia y los puntos pendientes se detallan en
`docs/evidencias/sprint-3/ABC-373.md` desde la raíz del repositorio.
