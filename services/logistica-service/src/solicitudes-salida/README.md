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

Producción expone consultas protegidas de órdenes y resultados conformes, pero
Logística no tiene un permiso de Producción para invocarlas y la API de lotes
no tiene endpoint de consulta. Por ello esta implementación conserva la orden
y referencia declaradas, pero no demuestra la existencia/estado de la orden,
la identidad del producto ni que una referencia de lote corresponda a unidades
conformes disponibles. El registro en `BORRADOR` no afirma que esa verificación
haya ocurrido. Para completar la comprobación se necesita un contrato de
servicio autorizado que incluya lectura de lotes y su cantidad conforme.

La referencia de orden no tiene FK: Producción y Logística mantienen bases
independientes. La única FK local une los ítems con su solicitud.

## Migración

`1710000000001-CrearSolicitudesSalida.ts` es el identificador propuesto y no
colisiona con los archivos de migración actualmente presentes en Logística.
Jira requiere acordar la numeración con el equipo; ese acuerdo no se verificó.
La migración no se ejecutó porque no se identificó una base autorizada.

## Pruebas

Los archivos `*.spec.ts` de este módulo son unitarios y usan mocks para
repositorios/transacciones. No demuestran persistencia real, rollback en
PostgreSQL ni conformidad de una orden/lote consultada en Producción.
