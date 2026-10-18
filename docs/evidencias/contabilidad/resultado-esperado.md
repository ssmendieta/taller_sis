# Resultado esperado antes de ejecutar ABC-253

La prueba se ejecutará solo contra el emulador local. Se usará una orden finalizada con snapshot de cierre, una cuenta cuyo rol real sea **Encargado de Producción** (incluye `ordenes.finalizar_cancelar`) y una cuenta **Supervisor** (no incluye ese permiso). El repositorio no trae credenciales de esas dos cuentas: deben existir o crearse mediante el flujo real de Auth antes de la demo, sin documentar sus contraseñas.

| Caso | Resultado esperado |
|---|---|
| Válido | POST autorizado = 201; outbox publica `ProduccionCerrada.v1`; simulador responde `RECIBIDO`; cierre pasa de `PENDIENTE` a `RECIBIDO`; ambos procesos registran el mismo `correlationId`. |
| Rechazado | Para un cierre con `cantidadConforme = 0.0000`, el simulador responde `RECHAZADO` con `SIN_PRODUCCION_CONFORME`; el cierre queda final `RECHAZADO`. |
| Sin permiso | POST con Supervisor = 403; no se crean cierre ni evento outbox. |
| Duplicado | Reentregar el mismo `eventId` conserva una sola fila de inbox y no cambia estado, evento aplicado ni historial. |
| Interrupción | Con `CONTABILIDAD_SIMULATOR_CRASH_AFTER_SAVE_ONCE=true`, el simulador termina después de guardar y antes del ACK; al reiniciar publica la respuesta pendiente con el mismo `eventId`, y Producción converge al mismo resultado sin doble efecto. |

Regla de rechazo definida para el simulador: `Number(data.cantidadConforme) === 0`. Es una regla exclusivamente local de prueba; el repositorio no contiene una regla contable de negocio acordada.
