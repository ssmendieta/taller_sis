# ABC-294, subtarea 4: evidencia de lotes, saldo conforme y autorización

- Historia: Identificar con un lote las unidades conformes.
- Fecha: 19/10/2026, zona America/La_Paz.
- Rama: `RamaAndrea`.
- HEAD al iniciar la revisión: `3732292`; las ampliaciones de pruebas quedan sin commit.
- Resultado: **71 pruebas aprobadas, 0 fallidas, 0 omitidas, en 5 suites de lotes**.
- Compilación de Producción: **aprobada**.
- Comparación inicial: ya existían 57 pruebas aprobadas. Se añadieron 14 casos
  HTTP contra PostgreSQL real, sin modificar el comportamiento de producción.

## Alcance y reglas existentes

Se reutilizan `LotesController`, `CrearLoteDto`, `LotesService`, `LotesModule`,
`PermisoProduccionGuard`, las entidades y las migraciones actuales.

| Operación existente | Permiso existente |
| --- | --- |
| `POST /lotes` | `calidad.registrar_conformes` |
| `GET /lotes/orden/:ordenCodigo` | `ordenes.consultar` |

El gateway agrega `/api/produccion`. El permiso de creación ya está definido por
la migración de Auth `CalidadRegistrarConformes1710000000013`; no se inventa uno
para estas pruebas.

El código es único en **todo Producción**, incluso entre órdenes distintas,
según `uq_lotes_codigo`. Se recortan espacios exteriores y se mantiene la
distinción existente entre mayúsculas y minúsculas.

El saldo se calcula como conformes persistidos de la orden menos cantidades
asignadas a sus lotes. Los defectuosos y los conformes de otras órdenes no
incrementan ese saldo. El servicio bloquea la orden dentro de la transacción y
responde con `ConflictException` (HTTP 409) ante duplicados o exceso.

## Entorno de verificación

Las nuevas pruebas están en
`services/produccion-service/src/lotes/lotes.persistencia.spec.ts`.
Se arranca Nest con `LotesModule`, TypeORM y PostgreSQL reales. Se aplican las
migraciones existentes de esquema, secuencia de órdenes, calidad y lotes dentro
de un esquema exclusivo `abc294_test_<pid>_<marca_de_tiempo>` de `produccion_db`.
El esquema se elimina al terminar; no se alteran las tablas de la aplicación.

Los avances y resultados conformes/defectuosos son persistidos; la calidad se
registra mediante el servicio existente de ABC-82/83. El fixture habitual tiene
100 producidas, dos registros conformes de 10 y 13, y 5 defectuosas. El saldo
asignable a lotes es 23.

Solo se simula la respuesta de Auth con identidad y permisos. Las peticiones HTTP,
el guard, controlador, DTO, servicio, repositorios, restricciones y transacciones
son reales. Para el caso de rollback se inyecta un fallo después de ejecutar el
INSERT real. No se simula la persistencia.

## Casos nuevos aprobados

| Caso | Resultado HTTP comprobado | Estado persistido comprobado |
| --- | --- | --- |
| Asignar 23 unidades de los conformes 10+13 y consultar el lote | POST 201 y GET 200 | La respuesta coincide con la fila guardada; responsable 42 y fecha de BD; avances y calidad intactos |
| Repetir código en la misma orden, con espacios exteriores | 409: `Ya existe un lote con este código` | Todos los lotes quedan iguales; un solo registro con ese código |
| Repetir código en otra orden | 409: `Ya existe un lote con este código` | Unicidad global; todos los lotes quedan iguales |
| Asignar 10 de 23 y luego intentar 14 | 409: `La cantidad supera los conformes disponibles sin asignar de la orden` | No aparece el lote rechazado; los anteriores quedan iguales; asignar después los 13 restantes da 201 |
| Orden inexistente 999999 | 404: `Orden con id 999999 no encontrada` | Todos los lotes quedan iguales |
| Orden inválida 0 | 400 | Todos los lotes quedan iguales |
| Orden inválida -1 | 400 | Todos los lotes quedan iguales |
| Orden inválida 1.5 | 400 | Todos los lotes quedan iguales |
| Cantidad 0 | 400 | Todos los lotes quedan iguales |
| Cantidad -1 | 400 | Todos los lotes quedan iguales |
| Usuario autenticado sin `calidad.registrar_conformes`, con permisos de consulta y avance | POST 403; GET permitido con 200 | No se crea ni se modifica ningún lote |
| Usuario sin `ordenes.consultar`, aunque tenga permiso de creación | GET 403 | Los lotes existentes quedan iguales |
| POST sin sesión | 401 | No se crea ni se modifica ningún lote |
| Fallo después del INSERT real del lote | 500 esperado | La transacción revierte: las filas completas coinciden con las anteriores y no queda el lote insertado |

El mensaje de autorización comprobado es `No tiene permisos para esta operación`.
Los rechazos no se verifican únicamente por conteo: se comparan las filas
completas de lotes antes y después. Esto detecta también cambios silenciosos
en registros ya existentes.

La prueba de rollback genera en consola el error esperado
`Fallo simulado despues de insertar el lote`; no indica una prueba fallida.

## Cobertura previa conservada

Las 57 pruebas anteriores también aprueban. Incluyen reglas unitarias, HTTP con
persistencia simulada, metadatos, persistencia tras reconectar, unicidad global,
exceso, exclusión de defectos y otras órdenes, ausencia de conformes,
asignaciones concurrentes, duplicados concurrentes entre órdenes, restricciones
de base de datos y reversión/reaplicación aislada de la migración de lotes.

## Comandos ejecutados

Desde `services/produccion-service`, antes y después de ampliar las pruebas:

```powershell
$env:DB_DATABASE='produccion_db'
$env:PUBSUB_ENABLED='false'
$env:LOTES_DB_REAL='1'
npm test -- --runInBand lotes
```

Resultado inicial: 57 pruebas aprobadas en 5 suites. Resultado final:

```text
Test Suites: 5 passed, 5 total
Tests:       71 passed, 71 total
Snapshots:   0 total
```

Compilación:

```powershell
npm run build
```

Resultado: `nest build`, código de salida 0.

Desde la raíz del repositorio:

```powershell
git diff --check
```

Resultado: sin errores de espacios.

## Límites y conclusión para Jira

**Los criterios solicitados de ABC-294, subtarea 4, quedan comprobados en la API
actual y en PostgreSQL real:** lote válido, duplicado global, exceso sobre el
saldo conforme, orden inválida/inexistente y autorización. Los rechazos no dejan
registros parciales y se conserva el conflicto 409 del servicio.

No se probaron cuentas ni login contra Auth real; la asignación efectiva de
permisos del entorno requiere comprobar las migraciones de Auth y las cuentas
correspondientes. Esto no se presenta como una prueba integral del despliegue.
No hay bloqueos para los casos automatizados descritos.

No se agregan pantallas, endpoints, permisos ni migraciones; no se cambian
inventario, calidad, consumos ni otras historias. No se hizo commit ni push y se
conservaron los cambios de Git que ya existían.
