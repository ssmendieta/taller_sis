import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RutaParada } from '../rutas/entities/ruta-parada.entity';
import { Ruta } from '../rutas/entities/ruta.entity';
import { DespachoService } from './despacho.service';
import { EventosDespacho } from './eventos-despacho';

// PRUEBA SIMULADA: PostgreSQL se reemplaza por tablas en memoria que responden a
// las consultas del servicio. La transacción guarda una copia del estado y la
// restaura si falla, como haría un ROLLBACK. Las reglas son las reales de ABC-375.
type FilaRuta = Record<string, any>;
type FilaParada = Record<string, any>;

describe('ABC-376: DespachoService (despacho y entrega)', () => {
  let rutas: Record<string, FilaRuta>;
  let paradas: FilaParada[];
  let documentos: Array<{ parada_id: string; boleta_id: string }>;
  let boletas: Record<string, string>;
  let consultas: string[];
  let manager: any;
  let dataSource: any;
  let eventos: { registrarDespacho: jest.Mock };
  let service: DespachoService;

  function ruta(id: string, estado = 'PLANIFICADA'): FilaRuta {
    return {
      id, estado, fecha_programada: '2026-11-10', vehiculo_externo_id: 'VEH-01', chofer_externo_id: 'CHO-12',
      despachadaEn: null, despachadaPorUsuarioId: null, despachoObservacion: null, completadaEn: null,
    };
  }

  function parada(id: string, rutaId: string, secuencia: number, estado = 'PENDIENTE'): FilaParada {
    return { id, ruta_id: rutaId, secuencia, estado_entrega: estado, entregaActualizadaEn: null, entregaUsuarioId: null, entregaObservacion: null };
  }

  beforeEach(() => {
    rutas = { 9: ruta('9'), 20: ruta('20') };
    paradas = [parada('10', '9', 1), parada('11', '9', 2), parada('30', '20', 1)];
    documentos = [
      { parada_id: '10', boleta_id: '1' }, { parada_id: '10', boleta_id: '2' },
      { parada_id: '11', boleta_id: '3' }, { parada_id: '30', boleta_id: '4' },
    ];
    boletas = { 1: 'EMITIDA', 2: 'EMITIDA', 3: 'EMITIDA', 4: 'EMITIDA' };
    consultas = [];
    const boletasDe = (paradaIds: string[]) => documentos
      .filter((documento) => paradaIds.includes(documento.parada_id))
      .map((documento) => ({ id: documento.boleta_id, estado: boletas[documento.boleta_id] }))
      .sort((a, b) => Number(a.id) - Number(b.id));
    manager = {
      query: jest.fn(async (sql: string, params: any[]) => {
        consultas.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('FROM rutas WHERE id')) return rutas[params[0]] ? [{ ...rutas[params[0]] }] : [];
        if (sql.includes('FROM rutas_paradas WHERE ruta_id')) {
          return paradas.filter((p) => p.ruta_id === params[0]).sort((a, b) => a.secuencia - b.secuencia)
            .map((p) => ({ id: p.id, estado_entrega: p.estado_entrega }));
        }
        if (sql.includes('FROM rutas_paradas WHERE id')) {
          return paradas.filter((p) => p.id === params[0]).map((p) => ({ ruta_id: p.ruta_id }));
        }
        if (sql.includes('FROM rutas_paradas parada')) {
          return boletasDe(paradas.filter((p) => p.ruta_id === params[0] && p.estado_entrega !== params[1]).map((p) => p.id));
        }
        if (sql.includes('FROM rutas_paradas_boletas documento')) return boletasDe([params[0]]);
        throw new Error(`Consulta inesperada: ${sql}`);
      }),
      update: jest.fn(async (entidad: unknown, { id }: { id: string }, valores: Record<string, any>) => {
        if (entidad === Ruta) Object.assign(rutas[id], valores);
        if (entidad === RutaParada) {
          const fila = paradas.find((p) => p.id === id)!;
          Object.assign(fila, valores, valores.estadoEntrega ? { estado_entrega: valores.estadoEntrega } : {});
        }
      }),
      findOne: jest.fn(async (_entidad: unknown, { where: { id } }: any) => ({
        ...rutas[id], paradas: paradas.filter((p) => p.ruta_id === id).map((p) => ({ ...p })),
      })),
    };
    dataSource = {
      transaction: jest.fn(async (callback: (m: unknown) => Promise<unknown>) => {
        const copia = structuredClone({ rutas, paradas });
        try {
          return await callback(manager);
        } catch (error) {
          ({ rutas, paradas } = copia);
          throw error;
        }
      }),
    };
    eventos = { registrarDespacho: jest.fn(async () => undefined) };
    service = new DespachoService(dataSource as DataSource, eventos as EventosDespacho);
  });

  async function rechazo(promesa: Promise<unknown>, tipo: Function, mensaje: string) {
    await expect(promesa).rejects.toBeInstanceOf(tipo);
    await expect(promesa).rejects.toThrow(mensaje);
  }

  async function despachada(rutaId = '9') {
    await service.despachar(rutaId, '42', null);
    eventos.registrarDespacho.mockClear();
  }

  describe('despacho', () => {
    it('despacha una ruta PLANIFICADA con fecha del servidor, autor de la sesión y observación', async () => {
      const antes = Date.now();
      const respuesta = await service.despachar('9', '42', 'Salida con 2 paradas');
      expect(rutas[9]).toMatchObject({ estado: 'DESPACHADA', despachadaPorUsuarioId: '42', despachoObservacion: 'Salida con 2 paradas' });
      expect(rutas[9].despachadaEn).toBeInstanceOf(Date);
      expect(rutas[9].despachadaEn.getTime()).toBeGreaterThanOrEqual(antes);
      expect(respuesta).toMatchObject({ id: '9', estado: 'DESPACHADA', paradas: [{ id: '10' }, { id: '11' }] });
    });

    it('bloquea ruta, paradas y boletas antes de cambiar el estado', async () => {
      await service.despachar('9', '42', null);
      expect(consultas[0]).toMatch(/FROM rutas WHERE id = \$1 FOR UPDATE/);
      expect(consultas[1]).toMatch(/FROM rutas_paradas WHERE ruta_id = \$1 ORDER BY secuencia FOR UPDATE/);
      expect(consultas[2]).toMatch(/FOR UPDATE OF boleta/);
    });

    it('registra el evento de salida con el mismo manager de la transacción (ABC-386)', async () => {
      await service.despachar('9', '42', null);
      expect(eventos.registrarDespacho).toHaveBeenCalledTimes(1);
      expect(eventos.registrarDespacho).toHaveBeenCalledWith(manager, {
        rutaId: '9', fechaProgramada: '2026-11-10', vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-12',
        despachadaEn: rutas[9].despachadaEn, despachadaPorUsuarioId: '42', boletaIds: ['1', '2', '3'],
      });
    });

    it('si falla el registro del evento se revierte el despacho completo', async () => {
      eventos.registrarDespacho.mockRejectedValueOnce(new Error('outbox no disponible'));
      await expect(service.despachar('9', '42', 'x')).rejects.toThrow('outbox no disponible');
      expect(rutas[9]).toMatchObject({ estado: 'PLANIFICADA', despachadaEn: null, despachadaPorUsuarioId: null, despachoObservacion: null });
    });

    it('rechaza el doble despacho y conserva fecha y autor del primero', async () => {
      await service.despachar('9', '42', 'primero');
      const primero = { ...rutas[9] };
      await rechazo(service.despachar('9', '43', 'segundo'), ConflictException, 'La ruta ya está en estado DESPACHADA');
      expect(rutas[9]).toEqual(primero);
      expect(eventos.registrarDespacho).toHaveBeenCalledTimes(1);
    });

    it.each(['COMPLETADA', 'CANCELADA'])('rechaza el retroceso de %s a DESPACHADA', async (estado) => {
      rutas[9].estado = estado;
      await rechazo(service.despachar('9', '42', null), ConflictException, `Transición de ruta no permitida: ${estado} → DESPACHADA`);
      expect(eventos.registrarDespacho).not.toHaveBeenCalled();
    });

    it('rechaza despachar con una boleta anulada después de planificar la ruta', async () => {
      boletas[2] = 'ANULADA';
      await rechazo(service.despachar('9', '42', null), ConflictException, 'Solo se despachan boletas EMITIDAS: 2 (ANULADA)');
      expect(rutas[9].estado).toBe('PLANIFICADA');
      expect(eventos.registrarDespacho).not.toHaveBeenCalled();
    });

    it('ignora las boletas de paradas ya anuladas', async () => {
      paradas[1].estado_entrega = 'ANULADA';
      boletas[3] = 'ANULADA';
      await service.despachar('9', '42', null);
      expect(eventos.registrarDespacho.mock.calls[0][1].boletaIds).toEqual(['1', '2']);
    });

    it('rechaza una ruta sin entregas pendientes', async () => {
      paradas[0].estado_entrega = 'ANULADA';
      paradas[1].estado_entrega = 'ANULADA';
      await rechazo(service.despachar('9', '42', null), ConflictException, 'La ruta no tiene entregas pendientes para despachar');
    });

    it('rechaza una ruta sin vehículo o chofer', async () => {
      rutas[9].chofer_externo_id = ' ';
      await rechazo(service.despachar('9', '42', null), ConflictException, 'vehículo y chofer asignados');
    });

    it('404 para ruta inexistente; un id inválido no abre transacción', async () => {
      await rechazo(service.despachar('999', '42', null), NotFoundException, 'Ruta no encontrada');
      dataSource.transaction.mockClear();
      expect(() => service.despachar('abc', '42', null)).toThrow(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('entrega', () => {
    it('entrega parcial: registra la parada y la ruta sigue DESPACHADA', async () => {
      await despachada();
      const antes = Date.now();
      const respuesta = await service.entregar('9', '10', '42', 'Recibió Ana');
      expect(paradas[0]).toMatchObject({ estado_entrega: 'ENTREGADA', entregaUsuarioId: '42', entregaObservacion: 'Recibió Ana' });
      expect(paradas[0].entregaActualizadaEn.getTime()).toBeGreaterThanOrEqual(antes);
      expect(paradas[1].estado_entrega).toBe('PENDIENTE');
      expect(rutas[9]).toMatchObject({ estado: 'DESPACHADA', completadaEn: null });
      expect(respuesta.estado).toBe('DESPACHADA');
    });

    it('cierra la ruta al entregar la última parada válida, con la misma fecha', async () => {
      await despachada();
      await service.entregar('9', '10', '42', null);
      const respuesta = await service.entregar('9', '11', '43', null);
      expect(rutas[9].estado).toBe('COMPLETADA');
      expect(rutas[9].completadaEn).toEqual(paradas[1].entregaActualizadaEn);
      expect(respuesta.estado).toBe('COMPLETADA');
    });

    it('una parada anulada no impide cerrar la ruta', async () => {
      await despachada();
      paradas[1].estado_entrega = 'ANULADA';
      await service.entregar('9', '10', '42', null);
      expect(rutas[9].estado).toBe('COMPLETADA');
    });

    it('rechaza la entrega repetida y conserva fecha, autor y observación originales', async () => {
      await despachada();
      await service.entregar('9', '10', '42', 'primera');
      const original = { ...paradas[0] };
      await rechazo(service.entregar('9', '10', '43', 'segunda'), ConflictException, 'La entrega ya está en estado ENTREGADA');
      expect(paradas[0]).toEqual(original);
    });

    it('rechaza entregar en una ruta que no fue despachada', async () => {
      await rechazo(service.entregar('9', '10', '42', null), ConflictException, 'Solo se entrega en una ruta DESPACHADA (estado actual: PLANIFICADA)');
      expect(paradas[0].estado_entrega).toBe('PENDIENTE');
    });

    it('rechaza una parada ajena a la ruta (409) y una inexistente (404)', async () => {
      await despachada();
      await rechazo(service.entregar('9', '30', '42', null), ConflictException, 'La parada 30 no pertenece a la ruta 9');
      await rechazo(service.entregar('9', '777', '42', null), NotFoundException, 'Parada no encontrada');
      expect(paradas[2].estado_entrega).toBe('PENDIENTE');
    });

    it('rechaza entregar una boleta anulada después del despacho', async () => {
      await despachada();
      boletas[2] = 'ANULADA';
      await rechazo(service.entregar('9', '10', '42', null), ConflictException, 'No se pueden entregar boletas anuladas o no emitidas: 2 (ANULADA)');
      expect(paradas[0].estado_entrega).toBe('PENDIENTE');
      expect(rutas[9].estado).toBe('DESPACHADA');
    });

    it('bloquea ruta, paradas y boletas de la parada', async () => {
      await despachada();
      consultas = [];
      await service.entregar('9', '10', '42', null);
      expect(consultas[0]).toMatch(/FROM rutas WHERE id = \$1 FOR UPDATE/);
      expect(consultas[1]).toMatch(/FROM rutas_paradas WHERE ruta_id = \$1 ORDER BY secuencia FOR UPDATE/);
      expect(consultas[2]).toMatch(/FOR UPDATE OF boleta/);
    });

    it('ids inválidos responden 404 sin abrir transacción', () => {
      expect(() => service.entregar('x', '10', '42', null)).toThrow('Ruta no encontrada');
      expect(() => service.entregar('9', '0', '42', null)).toThrow('Parada no encontrada');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
