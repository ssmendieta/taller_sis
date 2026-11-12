import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { DespachoService } from '../despacho/despacho.service';
import { OutboxEventosDespacho } from '../integraciones/outbox/outbox-eventos-despacho';
import { repararProductoHistorico } from './reparar-producto-historico';

const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-385: reparación local de metadatos históricos', () => {
  const schema = `abc385_reparacion_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let creado = false;
  let numero = 0;
  const orden = { id: '7', codigo: 'ORD-7', producto_id: '3', producto: { codigo: 'P-3', unidad_producto: 'kg' } };
  const produccion = { consultarOrdenPorId: jest.fn(async () => orden) };
  const reparar = (ids: string[], aplicar = false, actor = '42') =>
    repararProductoHistorico(source, produccion, ids, actor, 'Bearer prueba-local', aplicar);
  const fila = async (id: string) => (await source.query('SELECT * FROM boletas_envio WHERE id=$1', [id]))[0];

  beforeAll(async () => {
    source = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions), schema,
      extra: { options: `-c search_path=${schema}` } });
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    creado = true;
    await source.runMigrations({ transaction: 'all' });
  }, 30000);
  afterAll(async () => {
    if (!source?.isInitialized) return;
    try { if (creado) await source.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await source.destroy(); }
  });
  beforeEach(() => { produccion.consultarOrdenPorId.mockReset().mockResolvedValue(orden); });

  async function boleta(codigo: string | null = null, unidad: string | null = null) {
    const [s] = await source.query(`INSERT INTO solicitudes_salida
      (orden_id,destino_documental,motivo,responsable_usuario_id)
      VALUES (7,'Destino','Prueba reparación',42) RETURNING id::text`);
    const [b] = await source.query(`INSERT INTO boletas_envio
      (solicitud_salida_id,numero,estado,responsable_usuario_id,producto_codigo,unidad)
      VALUES ($1,$2,'EMITIDA',42,$3,$4) RETURNING id::text`, [s.id, `REP-${++numero}`, codigo, unidad]);
    await source.query('INSERT INTO boletas_envio_items (boleta_id,referencia,cantidad) VALUES ($1,\'L-7\',2.1250)', [b.id]);
    return b.id as string;
  }
  async function ruta(id: string) {
    const [r] = await source.query(`INSERT INTO rutas
      (fecha_programada,vehiculo_externo_id,chofer_externo_id,responsable_usuario_id)
      VALUES ('2026-11-12','V-1','C-1',42) RETURNING id::text`);
    const [p] = await source.query(`INSERT INTO rutas_paradas (ruta_id,secuencia,destino)
      VALUES ($1,1,'Destino') RETURNING id::text`, [r.id]);
    await source.query('INSERT INTO rutas_paradas_boletas (parada_id,boleta_id) VALUES ($1,$2)', [p.id,id]);
    return r.id as string;
  }

  it('revisión por defecto no modifica datos ni historial', async () => {
    const id = await boleta(); const antes = await fila(id);
    expect(await reparar([id])).toMatchObject({ modo: 'REVISION', modificadas: 0,
      plan: [{ boletaId: id, ordenId: '7', nuevo: { productoCodigo: 'P-3', unidad: 'kg' } }] });
    expect(await fila(id)).toEqual(antes);
    expect(await source.query('SELECT * FROM boletas_envio_historial WHERE boleta_id=$1', [id])).toEqual([]);
    expect(produccion.consultarOrdenPorId).toHaveBeenCalledWith('7', 'Bearer prueba-local');
  });
  it('completa solo nulos, conserva documento e ítems, registra actor y es idempotente', async () => {
    const id = await boleta('P-3'); const antes = await fila(id);
    const items = await source.query('SELECT * FROM boletas_envio_items WHERE boleta_id=$1', [id]);
    expect((await reparar([id], true)).modificadas).toBe(1);
    const despues = await fila(id);
    expect(despues).toEqual({ ...antes, unidad: 'kg', actualizado_en: despues.actualizado_en });
    expect(await source.query('SELECT * FROM boletas_envio_items WHERE boleta_id=$1', [id])).toEqual(items);
    const historial = await source.query('SELECT * FROM boletas_envio_historial WHERE boleta_id=$1', [id]);
    expect(historial).toHaveLength(1);
    expect(historial[0]).toMatchObject({ estado_anterior: 'EMITIDA', estado_nuevo: 'EMITIDA', usuario_actor_id: '42' });
    expect(historial[0].motivo).toContain('ABC-385');
    expect((await reparar([id], true)).modificadas).toBe(0);
    expect(await source.query('SELECT * FROM boletas_envio_historial WHERE boleta_id=$1', [id])).toEqual(historial);
    expect(produccion.consultarOrdenPorId).toHaveBeenCalledTimes(1);
  });
  it.each(['unidad ausente', 'orden diferente', 'unidad desconocida'])('rechaza %s sin inventar datos', async (caso) => {
    const id = await boleta();
    const invalida = { ...orden, producto: { ...orden.producto } };
    if (caso === 'unidad ausente') delete invalida.producto.unidad_producto;
    if (caso === 'orden diferente') invalida.id = '8';
    if (caso === 'unidad desconocida') invalida.producto.unidad_producto = 'inventada';
    produccion.consultarOrdenPorId.mockResolvedValueOnce(invalida);
    await expect(reparar([id], true)).rejects.toThrow('verificables');
    expect(await fila(id)).toMatchObject({ producto_codigo: null, unidad: null });
  });
  it('no sobrescribe un dato existente que contradiga Producción', async () => {
    const id = await boleta('OTRO');
    await expect(reparar([id], true)).rejects.toThrow('contradicen');
    expect(await fila(id)).toMatchObject({ producto_codigo: 'OTRO', unidad: null });
  });
  it('un fallo HTTP en una boleta impide reparar parcialmente el lote', async () => {
    const ids = [await boleta(), await boleta()];
    produccion.consultarOrdenPorId.mockResolvedValueOnce(orden).mockRejectedValueOnce(new Error('Producción caída'));
    await expect(reparar(ids, true)).rejects.toThrow('Producción caída');
    for (const id of ids) expect(await fila(id)).toMatchObject({ producto_codigo: null, unidad: null });
  });
  it('revierte la actualización cuando no puede guardar su historial', async () => {
    const id = await boleta();
    await source.query('ALTER TABLE boletas_envio_historial ADD CONSTRAINT actor_prueba CHECK (usuario_actor_id <> 999)');
    try {
      await expect(reparar([id], true, '999')).rejects.toThrow();
      expect(await fila(id)).toMatchObject({ producto_codigo: null, unidad: null });
      expect(await source.query('SELECT * FROM boletas_envio_historial WHERE boleta_id=$1', [id])).toEqual([]);
    } finally { await source.query('ALTER TABLE boletas_envio_historial DROP CONSTRAINT actor_prueba'); }
  });
  it('detecta una anulación concurrente y no aplica el plan obsoleto', async () => {
    const id = await boleta();
    produccion.consultarOrdenPorId.mockImplementationOnce(async () => {
      await source.query("UPDATE boletas_envio SET estado='ANULADA' WHERE id=$1", [id]);
      return orden;
    });
    await expect(reparar([id], true)).rejects.toThrow('cambiaron');
    expect(await fila(id)).toMatchObject({ estado: 'ANULADA', producto_codigo: null, unidad: null });
  });
  it.each(['BORRADOR', 'ANULADA'])('no repara boletas en estado %s', async (estado) => {
    const id = await boleta();
    await source.query('UPDATE boletas_envio SET estado=$2 WHERE id=$1', [id,estado]);
    await expect(reparar([id], true)).rejects.toThrow('solo se completan emitidas');
    expect(produccion.consultarOrdenPorId).not.toHaveBeenCalled();
  });
  it('no altera una boleta de una ruta ya despachada', async () => {
    const id = await boleta(); const rutaId = await ruta(id);
    await source.query("UPDATE rutas SET estado='DESPACHADA',despachada_en=NOW(),despachada_por_usuario_id=42 WHERE id=$1", [rutaId]);
    await expect(reparar([id], true)).rejects.toThrow('no fueron despachadas');
  });
  it('habilita el despacho antes bloqueado: solo outbox del esquema aislado, sin publicador', async () => {
    const id = await boleta(); const rutaId = await ruta(id);
    const despacho = new DespachoService(source, new OutboxEventosDespacho());
    await expect(despacho.despachar(rutaId, '42', null)).rejects.toThrow();
    const antes = await source.query('SELECT * FROM eventos_outbox');
    await reparar([id], true);
    expect(await source.query('SELECT * FROM eventos_outbox')).toEqual(antes);
    await despacho.despachar(rutaId, '42', null);
    const [evento] = await source.query('SELECT estado,payload FROM eventos_outbox WHERE aggregate_id=$1', [rutaId]);
    expect(evento).toMatchObject({ estado: 'PENDIENTE', payload: { data: { boletas: [
      { boletaId: id, productoCodigo: 'P-3', unidad: 'kg', items: [{ cantidad: '2.1250' }] },
    ] } } });
  });
  it('rechaza IDs inválidos, duplicados y ausentes', async () => {
    await expect(reparar(['0'])).rejects.toThrow('IDs');
    await expect(reparar(['1','1'])).rejects.toThrow('IDs');
    await expect(reparar(['9223372036854775807'])).rejects.toThrow('no existe');
  });
});
