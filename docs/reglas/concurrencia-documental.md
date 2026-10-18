# Regla de concurrencia documental de boletas

Esta regla implementa ABC-224 y protege la emisión de boletas para que dos
operaciones simultáneas no comprometan más producto que el conforme informado
por Producción.

## Invariantes

- La unidad de exclusión es el par `ordenId`/`productoId`.
- Solo las boletas `EMITIDA` consumen saldo documental. `BORRADOR` y `ANULADA`
  no lo consumen.
- La suma de los ítems se calcula como decimal exacto con cuatro posiciones;
  no se convierte a punto flotante.
- La consulta del compromiso local y el cambio `BORRADOR` a `EMITIDA` ocurren
  en una sola transacción.
- Después de obtener el bloqueo se vuelven a consultar los conformes y las
  boletas emitidas. Una lectura anterior al bloqueo no autoriza la emisión.
- Si `cantidad solicitada > cantidad conforme - cantidad emitida`, la API
  responde `409 Conflict` y la boleta permanece `BORRADOR`.
- Si Producción no responde o entrega cantidades inválidas, la transacción se
  revierte y no existe una disponibilidad estimada de respaldo.
- Repetir la operación sobre una boleta ya `EMITIDA` no vuelve a comprometer
  cantidad.

## Operación

`POST /boletas/{id}/emitir`

Requiere una sesión con el permiso `logistica.boletas.gestionar`. Una cuenta
que solo tenga `logistica.boletas.consultar` recibe `403 Forbidden` antes de
abrir la transacción.

## Serialización

PostgreSQL mantiene una fila en `boleta_emision_bloqueos` por orden/producto.
La clave primaria compuesta evita que existan dos claves distintas para el
mismo recurso documental.

Dentro de la transacción, la emisión:

1. crea la clave si todavía no existe;
2. bloquea la fila mediante `SELECT ... FOR UPDATE`;
3. vuelve a cargar la boleta y confirma que continúa en `BORRADOR`;
4. consulta nuevamente los conformes en Producción;
5. suma las cantidades de las boletas `EMITIDA` de la orden;
6. compara el saldo con la suma de los ítems del borrador;
7. confirma `EMITIDA` o revierte con `409`.

El bloqueo se libera automáticamente al confirmar o revertir. Pares distintos
de orden/producto usan filas diferentes y no se bloquean entre sí.

## Casos de prueba de ABC-224

Caso concurrente principal:

- conforme de la orden: `10.0000`;
- emisor A: boleta en borrador por `6.0000`;
- emisor B: otra boleta en borrador por `6.0000`;
- resultado esperado: una queda `EMITIDA`, la otra recibe `409` y permanece
  `BORRADOR`; el compromiso final es `6.0000`.

La prueba usa dos transacciones reales contra PostgreSQL y un esquema temporal
aislado. En PowerShell se ejecuta con:

```powershell
$env:RUN_DB_INTEGRATION='true'
npm.cmd test -- --runInBand boletas.concurrencia.spec.ts
```

Desde Bash:

```bash
RUN_DB_INTEGRATION=true npm test -- --runInBand boletas.concurrencia.spec.ts
```

La suite normal compila la prueba pero la omite cuando PostgreSQL no está
disponible. Las pruebas del guard cubren tanto una identidad con permiso de
gestión como otra que solo puede consultar.

## Evidencia local

El 17 de octubre de 2026 se ejecutó el caso concurrente contra PostgreSQL 15:
una operación terminó correctamente, la otra recibió `ConflictException`, y la
lectura posterior devolvió una boleta `EMITIDA` y una `BORRADOR`.
