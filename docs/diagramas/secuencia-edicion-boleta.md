# ABC-286: secuencia de edición de ítems de boleta en borrador v1

Este documento detalla el diseño, las reglas operativas y el diagrama de secuencia para la edición de ítems de una boleta de envío en estado `BORRADOR`, dando cumplimiento a las tareas **ABC-220** y **ABC-286** bajo la historia de usuario **ABC-78**.

---

## 1. Objetivo y alcance

- **Objetivo:** Permitir al Encargado de Logística corregir cantidades o sustituir referencias de lotes asignados a una boleta antes de su emisión definitiva, sin alterar el número único de la boleta, su estado documental ni el saldo disponible.
- **Alcance incluido:**
  - Actualización atómica de la colección de ítems (`DELETE` previo e `INSERT` de nuevos ítems en la misma transacción).
  - Validación de estado estricto: solo se admiten modificaciones en boletas en estado `BORRADOR`.
  - Validación de referencias: comprobación cruzada contra la solicitud de salida y los lotes válidos de Producción vía API interna.
  - Validación de cantidades: números estrictamente positivos con hasta cuatro decimales (`NUMERIC(14,4)`).
- **Alcance no incluido:**
  - Edición de boletas en estado `EMITIDA` o `ANULADA`.
  - Modificación del número correlativo o del responsable original de creación.
  - Reserva física o descuento de saldos documentales (el saldo solo descuenta boletas `EMITIDA`).

---

## 2. Reglas de negocio y respuestas HTTP

| Regla | Condición técnica | Código HTTP |
| :--- | :--- | :--- |
| **Autenticación requerida** | Token Bearer ausente, inválido o expirado | `401 Unauthorized` |
| **Autorización mínima** | Usuario no posee el permiso `logistica.boletas.gestionar` | `403 Forbidden` |
| **Estructura del payload** | Formato de body inválido, ítems vacío, cantidad `<= 0`, o más de 4 decimales | `400 Bad Request` |
| **Existencia de boleta** | El identificador no existe en `boletas_envio` o es inválido | `404 Not Found` |
| **Inmutabilidad por estado** | La boleta se encuentra en estado `EMITIDA` o `ANULADA` | `409 Conflict` |
| **Referencias ajenas** | Uno o más ítems no pertenecen a la solicitud o a los lotes de Producción | `404 Not Found` |
| **Falla de fuente externa** | Producción no responde o envía datos incompletos | `502 Bad Gateway` / `503 Service Unavailable` |
| **Rollback transaccional** | Error durante la escritura en base de datos (`DELETE` o `INSERT`) | `500 Internal Server Error` (Rollback) |
| **Operación exitosa** | Ítems actualizados de forma atómica conservando número y estado `BORRADOR` | `200 OK` |

---

## 3. Diagrama de secuencia

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Cliente (Encargado de Logística)
    participant Guard as PermisoLogisticaGuard
    participant Auth as auth-service (/auth/me)
    participant Pipe as ValidarActualizarBoletaItemsPipe
    participant Ctrl as BoletasController (PUT /boletas/:id/items)
    participant Svc as BoletasService
    participant Prod as produccion-service (HTTP)
    participant DB as logistica_db (PostgreSQL)

    %% Autenticación y Autorización
    Cliente->>Guard: PUT /boletas/:id/items (Bearer token + JSON)
    Guard->>Auth: GET /auth/me (Bearer token)
    alt Token ausente o sesión inválida
        Auth-->>Guard: 401 Unauthorized
        Guard-->>Cliente: 401 Unauthorized
    else Rol sin permiso logistica.boletas.gestionar
        Auth-->>Guard: 200 OK (sin permiso requerido)
        Guard-->>Cliente: 403 Forbidden
    else Autorizado con permiso logistica.boletas.gestionar
        Auth-->>Guard: 200 OK (usuarioId, permisos)
        Guard->>Pipe: Validar payload
    end

    %% Validación sintáctica y de dominio en Pipe
    alt Formato inválido (cantidad <= 0, > 4 decimales, lista vacía)
        Pipe-->>Cliente: 400 Bad Request
    else Payload válido
        Pipe->>Ctrl: ActualizarBoletaItemsDto normalizado
        Ctrl->>Svc: updateItems(id, dto, usuarioId, authorization)
    end

    %% Verificación de estado de la boleta
    Svc->>DB: findOne(BoletaEnvio, id)
    alt Boleta inexistente o ID inválido
        DB-->>Svc: null
        Svc-->>Cliente: 404 Not Found
    else Boleta en estado EMITIDA o ANULADA
        DB-->>Svc: BoletaEnvio (estado != BORRADOR)
        Svc-->>Cliente: 409 Conflict ("Solo se pueden editar boletas en estado BORRADOR")
    else Boleta en estado BORRADOR
        DB-->>Svc: BoletaEnvio (estado = BORRADOR)
        
        %% Validación de referencias con Solicitud y Producción
        Svc->>DB: findOne(SolicitudSalida, boleta.solicitudSalidaId)
        DB-->>Svc: SolicitudSalida (items de solicitud)
        Svc->>Prod: GET /ordenes/:ordenId y GET /lotes/orden/:ordenCodigo
        alt Ítems no corresponden a la solicitud o a lotes de la orden
            Prod-->>Svc: Lotes de orden
            Svc-->>Cliente: 404 Not Found / 502 Bad Gateway
        else Referencias comprobadas
            Prod-->>Svc: 200 OK (orden y lotes confirmados)

            %% Transacción atómica en Base de Datos
            Svc->>DB: dataSource.transaction()
            Note over Svc,DB: BEGIN TRANSACTION
            Svc->>DB: DELETE FROM boletas_envio_items WHERE boleta_id = :id
            Svc->>DB: INSERT INTO boletas_envio_items (boleta_id, referencia, cantidad) VALUES (...)
            alt Falla en persistencia (violación de restricción / caída de BD)
                DB-->>Svc: Error de base de datos
                Note over Svc,DB: ROLLBACK TRANSACTION (se conservan ítems originales)
                Svc-->>Cliente: 500 / Error propagado sin cambios parciales
            else Persistencia exitosa
                DB-->>Svc: Nuevos registros persistidos
                Note over Svc,DB: COMMIT TRANSACTION
                Svc-->>Ctrl: BoletaEnvio con nuevos ítems (estado BORRADOR)
                Ctrl-->>Cliente: 200 OK (BoletaEnvio actualizada)
            end
        end
    end
```

---

## 4. Garantía de atomicidad e integridad

1. **Reemplazo atómico:** Al ejecutarse dentro de un bloque `dataSource.transaction`, el borrado de las filas anteriores y la inserción de las nuevas filas se confirman o se descartan en una sola unidad lógica de trabajo.
2. **Sin filas parciales ni huérfanas:** Si cualquiera de los nuevos ítems falla en validación de base de datos (`ck_boleta_envio_item_cantidad`, `ck_boleta_envio_item_referencia`), el motor PostgreSQL revierte automáticamente el `DELETE`, dejando los ítems precedentes sin ninguna alteración.
3. **Consistencia con saldo documental:** Dado que la boleta se mantiene en `BORRADOR`, las cantidades editadas no impactan el saldo disponible calculado por `DisponibilidadDocumentalService`, el cual descuenta exclusivamente boletas con estado `EMITIDA`.
