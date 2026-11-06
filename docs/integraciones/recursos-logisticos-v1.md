# Contrato ERP–Logística: recursos logísticos v1

HU ABC-115 (consultar vehículos y choferes del ERP), subtarea ABC-350. Define la
consulta de recursos externos que Logística usará para planificar rutas. El
código del contrato está en
[`recursos-logisticos-v1.ts`](../../services/logistica-service/src/recursos-externos/dto/recursos-logisticos-v1.ts)
y su validación en
[`recursos-logisticos-v1.validator.ts`](../../services/logistica-service/src/recursos-externos/dto/recursos-logisticos-v1.validator.ts).

## Estado y contraparte

- **Versión:** `recursos-logisticos.v1`.
- **ERP real:** el repositorio no tiene endpoint, credenciales ni documentación de
  un ERP de recursos. Este contrato es la **propuesta v1 de Logística** y queda
  pendiente de confirmación por quien opere el ERP.
- **Simulador:** mientras no exista el ERP, se usará un simulador HTTP
  independiente que cumpla este contrato. Ruta propuesta:
  `simuladores/erp-recursos/`, a construir en otra subtarea de ABC-115 con el
  mismo criterio de `simuladores/inventarios` y `simuladores/contabilidad`. Las
  pruebas contra el simulador deben identificarse como simuladas.
- **Ids externos:** coinciden con `rutas.vehiculo_externo_id` y
  `rutas.chofer_externo_id` (texto de hasta 80 caracteres, por ejemplo `VEH-01` y
  `CHO-12`). La validación de solapamiento y capacidad de rutas es ABC-371.

## Endpoint

Consulta síncrona REST (no usa Pub/Sub):

```http
GET {ERP_RECURSOS_URL}/v1/recursos-logisticos?fecha=2026-11-10
Authorization: Bearer <token del ERP>
Accept: application/json
```

| Parámetro | Obligatorio | Regla |
| --- | --- | --- |
| `fecha` | Sí | Día de planificación `AAAA-MM-DD`. La disponibilidad se refiere a ese día. |

El ERP devuelve **todos** los vehículos y choferes de esa fecha. Los filtros de
capacidad y disponibilidad (CA-02) los aplica Logística sobre la copia guardada;
así la copia de una fecha siempre está completa y no hay copias parciales.

### Configuración (sin credenciales en el repositorio)

| Variable | Uso |
| --- | --- |
| `ERP_RECURSOS_URL` | URL base del ERP o del simulador. |
| `ERP_RECURSOS_TOKEN` | Token Bearer. Solo en `.env` o en secretos de Docker; nunca en logs, documentos ni ejemplos. |
| `ERP_RECURSOS_TIMEOUT_MS` | Tiempo máximo de espera por intento (conexión y cuerpo). Valor por defecto: **3000 ms** (`TIMEOUT_ERP_RECURSOS_MS`); entre 100 y 30000. |
| `ERP_RECURSOS_REINTENTOS` | Reintentos para fallos transitorios. Por defecto 2; entre 0 y 3. |
| `ERP_RECURSOS_ESPERA_REINTENTO_MS` | Espera antes del primer reintento; se duplica en cada uno (200, 400 ms). Por defecto 200; entre 0 y 5000. |

El cliente
[`erp-recursos.client.ts`](../../services/logistica-service/src/recursos-externos/clientes/erp-recursos.client.ts)
(ABC-351) solo reintenta `TIMEOUT` y `NO_DISPONIBLE`. `CREDENCIALES`,
`SOLICITUD_RECHAZADA` y `RESPUESTA_INVALIDA` fallan en el primer intento. Sin
`ERP_RECURSOS_URL` responde `NO_DISPONIBLE`, y sin `ERP_RECURSOS_TOKEN` responde
`CREDENCIALES`, sin llamar al ERP.

## Respuesta correcta (200)

```json
{
  "version": "recursos-logisticos.v1",
  "fecha": "2026-11-10",
  "generadoEn": "2026-11-09T21:00:00.000Z",
  "vehiculos": [
    {
      "idExterno": "VEH-01",
      "placa": "2345-ABC",
      "descripcion": "Camión furgón",
      "capacidad": { "valor": "1500.0000", "unidad": "kg" },
      "disponible": true
    },
    {
      "idExterno": "VEH-02",
      "placa": "3456-BCD",
      "descripcion": null,
      "capacidad": { "valor": "800.0000", "unidad": "kg" },
      "disponible": false
    }
  ],
  "choferes": [
    { "idExterno": "CHO-12", "nombre": "Juan Pérez", "licenciaCategoria": "C", "disponible": true },
    { "idExterno": "CHO-07", "nombre": "Ana Rojas", "licenciaCategoria": null, "disponible": false }
  ]
}
```

### Campos

