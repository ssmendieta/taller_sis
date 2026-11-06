# Reportes logísticos (ABC-110)

## Datos del reporte (ABC-340)

`GET /reportes/logistica` (vía gateway `/api/logistica/reportes/logistica`),
permiso `logistica.rutas.consultar` (Encargado de Logística y Supervisor), igual
que el historial y el dashboard. La vista previa y los archivos PDF/Excel deben
usar estos mismos filtros y datos (CA-01).

| Parámetro | Regla |
| --- | --- |
| `fechaDesde`, `fechaHasta` | Obligatorios, `AAAA-MM-DD`, inclusive, hasta 366 días |
| `estadoRuta` | Opcional: `PLANIFICADA`, `DESPACHADA`, `COMPLETADA` o `CANCELADA` |
| `estadoBoleta` | Opcional: `BORRADOR`, `EMITIDA` o `ANULADA` |

### Qué entra en el período

- **Rutas:** `fecha_programada` dentro del período (y `estadoRuta`, si se envía).
  Sus paradas, boletas, incidencias y reprogramaciones son las de esas rutas.
- **Boletas:** fecha de creación en hora de La Paz dentro del período (y
  `estadoBoleta`, si se envía).

### Definiciones

| Dato | Regla |
| --- | --- |
| Entrega | Una parada: `ENTREGADA`, `PENDIENTE` o `ANULADA` |
| Boleta entregada | Está en una parada `ENTREGADA` de una ruta no cancelada **y sigue `EMITIDA`**. Una boleta anulada nunca cuenta como entregada (CA-02) |
| Resumen de entregas | Suma de las rutas del período **sin** las canceladas (sus paradas no están pendientes) |
| Ruta de una boleta | La ruta no cancelada más reciente que la contiene; si solo estuvo en canceladas, la más reciente |
| Cantidad | Suma de los ítems de cada boleta, en la unidad del producto de su orden (Producción). El resumen suma solo boletas `EMITIDA`, por unidad y sin convertir; `desconocida` si Producción no la informa |

### Totales sin duplicar (CA-03)

No se une boletas con ítems ni rutas con incidencias en una misma consulta: los
ítems se agrupan por boleta y las incidencias por ruta en SQL, y el resto se
cuenta en `reporte-logistico.ts` con conjuntos de ids. Todas las lecturas van en
una transacción `REPEATABLE READ`.

Si Producción no responde, el reporte se entrega igual con las unidades como
desconocidas y un mensaje en `avisos`.

### Respuesta

`filtros`, `generadoEn` (ISO), `resumen` (rutas por estado, entregas,
incidencias por tipo, reprogramaciones y boletas por estado con cantidades por
unidad), `rutas[]`, `boletas[]` y `avisos[]`. Los tipos están en
`dto/reporte-logistico.dto.ts`.
