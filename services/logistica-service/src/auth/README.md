# Autenticación de Logística

`PermisoLogisticaGuard` valida el Bearer contra `GET /me` de Auth con un
timeout de tres segundos y autoriza por los códigos de permiso devueltos en
`permisos[].codigo`. Los errores de token, permiso y disponibilidad se traducen
respectivamente a 401, 403 y 503. El ID autenticado se conserva como texto para
no perder precisión al guardarlo en `BIGINT`.

`permiso-logistica.guard.spec.ts` es una prueba unitaria: simula `fetch` y no
verifica Auth, cuentas ni asignaciones reales. La comprobación con los roles
reales Encargado de Logística y Supervisor queda pendiente hasta disponer de
Auth y cuentas autorizadas en un entorno de prueba.