| Campo | Tipo | Regla |
| --- | --- | --- |
| `version` | texto | Exactamente `recursos-logisticos.v1`. |
| `fecha` | texto | `AAAA-MM-DD` válida e **igual a la fecha consultada**. |
| `generadoEn` | texto | Fecha y hora ISO 8601 en que el ERP generó la respuesta. |
| `vehiculos[].idExterno` | texto | 1 a 80 caracteres, sin espacios al inicio o al final, **único** en la lista. |
| `vehiculos[].placa` | texto | 1 a 20 caracteres, sin espacios al inicio o al final. |
| `vehiculos[].descripcion` | texto o `null` | Hasta 120 caracteres. Si falta, se toma `null`. |
| `vehiculos[].capacidad.valor` | texto decimal | Mayor que 0, hasta 4 decimales, máximo `9999999999.9999`. Se envía como texto para no perder precisión. |
| `vehiculos[].capacidad.unidad` | texto | Una de `kg`, `l`, `m3`, `unidad`, `caja`, `paquete`. |
| `vehiculos[].disponible` | booleano | `true` o `false`; nunca texto. |
| `choferes[].idExterno` | texto | Igual que en vehículos; único en la lista de choferes. |
| `choferes[].nombre` | texto | 1 a 150 caracteres, sin espacios al inicio o al final. |
| `choferes[].licenciaCategoria` | texto o `null` | Hasta 10 caracteres. |
| `choferes[].disponible` | booleano | `true` o `false`. |

Los campos adicionales que envíe el ERP se ignoran y no se guardan (compatibilidad
hacia adelante). Si **un solo** campo obligatorio no cumple, se rechaza la
respuesta completa: nunca se guarda una copia parcial.

## Disponibilidad y reserva

- `disponible: true` significa que el ERP informa el recurso como utilizable en
  `fecha`, según su estado al momento de `generadoEn`.
- **Consultar no reserva** el recurso en el ERP ni bloquea su uso por otros
  sistemas (CA-05). La asignación a rutas es interna de Logística (ABC-368) y no
  se comunica al ERP en esta versión.
- Un recurso con `disponible: false` se muestra, pero no se ofrece para asignar.

## Capacidad

`compararCapacidad(disponible, requerida)` devuelve `SUFICIENTE`, `INSUFICIENTE`
o `UNIDAD_INCOMPATIBLE`:

- Compara solo la **misma unidad**; no convierte kg a l, m3 o cajas.
- Usa enteros de diezmilésimas: `1500.0000 kg` alcanza para `1500 kg` y no para `1500.0001 kg`.

## Errores y timeout

| Situación en el ERP | Motivo | Qué hace Logística |
| --- | --- | --- |
| No responde en `ERP_RECURSOS_TIMEOUT_MS` | `TIMEOUT` | Usa la copia de respaldo |
| Error de red o HTTP 5xx | `NO_DISPONIBLE` | Usa la copia de respaldo |
| HTTP 401 o 403 | `CREDENCIALES` | Usa la copia de respaldo y registra el error de configuración |
| Otro HTTP 4xx | `SOLICITUD_RECHAZADA` | Usa la copia de respaldo |
| HTTP 200 con cuerpo que no cumple el contrato | `RESPUESTA_INVALIDA` | Usa la copia de respaldo; registra los errores `{ campo, motivo }` |

`ErpRecursosNoDisponibleError` lleva el motivo; `motivoPorEstadoHttp` clasifica el
código HTTP. Los registros nunca incluyen el token.

## Copia de respaldo (CA-03 y CA-04)

1. Solo una respuesta **200 válida** reemplaza la copia guardada de esa fecha, y la
   reemplaza completa, con su `generadoEn` y la hora de sincronización.
2. Un fallo de cualquier motivo **no** modifica la copia anterior.
3. Un recurso se identifica por `idExterno` dentro de su tipo; una respuesta con
   ids repetidos se rechaza, así que la copia nunca tiene duplicados.
4. Si falla el ERP y existe copia, se muestra con su fecha y un aviso de respaldo.
   Si no existe copia, se informa que los recursos no están disponibles.

La copia se usa a través de la interfaz `RespaldoRecursosLogisticos`
([`respaldo-recursos.ts`](../../services/logistica-service/src/recursos-externos/respaldo-recursos.ts)).
Su persistencia corresponde a ABC-352; mientras no exista, no hay copia y un fallo
del ERP responde 503.

## API interna de Logística (ABC-353)

`GET /api/logistica/recursos-logisticos?fecha=AAAA-MM-DD`, con el permiso
`logistica.boletas.consultar`. Filtros opcionales: `disponible=true|false` y
`capacidadMinima` + `unidad` (solo vehículos con capacidad suficiente en la misma
unidad).

- **200:** `fecha`, `origen` (`ERP` o `RESPALDO`), `generadoEn`, `sincronizadoEn`,
  `aviso` (motivo y mensaje, solo con `RESPALDO`), `filtros`, `totales`,
  `vehiculos` y `choferes`.
- **503 `RECURSOS_NO_DISPONIBLES`:** el ERP falló y no hay copia. No incluye listas,
  para que no se lean como "sin recursos".
- Es solo lectura: consultar no reserva recursos. La pantalla está en
  `/logistica/recursos`.

## Versionado

- Cambios **aditivos** (campos opcionales nuevos) se publican dentro de v1.
- Quitar o renombrar campos, cambiar su tipo o agregar unidades que obliguen a
  convertir requiere `recursos-logisticos.v2` y una ruta `/v2/...` nueva.

## Verificación

Desde `services/logistica-service`:

```powershell
npm test -- recursos-externos
```

Las pruebas validan el ejemplo de este documento contra el código, los rechazos de
campos y duplicados, la clasificación de errores y la comparación de capacidad.
No llaman a un ERP real ni a un simulador.
