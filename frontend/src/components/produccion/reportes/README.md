# ABC-337 — Filtros y vista previa del reporte de producción

Ruta `/produccion/reportes`, protegida con `ordenes.consultar`, igual que el
enlace «Reportes de producción» del menú. Consume exclusivamente
`GET /api/produccion/reportes/produccion` mediante `apiConfig.gatewayUrl` y el
token existente en sessionStorage (o localStorage, como otros servicios).

Contrato del backend: [ABC-336](../../../../../services/produccion-service/src/reportes/README.md).

## Comportamiento

- Consulta inicial sin filtros. Solo se envían fechaDesde, fechaHasta y producto;
  los valores vacíos se omiten. Se validan fechas reales, intervalo inclusivo y
  texto del producto de hasta 150 caracteres. El servicio rechaza otros campos.
- `ReportesProduccionPage` separa `edicion`, `aplicados` (última consulta
  intentada) y `reporte` (última respuesta exitosa, incluidos sus filtros
  efectivos). Editar no dispara consultas ni modifica el reporte consultado.
- El reporte anterior permanece visible durante carga o errores recuperables.
  Su encabezado muestra sus filtros efectivos; un aviso indica si difieren de
  los que se están editando. Reintentar usa los últimos filtros aplicados.
- AbortController cancela solicitudes anteriores y al desmontar; un contador
  descarta respuestas y errores antiguos incluso si el transporte ignora abort.
  Cambios de usuario o permiso limpian la consulta y cancelan la carga pendiente.
- La ruta usa ProtectedRoute. La página también comprueba el permiso antes de
  consultar. Un 401 ofrece volver a ingresar, un 403 informa falta de permiso;
  ambos descartan el reporte previo, incluso si se vuelve a intentar la consulta.
  Los errores de red o del servicio permiten reintentar.
- Se muestran el detalle por orden y los totales del servidor, sin recalcular,
  combinar grupos ni convertir cantidades a number. Los strings decimales se
  presentan literalmente, incluidos valores grandes con cuatro decimales.
- Las fechas DATE se presentan separando año, mes y día, sin convertirlas a un
  instante en una zona horaria. Producto admite campos null y los materiales
  se identifican por materialId, sin inventar nombres.
- El texto explica que pérdidas y reprocesos son acumulados actuales aunque las
  cantidades principales y consumos sean de un cierre. Recuperadas y descartadas
  no se suman a producción ni conformes. Se muestra la versión e id del cierre.
- Las tablas permiten desplazamiento horizontal por teclado y usan captions y
  encabezados. Se reutilizan PageHeader y clases ts-panel, ts-filters y ts-table.
- La exportación no se implementa aquí. ABC-338 podrá consumir el objeto `reporte`
  y sus `filtros` efectivos, conservados sin transformación; no debe tomar la
  edición pendiente como descripción de los datos mostrados.

## Validación ejecutada

Desde `frontend`:

```powershell
npm run test:reportes-produccion
npm run test:session
npm run test:demandas
npm run build
```

- 18 pruebas nuevas aprobadas. Montan la página y las rutas reales con React
  Test Renderer/Vite; simulan sesión y fetch. Verifican solicitudes, validación,
  detalle, totales, precisión, fechas, acceso, reintento y concurrencia.
- 5 pruebas de sesión y 10 de demandas aprobadas.
- Compilación Vite correcta sobre la versión integrada de `develop`.

## Comprobar en el navegador

Con el gateway y Producción actualizados y en ejecución, desde `frontend`:

```powershell
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

1. Abrir `http://127.0.0.1:5174/login` e ingresar con una cuenta que tenga
   `ordenes.consultar`. Se usa el gateway configurado con VITE_API_URL o
   VITE_API_GATEWAY_URL; por defecto `http://localhost:3000`.
2. Abrir «Reportes de producción» en el menú o visitar
   `http://127.0.0.1:5174/produccion/reportes`.
3. Comprobar el detalle y los totales del reporte.
   Aplicar fechas y producto, editar sin consultar y verificar el aviso de
   filtros anteriores. Limpiar filtros vuelve a la consulta sin parámetros.
4. Verificar materiales/unidades separados, versión de cierre y decimales
   completos. Un producto inexistente muestra el estado vacío.

Sin el permiso, la ruta muestra Acceso denegado y el enlace no aparece.
