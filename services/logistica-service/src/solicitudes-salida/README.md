# Solicitudes documentales de salida (ABC-272)

La API crea solicitudes en estado `BORRADOR` y persiste cabecera e ítems en una
transacción. No admite que el cliente elija el estado o al responsable.

## Rutas

- `POST /solicitudes-salida`: requiere `logistica.solicitudes.gestionar`.
- `GET /solicitudes-salida`: requiere `logistica.solicitudes.consultar`.
- `GET /solicitudes-salida/:id`: requiere `logistica.solicitudes.consultar`.

El `POST` recibe `ordenId`, `destinoDocumental`, `motivo` e `items`, donde cada
ítem tiene `referencia` y `cantidad` como texto decimal de hasta cuatro lugares.

## Límite de verificación de Producción

La pantalla `/logistica/inicio` obtiene las órdenes desde Producción y consulta
`GET /lotes/orden/:ordenCodigo` para seleccionar referencias existentes. Estas
lecturas requieren `ordenes.consultar`. La migración de Auth
`LogisticaConsultaProduccion1710000000018`, autorizada por Andrea, asigna ese
permiso existente al Encargado de Logística sin conceder escritura en Producción.

La API de solicitudes conserva la orden y referencias declaradas; no consulta
Producción al registrar el borrador. Al convertir la solicitud en boleta,
`BoletasService` sí consulta la orden, su producto y los lotes de esa orden antes
de guardar. No se modifican existencias ni se considera una solicitud BORRADOR
como una salida emitida.

La referencia de orden no tiene FK: Producción y Logística mantienen bases
independientes. La única FK local une los ítems con su solicitud.

## Migración

La tabla de solicitudes usa `1710000000001-CrearSolicitudesSalida.ts`. El esquema
actual de Logística tiene cuatro migraciones, verificadas como aplicadas en
`logistica_db`. Este cambio no requiere otra migración de Logística.

## Pruebas

Además de las pruebas unitarias, `solicitud-boleta.http.persistencia.spec.ts`
levanta Nest con los módulos reales de solicitudes y boletas y PostgreSQL en un
esquema aislado de `logistica_db`. Verifica creación, listado, conversión en
boleta, paginación con relaciones, persistencia tras reiniciar y rollback ante
fallo de un ítem. Auth y las consultas externas a Producción se simulan solo en
estas pruebas. El frontend se prueba con `npm run test:logistica`.

Evidencia y comandos: [solicitud a boleta](../../../../docs/evidencias/boletas/solicitud-salida-a-boleta.md).
