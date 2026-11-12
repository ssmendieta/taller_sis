# Correcciones locales — 12/11/2026

Base: `RamaSergio`, HEAD `98b15f13ce74b59b3ea34d97d43e444afdb92973`. Cambios en el árbol de trabajo, sin commit, push ni modificación de Jira. La referencia consultada de integración es `origin/develop` en `f977f5cf602cfe7bf8b9efec946fbb578b36dfde`.

## Cambios implementados

| Hallazgo | Corrección | Estado |
| --- | --- | --- |
| ABC-401 ocultó la vigencia del respaldo del ERP, requerida por ABC-115 | Pantalla de recursos muestra aviso, fecha de sincronización y fecha de generación del ERP | Implementado y probado |
| La incorporación de repositorios del respaldo rompía la preparación de 35 pruebas HTTP | Sustitución explícita de los repositorios en esa suite; se mantiene el registro real del módulo | 35 pruebas aprobadas |
| Boletas históricas sin producto/unidad bloquean el despacho después de ABC-385 | Procedimiento autenticado, transaccional, idempotente y limitado a localhost; completa solo nulos con datos de la API de Producción e historial | Implementado, probado y aplicado a cuatro boletas locales |
| Suites antiguas creaban boletas con un esquema anterior a la migración 13 | Actualización de las migraciones de sus esquemas de prueba | Corregido en preparación de pruebas |
| Reportes ABC-409 omitían commits y pedían causas de ABC-276 pese a excluirla | Reportes regenerados, dos SHA locales identificados, responsabilidad PM explícita, snapshot Jira actualizado y arrastres históricos pendientes de validación | Documentación local actualizada |
| Rama local carecía de la integración React/API/PostgreSQL de ABC-373 presente en origin/develop | Incorporada esa prueba de forma selectiva y agregada a scripts npm | 9 pruebas aprobadas |

La incorporación selectiva de ABC-373 no constituye un merge ni sincroniza toda la rama con develop. No se incorporaron el overlay Docker ni los scripts de despliegue de ABC-403, que modifican el modo de ejecución de Pub/Sub. No se reiniciaron ni reconstruyeron los contenedores para desplegar estos cambios.

## Verificación ejecutada

- Logística con `LOGISTICA_DB_REAL=1`: 64 suites aprobadas, 724 pruebas aprobadas, 21 omitidas por requerir `RUN_DB_INTEGRATION=true`. Incluye las 14 pruebas de reparación en PostgreSQL y 14 de autorización/alcance del comando.
- Se habilitó después `RUN_DB_INTEGRATION=true` y se ejecutaron las cuatro suites afectadas: historial, concurrencia, trazabilidad y agrupación. Sus 35 pruebas aprobaron, incluidas las 21 omitidas del recorrido anterior. Cobertura acumulada: **745 pruebas distintas de Logística aprobadas**; no se suman de nuevo las 14 repetidas ni las reejecuciones enfocadas.
- Reejecución enfocada de solicitud/boleta HTTP, reparación y CLI: 46 pruebas aprobadas.
- Frontend: 37 pruebas aprobadas de recursos, rutas, reprocesos y reportes logísticos.
- React + API Nest + PostgreSQL, `rutas-integracion-real.test.mjs`: 9 pruebas aprobadas. Auth, ERP y Producción simulados por HTTP; base real en esquema temporal.
- Compilación de Logística y frontend: aprobadas. Vite conserva su advertencia de tamaño del bundle; no impide compilar.
- `git diff --check`: sin errores de espacios. HEAD e índice conservados; cambios sin commit.

Las pruebas de persistencia usan esquemas temporales propios y los eliminan al terminar. Los dobles de mensajería de las suites existentes no acreditan una integración real en Google Cloud. Los resultados de pruebas no sustituyen ensayo de demo, validación visual ni aceptación del equipo.

## Pendientes y alcance excluido

La lectura de la base local encontró las boletas **3, 8, 12 y 13** emitidas sin producto/unidad y sin despacho previo. Con una sesión local válida se revisó y aplicó el lote: las cuatro quedaron como `EMITIDA`, con `producto_codigo = PAN-001` y `unidad = unidad`, más una entrada de historial por documento atribuida al usuario actor 3. Los conteos de outbox e inbox permanecieron en cero antes y después. [Procedimiento, garantías y resultado](reparacion-boletas-historicas.md).

Pub/Sub queda fuera de las modificaciones por instrucción expresa de Sergio. Se conserva el riesgo aceptado sobre configuración compartida y evidencia de mensajería real. No se modificaron código de integraciones, contratos, variables Pub/Sub, topics ni subscriptions, y no se hizo un despacho real para probar la reparación.

ABC-409 conserva los pendientes humanos descritos en [cierre-gestion.md](cierre-gestion.md): validar arrastres históricos, reportes individuales, autoevaluación confidencial, ensayo y entrega LMS. No se declara cumplimiento del 100 % ni se cambia Jira a Listo sin esos hechos.
