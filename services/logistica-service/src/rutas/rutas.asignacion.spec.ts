import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { ConsultaRecursosRespuesta } from '../recursos-externos/dto/consulta-recursos.dto';
import { RecursosLogisticosService } from '../recursos-externos/recursos-logisticos.service';
import { GuardarRutaDto } from './dto/guardar-ruta.dto';
import { RutaParadaBoleta } from './entities/ruta-parada-boleta.entity';
import { RutaParada } from './entities/ruta-parada.entity';
import { Ruta } from './entities/ruta.entity';
import { RutasService } from './rutas.service';
import { ValidacionAsignacionService } from './validaciones/validacion-asignacion.service';

// PRUEBA SIMULADA (ABC-371): PostgreSQL se reemplaza por tablas en memoria que
// responden a las consultas reales del servicio, incluido pg_advisory_xact_lock,
// que retiene la clave hasta que termina la transacción. ERP y Producción son
// dobles en memoria. RutasService y ValidacionAsignacionService son los reales.
const FECHA = '2026-11-10';

type FilaRuta = { id: string; fecha_programada: string; vehiculo_externo_id: string; chofer_externo_id: string; estado: string };

describe('ABC-371: disponibilidad, capacidad y concurrencia al asignar una ruta', () => {
  let rutas: FilaRuta[];
  let paradas: Array<{ id: string; ruta_id: string }>;
  let documentos: Array<{ parada_id: string; boleta_id: string }>;
  let boletas: Record<string, { estado: string; orden: string }>;
  let items: Array<{ boleta_id: string; cantidad: string }>;
  let unidades: Record<string, string | null>;
  let recursos: jest.Mock;
  let produccion: { consultarOrdenPorId: jest.Mock };
  let consultas: string[];
  let bloqueos: Map<string, Promise<void>>;
  let dataSource: any;
  let service: RutasService;

  const pausa = () => new Promise((resolver) => setImmediate(resolver));

  function respuestaRecursos(): ConsultaRecursosRespuesta {
    return {
      fecha: FECHA, origen: 'ERP', generadoEn: '2026-11-09T21:00:00.000Z', sincronizadoEn: '2026-11-10T08:00:00.000Z', aviso: null,
      filtros: { disponible: null, capacidadMinima: null }, totales: { vehiculos: 3, choferes: 3 },
      vehiculos: [
        { idExterno: 'VEH-01', placa: '2345-ABC', descripcion: null, capacidad: { valor: '1500.0000', unidad: 'kg' }, disponible: true },
        { idExterno: 'VEH-02', placa: '3456-BCD', descripcion: null, capacidad: { valor: '800.0000', unidad: 'kg' }, disponible: false },
        { idExterno: 'VEH-03', placa: '4567-CDE', descripcion: null, capacidad: { valor: '2000.0000', unidad: 'kg' }, disponible: true },
      ],
      choferes: [
        { idExterno: 'CHO-12', nombre: 'Juan Pérez', licenciaCategoria: 'C', disponible: true },
        { idExterno: 'CHO-07', nombre: 'Ana Rojas', licenciaCategoria: null, disponible: false },
        { idExterno: 'CHO-20', nombre: 'Luis Vega', licenciaCategoria: 'C', disponible: true },
      ],
    };
  }

  // Cada transacción tiene su propio manager y suelta sus claves al terminar.
  function nuevoManager(retenidas: Array<() => void>) {
    const manager: any = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        consultas.push(sql.replace(/\s+/g, ' ').trim());
        await pausa();
        if (sql.includes('pg_advisory_xact_lock')) {
          const clave = params[0];
          while (bloqueos.has(clave)) await bloqueos.get(clave);
          let soltar!: () => void;
          bloqueos.set(clave, new Promise<void>((resolver) => { soltar = resolver; }));
          retenidas.push(() => { bloqueos.delete(clave); soltar(); });
          return [];
        }
        if (sql.includes('SELECT DISTINCT solicitud.orden_id')) {
          return [...new Set(params[0].filter((id: string) => boletas[id]).map((id: string) => boletas[id].orden))].sort()
            .map((orden) => ({ orden_id: orden }));
        }
        if (sql.includes('FROM boletas_envio WHERE id = ANY')) {
          return params[0].filter((id: string) => boletas[id]).map((id: string) => ({ id, estado: boletas[id].estado }));
        }
        if (sql.includes('FROM rutas_paradas_boletas documento')) {
          const [ids, activos, rutaId] = params;
          return documentos.filter((d) => ids.includes(d.boleta_id)).flatMap((d) => {
            const ruta = rutas.find((r) => r.id === paradas.find((p) => p.id === d.parada_id)?.ruta_id);
            return ruta && activos.includes(ruta.estado) && ruta.id !== rutaId ? [{ boleta_id: d.boleta_id, ruta_id: ruta.id }] : [];
          });
        }
        if (sql.includes('WHERE fecha_programada = $1')) {
          const [fecha, activos, rutaId, vehiculo, chofer] = params;
          return rutas.filter((r) => r.fecha_programada === fecha && activos.includes(r.estado) && r.id !== rutaId &&
            (r.vehiculo_externo_id === vehiculo || r.chofer_externo_id === chofer));
        }
        if (sql.includes('FROM boletas_envio_items item')) {
          return items.filter((i) => params[0].includes(i.boleta_id))
            .map((i) => ({ ...i, orden_id: boletas[i.boleta_id].orden }));
        }
        if (sql.includes('FROM rutas WHERE id = $1 FOR UPDATE')) {
          return rutas.filter((r) => r.id === params[0]).map(({ id, estado }) => ({ id, estado }));
        }
        throw new Error(`Consulta inesperada: ${sql}`);
      }),
      save: jest.fn(async (entidad: unknown, valor: any) => {
        await pausa();
        if (entidad === Ruta) {
          const fila = { id: String(rutas.length + 100), fecha_programada: valor.fechaProgramada, vehiculo_externo_id: valor.vehiculoExternoId,
            chofer_externo_id: valor.choferExternoId, estado: valor.estado };
          rutas.push(fila);
          return { ...valor, id: fila.id };
        }
        if (entidad === RutaParada) {
          const fila = { id: String(paradas.length + 500), ruta_id: valor.rutaId };
          paradas.push(fila);
          return { ...valor, id: fila.id };
        }
        if (entidad === RutaParadaBoleta) documentos.push(...valor.map((d: any) => ({ parada_id: d.paradaId, boleta_id: d.boletaId })));
        return valor;
      }),
      create: jest.fn((_entidad: unknown, valor: unknown) => valor),
      update: jest.fn(async (_entidad: unknown, { id }: { id: string }, valor: any) => {
        Object.assign(rutas.find((r) => r.id === id)!, {
          fecha_programada: valor.fechaProgramada, vehiculo_externo_id: valor.vehiculoExternoId, chofer_externo_id: valor.choferExternoId,
        });
      }),
      delete: jest.fn(async (_entidad: unknown, { rutaId }: { rutaId: string }) => {
        const borradas = paradas.filter((p) => p.ruta_id === rutaId).map((p) => p.id);
        paradas = paradas.filter((p) => p.ruta_id !== rutaId);
        documentos = documentos.filter((d) => !borradas.includes(d.parada_id));
      }),
      findOne: jest.fn(async (_entidad: unknown, { where: { id } }: any) => ({ ...rutas.find((r) => r.id === id) })),
    };
    return manager;
  }

  beforeEach(() => {
    rutas = [];
    paradas = [];
    documentos = [];
    boletas = {
      1: { estado: 'EMITIDA', orden: '7' }, 2: { estado: 'EMITIDA', orden: '7' }, 3: { estado: 'EMITIDA', orden: '8' },
      4: { estado: 'EMITIDA', orden: '9' }, 5: { estado: 'EMITIDA', orden: '10' }, 6: { estado: 'EMITIDA', orden: '7' },
    };
    items = [
      { boleta_id: '1', cantidad: '700.0000' }, { boleta_id: '1', cantidad: '100.0000' },
      { boleta_id: '2', cantidad: '400.0000' }, { boleta_id: '3', cantidad: '300.0000' },
      { boleta_id: '4', cantidad: '5.0000' }, { boleta_id: '5', cantidad: '10.0000' }, { boleta_id: '6', cantidad: '50.0000' },
    ];
    unidades = { 7: 'kg', 8: 'kg', 9: 'g', 10: 'kg' };
    consultas = [];
    bloqueos = new Map();
    recursos = jest.fn(async () => respuestaRecursos());
    produccion = {
      consultarOrdenPorId: jest.fn(async (id: string) => {
        if (!(id in unidades)) throw new NotFoundException('Orden no encontrada en Producción');
        return { id, codigo: `ORD-${id}`, producto_id: 1, producto: unidades[id] === null ? null : { unidad_producto: unidades[id] } };
      }),
    };
    dataSource = {
      manager: nuevoManager([]),
      transaction: jest.fn(async (callback: (m: unknown) => Promise<unknown>) => {
        const retenidas: Array<() => void> = [];
        try {
          return await callback(nuevoManager(retenidas));
        } finally {
          retenidas.forEach((soltar) => soltar());
        }
      }),
    };
    const validacion = new ValidacionAsignacionService(
      { consultar: recursos } as unknown as RecursosLogisticosService,
      produccion as unknown as LotesProduccionClient,
    );
    service = new RutasService({} as Repository<Ruta>, dataSource as DataSource, validacion);
  });

  const dto = (cambios: Partial<GuardarRutaDto> = {}, boletaIds = ['1', '2']): GuardarRutaDto => ({
    grupoId: null, fechaProgramada: FECHA, vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-12',
    paradas: [{ destino: 'Tienda Central', boletaIds }], ...cambios,
  });

  function rutaExistente(cambios: Partial<FilaRuta>) {
    rutas.push({ id: '50', fecha_programada: FECHA, vehiculo_externo_id: 'VEH-01', chofer_externo_id: 'CHO-12', estado: 'PLANIFICADA', ...cambios });
  }

  async function rechazo(promesa: Promise<unknown>, tipo: Function, mensaje: string) {
    await expect(promesa).rejects.toBeInstanceOf(tipo);
    await expect(promesa).rejects.toThrow(mensaje);
  }

  it('crea la ruta cuando vehículo y chofer están disponibles y la carga cabe (1200 de 1500 kg)', async () => {
    const ruta = await service.create(dto(), '42', 'Bearer sesion');
    expect(ruta).toMatchObject({ vehiculo_externo_id: 'VEH-01', chofer_externo_id: 'CHO-12' });
    expect(rutas).toHaveLength(1);
    expect(recursos).toHaveBeenCalledWith({ fecha: FECHA, disponible: null, capacidadMinima: null });
    expect(produccion.consultarOrdenPorId).toHaveBeenCalledWith('7', 'Bearer sesion');
  });

  it('toma los bloqueos de vehículo y chofer antes de bloquear boletas y de buscar solapamientos', async () => {
    await service.create(dto(), '42', 'Bearer sesion');
    const enTransaccion = consultas.filter((sql) => !sql.includes('SELECT DISTINCT solicitud.orden_id'));
    expect(enTransaccion.slice(0, 2)).toEqual([
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    ]);
    expect(enTransaccion[2]).toContain('FROM boletas_envio WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE');
    expect(enTransaccion.findIndex((sql) => sql.includes('WHERE fecha_programada = $1'))).toBeGreaterThan(2);
  });

  it('acepta la carga igual a la capacidad', async () => {
    // 800 + 400 + 300 kg
    await expect(service.create(dto({}, ['1', '2', '3']), '42', 'Bearer s')).resolves.toBeDefined();
  });

  it('rechaza la sobrecarga sin guardar la ruta', async () => {
    items.push({ boleta_id: '3', cantidad: '0.0001' });
    await rechazo(service.create(dto({}, ['1', '2', '3']), '42', 'Bearer s'), ConflictException,
      'Sobrecarga: la carga de 1500.0001 kg supera la capacidad del vehículo VEH-01 (1500.0000 kg)');
    expect(rutas).toHaveLength(0);
  });

  it.each([
    ['unidad fuera del contrato (g)', ['1', '4'], 'Unidad de carga desconocida: g'],
    ['orden sin receta en Producción', ['5'], 'Carga desconocida: no se conoce la unidad de las boletas 5'],
  ])('rechaza %s', async (caso, boletaIds, mensaje) => {
    if (caso.startsWith('orden sin receta')) unidades[10] = null;
    await rechazo(service.create(dto({}, boletaIds), '42', 'Bearer s'), ConflictException, mensaje);
    expect(rutas).toHaveLength(0);
  });

  it('rechaza una boleta sin ítems (carga desconocida)', async () => {
    items = items.filter((i) => i.boleta_id !== '2');
    await rechazo(service.create(dto(), '42', 'Bearer s'), ConflictException, 'Carga desconocida: las boletas 2 no tienen ítems');
  });

  it.each([
    [{ vehiculoExternoId: 'VEH-02' }, 'El vehículo VEH-02 no está disponible el 2026-11-10 según el ERP'],
    [{ vehiculoExternoId: 'VEH-99' }, 'El vehículo VEH-99 no figura en el ERP para 2026-11-10'],
    [{ choferExternoId: 'CHO-07' }, 'El chofer CHO-07 no está disponible el 2026-11-10 según el ERP'],
  ])('rechaza recursos no disponibles: %j', async (cambios, mensaje) => {
    await rechazo(service.create(dto(cambios), '42', 'Bearer s'), ConflictException, mensaje);
    expect(rutas).toHaveLength(0);
  });

  it('usa la copia de respaldo cuando el ERP no responde y lo indica en el mensaje', async () => {
    recursos.mockResolvedValue({ ...respuestaRecursos(), origen: 'RESPALDO', aviso: { motivo: 'TIMEOUT', mensaje: 'x' } });
    await rechazo(service.create(dto({ vehiculoExternoId: 'VEH-02' }), '42', 'Bearer s'), ConflictException,
      'según la copia de respaldo del ERP (2026-11-10T08:00:00.000Z)');
    await expect(service.create(dto(), '42', 'Bearer s')).resolves.toBeDefined();
  });

  it('sin datos de recursos (ERP caído y sin copia) no asigna y no abre la transacción', async () => {
    recursos.mockRejectedValue(new ServiceUnavailableException('El ERP no respondió a tiempo y no hay copia de respaldo para 2026-11-10'));
    await rechazo(service.create(dto(), '42', 'Bearer s'), ServiceUnavailableException, 'no hay copia de respaldo');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('si Producción no responde no asigna (503)', async () => {
    produccion.consultarOrdenPorId.mockRejectedValue(new ServiceUnavailableException('Producción no está disponible'));
    await rechazo(service.create(dto(), '42', 'Bearer s'), ServiceUnavailableException,
      'No se pudo obtener la unidad de carga de la orden 7 en Producción: Producción no está disponible');
  });

  it('rechaza vehículo o chofer ya asignados a otra ruta activa el mismo día', async () => {
    rutaExistente({ chofer_externo_id: 'CHO-20' });
    await rechazo(service.create(dto(), '42', 'Bearer s'), ConflictException, 'Recursos ya asignados el 2026-11-10: vehículo VEH-01 (ruta 50)');
    await rechazo(service.create(dto({ vehiculoExternoId: 'VEH-03', choferExternoId: 'CHO-20' }), '42', 'Bearer s'),
      ConflictException, 'chofer CHO-20 (ruta 50)');
  });

  it.each([
    [{ estado: 'COMPLETADA' }], [{ estado: 'CANCELADA' }], [{ fecha_programada: '2026-11-11' }],
  ])('no hay solapamiento con %j', async (cambios) => {
    rutaExistente(cambios);
    await expect(service.create(dto(), '42', 'Bearer s')).resolves.toBeDefined();
  });

  it('al editar, la ruta no choca consigo misma pero sí con otra', async () => {
    rutaExistente({});
    await expect(service.update('50', dto({}, ['6']), 'Bearer s')).resolves.toBeDefined();
    rutas.push({ id: '51', fecha_programada: FECHA, vehiculo_externo_id: 'VEH-03', chofer_externo_id: 'CHO-20', estado: 'DESPACHADA' });
    await rechazo(service.update('50', dto({ vehiculoExternoId: 'VEH-03' }, ['6']), 'Bearer s'), ConflictException, 'vehículo VEH-03 (ruta 51)');
  });

  it('dos asignaciones simultáneas del mismo vehículo: solo una se guarda', async () => {
    const resultados = await Promise.allSettled([
      service.create(dto({ choferExternoId: 'CHO-12' }, ['1']), '42', 'Bearer s'),
      service.create(dto({ choferExternoId: 'CHO-20' }, ['3']), '43', 'Bearer s'),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rechazada = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rechazada.reason).toBeInstanceOf(ConflictException);
    expect(rechazada.reason.message).toMatch(/^Recursos ya asignados el 2026-11-10: vehículo VEH-01 \(ruta \d+\)$/);
    expect(rutas).toHaveLength(1);
  });

  it('dos asignaciones simultáneas del mismo chofer con vehículos distintos: solo una se guarda', async () => {
    const resultados = await Promise.allSettled([
      service.create(dto({ vehiculoExternoId: 'VEH-01' }, ['1']), '42', 'Bearer s'),
      service.create(dto({ vehiculoExternoId: 'VEH-03' }, ['3']), '43', 'Bearer s'),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rutas).toHaveLength(1);
  });
});
