import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { RutaParada } from '../rutas/entities/ruta-parada.entity';
import { Ruta } from '../rutas/entities/ruta.entity';
import { DespachoService } from './despacho.service';
import { EstadoEntrega } from './estado-entrega.enum';
import { EventosDespacho } from './eventos-despacho';
import {
  estadoRutaSegunEntregas,
  validarDespacho,
  validarTransicionEntrega,
  validarTransicionRuta,
} from './transiciones';

// ABC-378: Verificación exhaustiva de criterios de aceptación y regresión para ABC-374.
// PRUEBA SIMULADA: Verificación en memoria determinista de transiciones, transaccionalidad,
// rollback, control de concurrencia y reglas de negocio sin requerir PostgreSQL ni Docker.

type FilaRuta = Record<string, any>;
type FilaParada = Record<string, any>;

describe('ABC-378: Regresión y Criterios de Aceptación (ABC-374: Despacho y Entrega)', () => {
  let rutas: Record<string, FilaRuta>;
  let paradas: FilaParada[];
  let documentos: Array<{ parada_id: string; boleta_id: string }>;
  let boletas: Record<string, EstadoBoleta>;
  let consultas: string[];
  let manager: any;
  let dataSource: any;
  let eventos: { registrarDespacho: jest.Mock };
  let service: DespachoService;

  function crearRuta(id: string, overrides: Partial<FilaRuta> = {}): FilaRuta {
    return {
      id,
      estado: EstadoRuta.PLANIFICADA,
      fecha_programada: '2026-11-15',
      vehiculo_externo_id: 'VEH-101',
      chofer_externo_id: 'CHO-505',
      despachadaEn: null,
      despachadaPorUsuarioId: null,
      despachoObservacion: null,
      completadaEn: null,
      ...overrides,
    };
  }

  function crearParada(
    id: string,
    rutaId: string,
    secuencia: number,
    estadoEntrega = EstadoEntrega.PENDIENTE,
  ): FilaParada {
    return {
      id,
      ruta_id: rutaId,
      secuencia,
      estado_entrega: estadoEntrega,
      entregaActualizadaEn: null,
      entregaUsuarioId: null,
      entregaObservacion: null,
    };
  }

  beforeEach(() => {
    // Escenario base:
    // Ruta 1: 3 paradas (101, 102, 103) con boletas EMITIDAS
    // Ruta 2: ruta alternativa para pruebas de aislamiento y paradas ajenas
    rutas = {
      '1': crearRuta('1'),
      '2': crearRuta('2'),
    };

    paradas = [
      crearParada('101', '1', 1),
      crearParada('102', '1', 2),
      crearParada('103', '1', 3),
      crearParada('201', '2', 1),
    ];

    documentos = [
      { parada_id: '101', boleta_id: 'B-01' },
      { parada_id: '101', boleta_id: 'B-02' },
      { parada_id: '102', boleta_id: 'B-03' },
      { parada_id: '103', boleta_id: 'B-04' },
      { parada_id: '201', boleta_id: 'B-05' },
    ];

    boletas = {
      'B-01': EstadoBoleta.EMITIDA,
      'B-02': EstadoBoleta.EMITIDA,
      'B-03': EstadoBoleta.EMITIDA,
      'B-04': EstadoBoleta.EMITIDA,
      'B-05': EstadoBoleta.EMITIDA,
    };

    consultas = [];

    const boletasDe = (paradaIds: string[]) =>
      documentos
        .filter((d) => paradaIds.includes(d.parada_id))
        .map((d) => ({ id: d.boleta_id, estado: boletas[d.boleta_id] }))
        .sort((a, b) => a.id.localeCompare(b.id));

    manager = {
      query: jest.fn(async (sql: string, params: any[]) => {
        consultas.push(sql.replace(/\s+/g, ' ').trim());

        if (sql.includes('FROM rutas WHERE id')) {
          return rutas[params[0]] ? [{ ...rutas[params[0]] }] : [];
        }

        if (sql.includes('FROM rutas_paradas WHERE ruta_id')) {
          return paradas
            .filter((p) => p.ruta_id === params[0])
            .sort((a, b) => a.secuencia - b.secuencia)
            .map((p) => ({ id: p.id, estado_entrega: p.estado_entrega }));
        }

        if (sql.includes('FROM rutas_paradas WHERE id')) {
          return paradas.filter((p) => p.id === params[0]).map((p) => ({ ruta_id: p.ruta_id }));
        }

        if (sql.includes('FROM rutas_paradas parada')) {
          const paradasValidas = paradas
            .filter((p) => p.ruta_id === params[0] && p.estado_entrega !== params[1])
            .map((p) => p.id);
          return boletasDe(paradasValidas);
        }

        if (sql.includes('FROM rutas_paradas_boletas documento')) {
          return boletasDe([params[0]]);
        }

        throw new Error(`Consulta SQL no mapeada en test: ${sql}`);
      }),

      update: jest.fn(async (entidad: unknown, { id }: { id: string }, valores: Record<string, any>) => {
        if (entidad === Ruta) {
          Object.assign(rutas[id], valores);
        }
        if (entidad === RutaParada) {
          const fila = paradas.find((p) => p.id === id);
          if (fila) {
            Object.assign(fila, valores, valores.estadoEntrega ? { estado_entrega: valores.estadoEntrega } : {});
          }
        }
      }),

      findOne: jest.fn(async (_entidad: unknown, { where: { id } }: any) => ({
        ...rutas[id],
        paradas: paradas.filter((p) => p.ruta_id === id).map((p) => ({ ...p })),
      })),
    };

    dataSource = {
      transaction: jest.fn(async (callback: (m: unknown) => Promise<unknown>) => {
        const estadoPrevio = structuredClone({ rutas, paradas });
        try {
          return await callback(manager);
        } catch (error) {
          rutas = estadoPrevio.rutas;
          paradas = estadoPrevio.paradas;
          throw error;
        }
      }),
    };

    eventos = { registrarDespacho: jest.fn(async () => undefined) };
    service = new DespachoService(dataSource as DataSource, eventos as EventosDespacho);
  });

  // ---------------------------------------------------------------------------
  // CA-01: Despachar solo ruta planificada con recursos válidos y boletas emitidas
  // ---------------------------------------------------------------------------
  describe('CA-01: Despacho condicionado a recursos y boletas emitidas', () => {
    it('despacha exitosamente cuando la ruta está PLANIFICADA, tiene vehículo, chofer y boletas EMITIDAS', async () => {
      const fechaInicio = Date.now();
      const resultado = await service.despachar('1', 'usr-supervisor', 'Despacho matutino');

      expect(rutas['1'].estado).toBe(EstadoRuta.DESPACHADA);
      expect(rutas['1'].despachadaPorUsuarioId).toBe('usr-supervisor');
      expect(rutas['1'].despachoObservacion).toBe('Despacho matutino');
      expect(rutas['1'].despachadaEn).toBeInstanceOf(Date);
      expect(rutas['1'].despachadaEn.getTime()).toBeGreaterThanOrEqual(fechaInicio);
      expect(resultado.estado).toBe(EstadoRuta.DESPACHADA);
    });

    it('bloquea el despacho si no tiene vehículo asignado', async () => {
      rutas['1'].vehiculo_externo_id = '';
      await expect(service.despachar('1', 'usr-1', null)).rejects.toThrow(
        /vehículo y chofer asignados/,
      );
      expect(rutas['1'].estado).toBe(EstadoRuta.PLANIFICADA);
    });

    it('bloquea el despacho si no tiene chofer asignado', async () => {
      rutas['1'].chofer_externo_id = '   ';
      await expect(service.despachar('1', 'usr-1', null)).rejects.toThrow(
        /vehículo y chofer asignados/,
      );
      expect(rutas['1'].estado).toBe(EstadoRuta.PLANIFICADA);
    });

    it('bloquea el despacho si la ruta no tiene paradas o no tiene entregas pendientes', async () => {
      paradas.forEach((p) => {
        if (p.ruta_id === '1') p.estado_entrega = EstadoEntrega.ANULADA;
      });

      await expect(service.despachar('1', 'usr-1', null)).rejects.toThrow(
        'La ruta no tiene entregas pendientes para despachar',
      );
      expect(rutas['1'].estado).toBe(EstadoRuta.PLANIFICADA);
    });

    it('bloquea el despacho si alguna de sus boletas no está en estado EMITIDA (p. ej. ANULADA)', async () => {
      boletas['B-02'] = EstadoBoleta.ANULADA;

      await expect(service.despachar('1', 'usr-1', null)).rejects.toThrow(
        /Solo se despachan boletas EMITIDAS: B-02 \(ANULADA\)/,
      );
      expect(rutas['1'].estado).toBe(EstadoRuta.PLANIFICADA);
      expect(eventos.registrarDespacho).not.toHaveBeenCalled();
    });

    it('no permite despachar una ruta que ya no está PLANIFICADA (retrocesos o saltos ilegales)', async () => {
      rutas['1'].estado = EstadoRuta.COMPLETADA;

      await expect(service.despachar('1', 'usr-1', null)).rejects.toThrow(
        'Transición de ruta no permitida: COMPLETADA → DESPACHADA',
      );
      expect(eventos.registrarDespacho).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // CA-02: No entregar boleta anulada o ajena a la ruta
  // ---------------------------------------------------------------------------
  describe('CA-02: Protección contra boletas inválidas o ajenas a la ruta', () => {
    beforeEach(async () => {
      // Ruta 1 despachada para comenzar pruebas de entrega
      await service.despachar('1', 'usr-despachador', null);
      eventos.registrarDespacho.mockClear();
    });

    it('rechaza entregar una parada si su boleta fue anulada tras el despacho', async () => {
      boletas['B-01'] = EstadoBoleta.ANULADA;

      await expect(service.entregar('1', '101', 'usr-chofer', null)).rejects.toThrow(
        /No se pueden entregar boletas anuladas o no emitidas: B-01 \(ANULADA\)/,
      );

      const parada101 = paradas.find((p) => p.id === '101');
      expect(parada101?.estado_entrega).toBe(EstadoEntrega.PENDIENTE);
      expect(rutas['1'].estado).toBe(EstadoRuta.DESPACHADA);
    });

    it('rechaza entregar una parada perteneciente a otra ruta (409 Conflict)', async () => {
      // Parada 201 pertenece a Ruta 2, no a Ruta 1
      await expect(service.entregar('1', '201', 'usr-chofer', null)).rejects.toThrow(
        'La parada 201 no pertenece a la ruta 1',
      );

      const parada201 = paradas.find((p) => p.id === '201');
      expect(parada201?.estado_entrega).toBe(EstadoEntrega.PENDIENTE);
    });

    it('rechaza entregar una parada inexistente (404 NotFound)', async () => {
      await expect(service.entregar('1', '999999', 'usr-chofer', null)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza entregar en una ruta que aún está PLANIFICADA', async () => {
      // Ruta 2 sigue PLANIFICADA
      await expect(service.entregar('2', '201', 'usr-chofer', null)).rejects.toThrow(
        'Solo se entrega en una ruta DESPACHADA (estado actual: PLANIFICADA)',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // CA-03: Permitir entregas parciales; cerrar ruta solo al completar todas sus entregas válidas
  // ---------------------------------------------------------------------------
  describe('CA-03: Entregas parciales y cierre exacto de ruta', () => {
    beforeEach(async () => {
      await service.despachar('1', 'usr-despachador', null);
    });

    it('mantiene la ruta en estado DESPACHADA mientras queden paradas pendientes', async () => {
      // Entrega parada 1 de 3
      const resParada1 = await service.entregar('1', '101', 'usr-chofer', 'Primera entrega');
      expect(rutas['1'].estado).toBe(EstadoRuta.DESPACHADA);
      expect(rutas['1'].completadaEn).toBeNull();
      expect(resParada1.estado).toBe(EstadoRuta.DESPACHADA);

      // Entrega parada 2 de 3
      const resParada2 = await service.entregar('1', '102', 'usr-chofer', 'Segunda entrega');
      expect(rutas['1'].estado).toBe(EstadoRuta.DESPACHADA);
      expect(rutas['1'].completadaEn).toBeNull();
      expect(resParada2.estado).toBe(EstadoRuta.DESPACHADA);
    });

    it('cierra la ruta (COMPLETADA) únicamente cuando se entrega la última parada válida', async () => {
      await service.entregar('1', '101', 'usr-chofer', null);
      await service.entregar('1', '102', 'usr-chofer', null);

      // Entrega la 3ra y última parada
      const resParada3 = await service.entregar('1', '103', 'usr-chofer', 'Tercera entrega');

      expect(rutas['1'].estado).toBe(EstadoRuta.COMPLETADA);
      expect(rutas['1'].completadaEn).toBeInstanceOf(Date);
      expect(resParada3.estado).toBe(EstadoRuta.COMPLETADA);

      const parada103 = paradas.find((p) => p.id === '103');
      expect(rutas['1'].completadaEn).toEqual(parada103?.entregaActualizadaEn);
    });

    it('paradas anuladas no impiden el cierre si el resto de las paradas válidas se entregan', async () => {
      // Parada 102 queda ANULADA
      const parada102 = paradas.find((p) => p.id === '102')!;
      parada102.estado_entrega = EstadoEntrega.ANULADA;

      // Entregar parada 101 -> ruta sigue DESPACHADA (falta 103)
      await service.entregar('1', '101', 'usr-chofer', null);
      expect(rutas['1'].estado).toBe(EstadoRuta.DESPACHADA);

      // Entregar parada 103 -> todas las paradas válidas (101 y 103) están ENTREGADAS
      await service.entregar('1', '103', 'usr-chofer', null);
      expect(rutas['1'].estado).toBe(EstadoRuta.COMPLETADA);
      expect(rutas['1'].completadaEn).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // CA-04: Conservar autor y fecha; rechazar retrocesos y doble envío
  // ---------------------------------------------------------------------------
  describe('CA-04: Inmutabilidad de autor/fecha y prevención de concurrencia y retrocesos', () => {
    it('conserva fecha, usuario responsable y observación originales ante intentos de doble despacho', async () => {
      await service.despachar('1', 'usr-original', 'Observación original');
      const copiaOriginal = { ...rutas['1'] };

      // Intento de doble despacho concurrente o posterior
      await expect(service.despachar('1', 'usr-impostor', 'Nueva obs')).rejects.toThrow(
        'La ruta ya está en estado DESPACHADA',
      );

      expect(rutas['1'].despachadaPorUsuarioId).toBe('usr-original');
      expect(rutas['1'].despachoObservacion).toBe('Observación original');
      expect(rutas['1'].despachadaEn).toEqual(copiaOriginal.despachadaEn);
    });

    it('conserva fecha, usuario responsable y observación originales ante intentos de entrega duplicada', async () => {
      await service.despachar('1', 'usr-despacho', null);

      await service.entregar('1', '101', 'usr-chofer-1', 'Entrega original');
      const parada101Original = { ...paradas.find((p) => p.id === '101') };

      // Intento de registrar nuevamente la entrega ya completada
      await expect(service.entregar('1', '101', 'usr-chofer-2', 'Intento duplicado')).rejects.toThrow(
        'La entrega ya está en estado ENTREGADA',
      );

      const parada101Actual = paradas.find((p) => p.id === '101');
      expect(parada101Actual).toEqual(parada101Original);
    });

    it('rechaza cualquier retroceso de estado en la máquina de estados de ruta y entrega', () => {
      expect(() => validarTransicionRuta(EstadoRuta.COMPLETADA, EstadoRuta.DESPACHADA)).toThrow(
        ConflictException,
      );
      expect(() => validarTransicionRuta(EstadoRuta.DESPACHADA, EstadoRuta.PLANIFICADA)).toThrow(
        ConflictException,
      );
      expect(() =>
        validarTransicionEntrega(
          EstadoRuta.DESPACHADA,
          EstadoEntrega.ENTREGADA,
          EstadoEntrega.PENDIENTE,
        ),
      ).toThrow(ConflictException);
    });
  });

  // ---------------------------------------------------------------------------
  // CA-05: Transaccionalidad y rollback ante fallo de registro de eventos
  // ---------------------------------------------------------------------------
  describe('CA-05: Transaccionalidad y rollback atómico', () => {
    it('ejecuta registrarDespacho dentro de la misma transacción antes del commit', async () => {
      await service.despachar('1', 'usr-despachador', 'Con evento');

      expect(eventos.registrarDespacho).toHaveBeenCalledTimes(1);
      expect(eventos.registrarDespacho).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          rutaId: '1',
          fechaProgramada: '2026-11-15',
          vehiculoExternoId: 'VEH-101',
          choferExternoId: 'CHO-505',
          despachadaPorUsuarioId: 'usr-despachador',
          boletaIds: ['B-01', 'B-02', 'B-03', 'B-04'],
        }),
      );
    });

    it('aplica rollback completo si el registro de evento falla, conservando la ruta en PLANIFICADA', async () => {
      eventos.registrarDespacho.mockRejectedValueOnce(
        new Error('Fallo simulado al persistir en outbox'),
      );

      await expect(service.despachar('1', 'usr-despachador', 'Fallará')).rejects.toThrow(
        'Fallo simulado al persistir en outbox',
      );

      // Verificación de rollback íntegro
      expect(rutas['1'].estado).toBe(EstadoRuta.PLANIFICADA);
      expect(rutas['1'].despachadaEn).toBeNull();
      expect(rutas['1'].despachadaPorUsuarioId).toBeNull();
      expect(rutas['1'].despachoObservacion).toBeNull();
    });
  });
});
