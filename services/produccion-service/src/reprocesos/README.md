# ABC-396 · Registrar y consultar reprocesos

Usar el prefijo `/api/produccion` en el gateway. Ambas rutas requieren Bearer válido.

| Método y ruta | Permiso |
| --- | --- |
| `POST /ordenes/:ordenId/reprocesos` | `calidad.registrar_conformes` |
| `GET /ordenes/:ordenId/reprocesos` | `ordenes.consultar` |

El POST espera `resultadoCalidadId` como string y cantidades numéricas de hasta cuatro decimales.

```json
{
  "resultadoCalidadId": "1",
  "cantidadProcesada": 3,
  "cantidadRecuperada": 2,
  "cantidadDescartada": 1
}
```

Respuesta 201 con `reproceso` (id, ordenId, resultadoCalidadId, cantidades,
autorUsuarioId y fechaHora) y `totales`. El GET devuelve 200 con `items` ordenados
por fecha e id y los mismos `totales`, incluso si el historial está vacío. Ejemplo
de totales cuando había cinco defectuosas y ninguna conforme:

```json
{
  "conformes": "2.0000",
  "defectuosas": "2.0000",
  "procesadas": "3.0000",
  "recuperadas": "2.0000",
  "descartadas": "1.0000"
}
```

400 por datos inválidos o cantidades que no balancean, 404 por orden o resultado
ajeno/inexistente y 409 si el resultado es conforme o el saldo no alcanza.
Auth determina el autor y la base asigna la fecha.

Los resultados iniciales y avances quedan como registros históricos. El saldo
operativo se deriva de ellos y de los movimientos persistidos en `reprocesos`.
El POST bloquea la orden y su resultado defectuoso antes de calcular el saldo e
insertar. El GET lee historial y totales en una misma instantánea. El registro
no modifica cierres versionados ni los totales históricos de producción.

## Verificación

- Compilación Nest y pruebas de Calidad, Reprocesos e Integraciones.
- Integración por gateway con Auth y Producción, migraciones aplicadas en una base
  aislada PGlite. Verificados 401, 403, 400, 404 y 409, y GET/POST autorizados con
  datos persistidos. Dos POST simultáneos contra saldo de cinco devolvieron un
  201 y un 409. La cantidad original y el avance conservaron su valor.
- Las ocho pruebas de Reprocesos, incluida la de persistencia concurrente,
  pasaron con la base aislada y la bandera `REPROCESOS_DB_REAL=1`. El mismo
  comando se puede ejecutar contra PostgreSQL nativo.
