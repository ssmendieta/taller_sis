# Conformes de Producción v1

Contrato interno de lectura entre Logística y Producción para ABC-208 y ABC-209.

## Endpoints

- **Microservicio Producción directo:**
  `GET {PRODUCCION_SERVICE_URL}/calidad/conformes/orden/:ordenId?tipo=CONFORME`
- **Vía API Gateway:**
  `GET /api/produccion/calidad/conformes/orden/:ordenId?tipo=CONFORME`

## Parámetros

- `ordenId` (en la ruta): identificador numérico entero de la orden de producción (ej. `15`). Debe ser un entero positivo válido.
- `tipo` (query parameter opcional): filtro por tipo de resultado de calidad (`CONFORME` o `DEFECTUOSO`). Logística solicita explícitamente `?tipo=CONFORME`. En Producción el valor por defecto es `CONFORME`.

## Autenticación y Autorización

Requiere cabecera HTTP:
`Authorization: Bearer <token>`

El microservicio de Producción valida la sesión con Auth y exige el permiso `ordenes.consultar`.

## Respuesta 200 (OK)

Devuelve un arreglo JSON de registros de resultados de calidad (`ResultadoConforme[]`). Si la orden existe pero no tiene avances o resultados conformes registrados, responde con un arreglo vacío `[]`.

```json
[
  {
    "id": "1",
    "ordenId": "15",
    "cantidad": "30.5000",
    "tipo": "CONFORME",
    "causaDefecto": null,
    "fechaHora": "2026-10-11T15:30:00.000Z",
    "responsableUsuarioId": "42"
  }
]
```

### Tipos de datos y precisión
- `id`, `ordenId`, `responsableUsuarioId`: identificadores `BIGINT` serializados como texto numérico para preservar precisión.
- `cantidad`: cadena decimal con formato exacto de hasta cuatro posiciones decimales (derivada de `NUMERIC(14,4)`).
- `tipo`: enumerador `CONFORME` o `DEFECTUOSO`.
- `causaDefecto`: `null` para resultados conformes (solo se admite texto para defectuosos).
- `fechaHora`: timestamp ISO 8601 en UTC del momento de registro del control de calidad.

## Reglas de Cálculo en Logística (ABC-209)

Logística consume este contrato mediante `LotesProduccionClient.consultarConformesPorOrden` bajo las siguientes reglas:

1. **Aritmética de alta precisión:** Logística no convierte las cantidades a tipo `Number` de JavaScript para evitar imprecisiones de punto flotante (`IEEE-754`). Escala las cadenas a números enteros `BigInt` multiplicando por 10.000 (`unidades * 10000`).
2. **Total conforme:** Corresponde a la suma exacta de los registros devueltos por el endpoint con `tipo=CONFORME`. Si la respuesta es `[]`, el total conforme es `0.0000`.
3. **Total emitido:** Corresponde a la suma persistida de ítems de boletas de envío asociadas a la orden que se encuentren estrictamente en estado `EMITIDA`.
4. **Exclusión estricta de borradores y anuladas:** Las boletas en estado `BORRADOR` o `ANULADA` no descuentan del saldo documental.
5. **Fórmula:**
   `saldoDocumental = totalConforme - totalEmitido`
6. **Manejo de errores:** Si la llamada a Producción falla por timeout (3000 ms), indisponibilidad (503), error de autenticación (401/403) o respuesta con formato inesperado, Logística rechaza la solicitud (`503 Service Unavailable` o `502 Bad Gateway`) y **nunca asume un saldo cero ficticio**.

## Errores HTTP

- `400 Bad Request`: `ordenId` inválido (no entero o menor a 1) o `tipo` de resultado no reconocido.
- `401 Unauthorized`: cabecera `Authorization` ausente, malformada o sesión no válida en Auth.
- `403 Forbidden`: la sesión no cuenta con el permiso `ordenes.consultar`.
- `404 Not Found`: la orden de producción no existe.
- `503 Service Unavailable`: timeout en la conexión interservicio (3 segundos) o Auth no disponible.
