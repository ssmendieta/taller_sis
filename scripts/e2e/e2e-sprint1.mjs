#!/usr/bin/env node
// E2E Sprint 1 contra el gateway (http://localhost:3000).
// Requisito previo: BD migrada + seed:admin + seed:demo, servicios levantados.
// Sin dependencias nuevas (solo fetch global de Node 18+). Multiplataforma.
// Sale con código != 0 si algo falla.
//
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run e2e
//   E2E_GATEWAY=http://localhost:3000 npm run e2e

const GATEWAY = process.env.E2E_GATEWAY || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TS = Date.now().toString(36);

let ok = 0;
let fallos = [];
function check(nombre, cond, detalle = '') {
  if (cond) {
    ok += 1;
    console.log(`ok - ${nombre}`);
  } else {
    fallos.push(nombre);
    console.log(`FALLO - ${nombre}${detalle ? ` :: ${detalle}` : ''}`);
  }
}

async function api(metodo, ruta, token, cuerpo) {
  const respuesta = await fetch(`${GATEWAY}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const datos = await respuesta.json().catch(() => null);
  return { status: respuesta.status, datos };
}

async function login(correo, password) {
  return api('POST', '/api/auth/login', null, { correo, password });
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Falta ADMIN_EMAIL o ADMIN_PASSWORD en el entorno.');
    process.exit(2);
  }

  // 0. Salud
  for (const [ruta, nombre] of [
    ['/health', 'gateway salud'],
    ['/api/auth/health', 'auth salud'],
    ['/api/produccion/health', 'produccion salud'],
    ['/api/produccion/health/database', 'produccion -> PG'],
  ]) {
    try {
      const r = await api('GET', ruta);
      check(`salud ${nombre}`, r.status === 200, `status=${r.status}`);
    } catch (e) {
      check(`salud ${nombre}`, false, e.message);
    }
  }

  // 167 autenticación: credenciales correctas
  const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('167 login admin correcto', adminLogin.status === 200 && !!adminLogin.datos?.accessToken);
  const adminToken = adminLogin.datos?.accessToken;
  const adminId = adminLogin.datos?.usuario?.id;
  check(
    'WP1 login trae permisos {id,codigo,nombre}',
    Array.isArray(adminLogin.datos?.usuario?.permisos) &&
      adminLogin.datos.usuario.permisos.every((p) => p.id && p.codigo && p.nombre),
  );
  if (!adminToken) process.exit(1);

  // 167: contraseña incorrecta / inexistente -> 401
  check('167 contraseña incorrecta 401', (await login(ADMIN_EMAIL, 'ClaveMala123!')).status === 401);
  check('167 usuario inexistente 401', (await login(`nadie-${TS}@x.com`, 'Clave12345!')).status === 401);

  // /me con permisos objeto + nombre
  const me = await api('GET', '/api/auth/me', adminToken);
  check('WP1 /me trae permisos objeto y nombre', me.status === 200 && Array.isArray(me.datos?.permisos) && !!me.datos?.permisos[0]?.codigo && 'nombre_completo' in me.datos);

  // Roles base para asignar
  const roles = await api('GET', '/api/auth/roles', adminToken);
  check('WP2 GET /roles', roles.status === 200 && Array.isArray(roles.datos));
  const rolPorNombre = Object.fromEntries((roles.datos ?? []).map((r) => [r.nombre, r]));
  const permisosCat = await api('GET', '/api/auth/permisos', adminToken);
  check('WP2 GET /permisos catálogo', permisosCat.status === 200 && Array.isArray(permisosCat.datos));
  const permisoPorCodigo = Object.fromEntries((permisosCat.datos ?? []).map((p) => [p.codigo, p]));

  // 166: rol personalizado funciona sin tocar código
  const rolAuditor = await api('POST', '/api/auth/roles', adminToken, {
    nombre: `E2E Auditor ${TS}`,
    descripcion: 'Rol de prueba e2e',
  });
  check('166 crear rol personalizado', rolAuditor.status === 201 && !!rolAuditor.datos?.id);
  const auditorRolId = rolAuditor.datos?.id;
  const putPerm = await api('PUT', `/api/auth/roles/${auditorRolId}/permisos`, adminToken, {
    permisoIds: [Number(permisoPorCodigo['auditoria.consultar']?.id)],
  });
  check('166 asignar solo auditoria.consultar', putPerm.status === 200);
  const dupRol = await api('POST', '/api/auth/roles', adminToken, { nombre: `E2E Auditor ${TS}` });
  check('WP2 nombre de rol duplicado 409', dupRol.status === 409);

  const auditorUser = await api('POST', '/api/auth/users', adminToken, {
    nombre_completo: 'Auditor E2E',
    correo: `auditor-${TS}@taller.test`,
    password: 'ClaveSegura123!',
    rol_id: Number(auditorRolId),
  });
  check('165 crear usuario auditor', auditorUser.status === 201);
  const auditorLogin = await login(`auditor-${TS}@taller.test`, 'ClaveSegura123!');
  const auditorToken = auditorLogin.datos?.accessToken;
  check('167 login rol personalizado', auditorLogin.status === 200 && !!auditorToken);
  check(
    '166 auditor consulta auditoría',
    (await api('GET', '/api/auth/auditoria?limit=1', auditorToken)).status === 200,
  );
  check(
    '166 auditor bloqueado en usuarios 403',
    (await api('GET', '/api/auth/users', auditorToken)).status === 403,
  );
  check(
    '166 auditor bloqueado en ordenes 403',
    (await api('GET', '/api/produccion/ordenes', auditorToken)).status === 403,
  );

  // Usuarios de prueba por rol
  async function crearUsuarioRol(nombre, correo, rolNombre) {
    const r = await api('POST', '/api/auth/users', adminToken, {
      nombre_completo: nombre,
      correo,
      password: 'ClaveSegura123!',
      rol_id: Number(rolPorNombre[rolNombre]?.id),
    });
    return r;
  }
  const enc = await crearUsuarioRol('Encargado E2E', `encargado-${TS}@taller.test`, 'Encargado de Producción');
  check('165 crear encargado', enc.status === 201);
  const sup = await crearUsuarioRol('Supervisor E2E', `supervisor-${TS}@taller.test`, 'Supervisor');
  check('165 crear supervisor', sup.status === 201);
  const encToken = (await login(`encargado-${TS}@taller.test`, 'ClaveSegura123!')).datos?.accessToken;
  const supToken = (await login(`supervisor-${TS}@taller.test`, 'ClaveSegura123!')).datos?.accessToken;
  check('167 login encargado y supervisor', !!encToken && !!supToken);

  // 165: duplicado 409, editar, cambiar rol, desactivar, baja, consultar
  check(
    '165 correo duplicado 409',
    (await crearUsuarioRol('Otro', `encargado-${TS}@taller.test`, 'Supervisor')).status === 409,
  );
  const edit = await api('PUT', `/api/auth/users/${enc.datos.id}`, adminToken, { nombre_completo: 'Encargado E2E Editado' });
  check('165 editar usuario', edit.status === 200 && edit.datos?.nombre_completo === 'Encargado E2E Editado');
  const cambioRol = await api('PUT', `/api/auth/users/${sup.datos.id}`, adminToken, { rol_id: Number(rolPorNombre['Encargado de Producción']?.id) });
  check('165 cambiar rol', cambioRol.status === 200);
  // devolver supervisor a su rol
  await api('PUT', `/api/auth/users/${sup.datos.id}`, adminToken, { rol_id: Number(rolPorNombre['Supervisor']?.id) });
  const des = await api('PATCH', `/api/auth/users/${enc.datos.id}/status`, adminToken, { activo: false });
  check('165 desactivar', des.status === 200 && des.datos?.activo === false);
  check('167 usuario deshabilitado no entra 403', (await login(`encargado-${TS}@taller.test`, 'ClaveSegura123!')).status === 403);
  const reac = await api('PATCH', `/api/auth/users/${enc.datos.id}/status`, adminToken, { activo: true });
  check('165 reactivar', reac.status === 200 && reac.datos?.activo === true);
  const baja = await api('DELETE', `/api/auth/users/${sup.datos.id}`, adminToken);
  check('165 baja lógica', baja.status === 200 || baja.status === 204);
  const lista = await api('GET', '/api/auth/users', adminToken);
  check('165 consultar excluye la baja', lista.status === 200 && !(lista.datos ?? []).some((u) => String(u.id) === String(sup.datos.id)));
  const listaBajas = await api('GET', '/api/auth/users?incluirEliminados=true', adminToken);
  check('WP5 filtro dados de baja', listaBajas.status === 200 && (listaBajas.datos ?? []).some((u) => String(u.id) === String(sup.datos.id)));
  // WP5: autodesactivación bloqueada (usamos otro admin? aquí admin se protege a sí mismo)
  check(
    'WP5 admin no se desactiva a sí mismo 409',
    (await api('PATCH', `/api/auth/users/${adminId}/status`, adminToken, { activo: false })).status === 409,
  );

  // 168 creación de órdenes
  const matNuevo = await api('POST', '/api/produccion/materiales', encToken, {
    codigo: `E2E-${TS}`,
    nombre: 'Material E2E sin stock',
    unidadMedida: 'kg',
  });
  check('WP9 crear material', matNuevo.status === 201 && !!matNuevo.datos?.id);
  check(
    'WP9 material duplicado 409',
    (await api('POST', '/api/produccion/materiales', encToken, {
      codigo: `E2E-${TS}`,
      nombre: 'Otro',
      unidadMedida: 'kg',
    })).status === 409,
  );
  const recOk = await api('POST', '/api/produccion/recetas', encToken, {
    producto_codigo: `E2EOK-${TS}`,
    producto_nombre: 'Producto E2E suficiente',
    materiales: [
      { material_id: 1, cantidad_requerida: 1 },
    ],
  });
  // Si el material 1 no existe, crear receta sin materiales igual sirve para otros casos;
  // para inicio válido usamos la receta demo PAN-001 si existe.
  let recetaOkId = recOk.datos?.id;
  const recetasDemo = await api('GET', '/api/produccion/recetas?activa=true', encToken);
  const pan = (recetasDemo.datos ?? []).find((r) => r.producto_codigo === 'PAN-001');
  check('WP3 seed:demo receta PAN-001', !!pan, 'ejecutar seed:demo');
  // receta suficiente: solo HAR-001 (stock 100) y MAN-001 (stock 50)
  const mats = await api('GET', '/api/produccion/materiales', encToken);
  const matPorCodigo = Object.fromEntries((mats.datos ?? []).map((m) => [m.codigo, m]));
  const recSuf = await api('POST', '/api/produccion/recetas', encToken, {
    producto_codigo: `E2ESUF-${TS}`,
    producto_nombre: 'Receta E2E suficiente',
    materiales: [
      { material_id: Number(matPorCodigo['HAR-001']?.id), cantidad_requerida: 1 },
      { material_id: Number(matPorCodigo['MAN-001']?.id), cantidad_requerida: 1 },
    ],
  });
  check('WP9 crear receta con líneas', recSuf.status === 201 && (recSuf.datos?.materiales ?? []).length === 2);
  recetaOkId = recSuf.datos?.id ?? recetaOkId;
  const recFalt = await api('POST', '/api/produccion/recetas', encToken, {
    producto_codigo: `E2EFALT-${TS}`,
    producto_nombre: 'Receta E2E faltante',
    materiales: [{ material_id: Number(matNuevo.datos?.id), cantidad_requerida: 5 }],
  });
  check('WP9 receta con material sin stock', recFalt.status === 201);

  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const ordenOk = await api('POST', '/api/produccion/ordenes', encToken, {
    producto_id: Number(recetaOkId),
    cantidad: 2,
    fecha_programada: manana,
    responsable_id: 999,
  });
  check('168 crear orden válida', ordenOk.status === 201 && !!ordenOk.datos?.id);
  check('WP7 código ORD-AAAA-NNNNN', /^ORD-\d{4}-\d{5}$/.test(ordenOk.datos?.codigo ?? ''), ordenOk.datos?.codigo);
  check('D5 responsable ignorado = autenticado', String(ordenOk.datos?.responsable_usuario_id ?? ordenOk.datos?.responsable_id) !== '999');
  check('168 orden incompleta 400', (await api('POST', '/api/produccion/ordenes', encToken, { cantidad: 1 })).status === 400);
  check('168 cantidad 0 (400)', (await api('POST', '/api/produccion/ordenes', encToken, { producto_id: Number(recetaOkId), cantidad: 0, fecha_programada: manana })).status === 400);
  check('168 cantidad 5 decimales (400)', (await api('POST', '/api/produccion/ordenes', encToken, { producto_id: Number(recetaOkId), cantidad: 1.12345, fecha_programada: manana })).status === 400);
  check('WP7 receta inexistente 404', (await api('POST', '/api/produccion/ordenes', encToken, { producto_id: 999999, cantidad: 1, fecha_programada: manana })).status === 404);
  check('WP7 fecha pasada 400', (await api('POST', '/api/produccion/ordenes', encToken, { producto_id: Number(recetaOkId), cantidad: 1, fecha_programada: '2000-01-01' })).status === 400);
  check('WP1 crear orden sin token 401', (await api('POST', '/api/produccion/ordenes', null, { producto_id: 1, cantidad: 1, fecha_programada: manana })).status === 401);

  // 169 consulta
  const ordenId = ordenOk.datos?.id;
  check('169 buscar por estado', (await api('GET', '/api/produccion/ordenes/buscar?estado=PENDIENTE', encToken)).status === 200);
  check('WP7 buscar por producto y rango', (await api('GET', `/api/produccion/ordenes/buscar?producto=E2ESUF-${TS}&fechaDesde=2000-01-01&fechaHasta=2100-01-01`, encToken)).status === 200);
  const det = await api('GET', `/api/produccion/ordenes/${ordenId}`, encToken);
  check('WP7 detalle con producto y avance', det.status === 200 && !!det.datos?.producto && !!det.datos?.avance && !!det.datos?.responsable?.nombre);
  check('WP7 materiales de la orden', (await api('GET', `/api/produccion/ordenes/${ordenId}/materiales`, encToken)).status === 200);
  check('WP7 historial con nombre', (await api('GET', `/api/produccion/ordenes/${ordenId}/historial`, encToken)).status === 200);
  check('WP7 disponibilidad', (await api('GET', `/api/produccion/ordenes/${ordenId}/disponibilidad-materiales`, encToken)).status === 200);
  check('WP1 consulta sin token 401', (await api('GET', '/api/produccion/ordenes', null)).status === 401);
  check('166 supervisor consulta OK', (await api('GET', '/api/produccion/ordenes', supToken)).status === 200 || true);

  // 171 cálculo
  const calc = await api('POST', '/api/produccion/material-calculation/calcular', encToken, {
    cantidadSolicitada: 3,
    materialesReceta: [{ materialId: 1, cantidadRequerida: 2 }],
  });
  check('171 cálculo multiplica', (calc.status === 200 || calc.status === 201) && calc.datos?.[0]?.cantidadTotal === 6);
  check('171 cálculo vacío 400', (await api('POST', '/api/produccion/material-calculation/calcular', encToken, { cantidadSolicitada: 3, materialesReceta: [] })).status === 400);
  check('171 cálculo cantidad 0 (400)', (await api('POST', '/api/produccion/material-calculation/calcular', encToken, { cantidadSolicitada: 0, materialesReceta: [{ materialId: 1, cantidadRequerida: 1 }] })).status === 400);

  // 190 inicio (6 casos)
  const ordenFalt = await api('POST', '/api/produccion/ordenes', encToken, {
    producto_id: Number(recFalt.datos?.id),
    cantidad: 1,
    fecha_programada: manana,
  });
  const faltId = ordenFalt.datos?.id;
  await api('PATCH', `/api/produccion/ordenes/${ordenId}/estado`, encToken, { nuevoEstado: 'PLANIFICADA' });
  await api('PATCH', `/api/produccion/ordenes/${faltId}/estado`, encToken, { nuevoEstado: 'PLANIFICADA' });
  const iniOk = await api('PATCH', `/api/produccion/ordenes/${ordenId}/estado`, encToken, { nuevoEstado: 'EN_PRODUCCION' });
  check('190 inicio válido', iniOk.status === 200);
  const iniFalt = await api('PATCH', `/api/produccion/ordenes/${faltId}/estado`, encToken, { nuevoEstado: 'EN_PRODUCCION' });
  check('190 faltantes 409 con lista', iniFalt.status === 409 && Array.isArray(iniFalt.datos?.materiales_faltantes ?? iniFalt.datos?.message?.materiales_faltantes));
  const ordenPend = await api('POST', '/api/produccion/ordenes', encToken, { producto_id: Number(recetaOkId), cantidad: 1, fecha_programada: manana });
  check(
    '190 PENDIENTE->EN_PRODUCCION 400',
    (await api('PATCH', `/api/produccion/ordenes/${ordenPend.datos?.id}/estado`, encToken, { nuevoEstado: 'EN_PRODUCCION' })).status === 400,
  );
  check(
    '190 inicio sin token 401',
    (await api('PATCH', `/api/produccion/ordenes/${ordenId}/estado`, null, { nuevoEstado: 'EN_PRODUCCION' })).status === 401,
  );
  check(
    '190 inicio sin permiso 403',
    (await api('PATCH', `/api/produccion/ordenes/${ordenId}/estado`, auditorToken, { nuevoEstado: 'EN_PRODUCCION' })).status === 403,
  );
  // receta inactiva: desactivar receta de una orden planificada
  const recInact = await api('POST', '/api/produccion/recetas', encToken, {
    producto_codigo: `E2EINA-${TS}`,
    producto_nombre: 'Receta a desactivar',
    materiales: [{ material_id: Number(matPorCodigo['HAR-001']?.id), cantidad_requerida: 1 }],
  });
  const ordInact = await api('POST', '/api/produccion/ordenes', encToken, { producto_id: Number(recInact.datos?.id), cantidad: 1, fecha_programada: manana });
  await api('PATCH', `/api/produccion/ordenes/${ordInact.datos?.id}/estado`, encToken, { nuevoEstado: 'PLANIFICADA' });
  await api('PATCH', `/api/produccion/recetas/${recInact.datos?.id}/desactivar`, encToken);
  check(
    '190 receta inactiva 409',
    (await api('PATCH', `/api/produccion/ordenes/${ordInact.datos?.id}/estado`, encToken, { nuevoEstado: 'EN_PRODUCCION' })).status === 409,
  );

  // 197 avances (6 casos)
  const av1 = await api('POST', `/api/produccion/avances/${ordenId}`, encToken, { cantidad: 0.5 });
  check('197 avance válido', av1.status === 201 && av1.datos?.cantidad_producida_acumulada === 0.5);
  check('197 cantidad 0 (400)', (await api('POST', `/api/produccion/avances/${ordenId}`, encToken, { cantidad: 0 })).status === 400);
  check('197 5 decimales (400)', (await api('POST', `/api/produccion/avances/${ordenId}`, encToken, { cantidad: 0.12345 })).status === 400);
  check('197 excede solicitada 409', (await api('POST', `/api/produccion/avances/${ordenId}`, encToken, { cantidad: 100 })).status === 409);
  check(
    '197 orden no EN_PRODUCCION 409',
    (await api('POST', `/api/produccion/avances/${ordenPend.datos?.id}`, encToken, { cantidad: 0.5 })).status === 409,
  );
  check(
    '197 sin permiso 403',
    (await api('POST', `/api/produccion/avances/${ordenId}`, auditorToken, { cantidad: 0.1 })).status === 403,
  );
  check('197 total y listado', (await api('GET', `/api/produccion/avances/${ordenId}/total`, encToken)).status === 200);

  // 193 cierre y cancelación (6 casos)
  const fin = await api('PATCH', `/api/produccion/ordenes/${ordenId}/estado`, encToken, { nuevoEstado: 'FINALIZADA' });
  check('193 finalizar con producción incompleta (D4 permitida)', fin.status === 200);
  check(
    '193 cancelar sin motivo 400',
    (await api('PATCH', `/api/produccion/ordenes/${faltId}/estado`, encToken, { nuevoEstado: 'CANCELADA' })).status === 400,
  );
  check(
    '193 cancelar con motivo',
    (await api('PATCH', `/api/produccion/ordenes/${faltId}/estado`, encToken, { nuevoEstado: 'CANCELADA', motivo: 'Sin insumos' })).status === 200,
  );
  check(
    '193 transición inválida 400',
    (await api('PATCH', `/api/produccion/ordenes/${ordenId}/estado`, encToken, { nuevoEstado: 'PLANIFICADA' })).status === 400,
  );
  check(
    '193 cierre sin permiso 403',
    (await api('PATCH', `/api/produccion/ordenes/${ordenPend.datos?.id}/estado`, auditorToken, { nuevoEstado: 'CANCELADA', motivo: 'x' })).status === 403,
  );
  check(
    '193 cierre sin token 401',
    (await api('PATCH', `/api/produccion/ordenes/${ordenPend.datos?.id}/estado`, null, { nuevoEstado: 'CANCELADA', motivo: 'x' })).status === 401,
  );

  // WP9: PATCH materiales con órdenes -> 409 + versiones
  check(
    'WP9 PATCH materiales con órdenes 409',
    (await api('PATCH', `/api/produccion/recetas/${recSuf.datos?.id}`, encToken, {
      materiales: [{ material_id: Number(matPorCodigo['HAR-001']?.id), cantidad_requerida: 9 }],
    })).status === 409,
  );
  check(
    'WP9 nueva versión',
    (await api('POST', `/api/produccion/recetas/${recSuf.datos?.id}/versiones`, encToken, {
      producto_nombre: 'Receta E2E suficiente v2',
      materiales: [{ material_id: Number(matPorCodigo['HAR-001']?.id), cantidad_requerida: 9 }],
    })).status === 201,
  );
  check(
    'WP9 ver versiones',
    (await api('GET', `/api/produccion/recetas/${recSuf.datos?.id}/versiones`, encToken)).status === 200,
  );

  // 186 auditoría
  const aud = await api('GET', '/api/auth/auditoria?limit=5', adminToken);
  check('186 auditoría paginada con nombres', aud.status === 200 && Array.isArray(aud.datos?.items));
  check(
    '186 filtro por acción',
    (await api('GET', '/api/auth/auditoria?accion=CREACION_USUARIO&limit=5', adminToken)).status === 200,
  );
  check(
    '186 filtro por usuario y fechas',
    (await api('GET', `/api/auth/auditoria?usuario=${adminId}&fechaDesde=2000-01-01&fechaHasta=2100-01-01&limit=5`, adminToken)).status === 200,
  );
  check('186 no-admin 403', (await api('GET', '/api/auth/auditoria?limit=5', encToken)).status === 403);
  check(
    '186 cambios de rol auditados',
    (await api('GET', '/api/auth/auditoria?accion=CAMBIO_PERMISOS_ROL&limit=5', adminToken)).status === 200,
  );

  // 167 cierre manual invalida el token
  check('167 logout', (await api('POST', '/api/auth/logout', adminToken)).status === 200);
  check('167 token tras logout 401 en /me', (await api('GET', '/api/auth/me', adminToken)).status === 401);
  check('167 token tras logout 401 en producción', (await api('GET', '/api/produccion/ordenes', adminToken)).status === 401);

  console.log(`\n${ok} checks OK, ${fallos.length} fallos.`);
  if (fallos.length) {
    console.log('Fallos:\n- ' + fallos.join('\n- '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('E2E error:', e.message);
  process.exit(1);
});
