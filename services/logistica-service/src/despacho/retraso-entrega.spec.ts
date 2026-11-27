import { BadRequestException } from '@nestjs/common';
import { RetrasoEntregaParada1710000000017 } from '../database/migrations/1710000000017-RetrasoEntregaParada';
import { ValidarEntregaPipe } from './dto/validar-observacion.pipe';
import { diferenciaMinutos, limiteEntrega, umbralRetraso } from './retraso-entrega';

describe('ABC-524: diferencia con la hora programada y umbral de retraso', () => {
  it('la hora programada es el fin del día en Bolivia (00:00 del día siguiente, UTC-4)', () => {
    expect(limiteEntrega('2026-11-10').toISOString()).toBe('2026-11-11T04:00:00.000Z');
  });

  it.each([
    ['a tiempo, la tarde del mismo día', '2026-11-10T19:30:00.000Z', -510],
    ['justo en el límite', '2026-11-11T04:00:00.000Z', 0],
    ['30 segundos tarde cuenta como 1 min', '2026-11-11T04:00:30.000Z', 1],
    ['45 min tarde', '2026-11-11T04:45:00.000Z', 45],
  ])('%s', (_caso, entregada, esperado) => {
    expect(diferenciaMinutos(new Date(entregada), '2026-11-10')).toBe(esperado);
  });

  it('el umbral es 30 min por defecto y se configura con ENTREGA_UMBRAL_RETRASO_MINUTOS', () => {
    expect(umbralRetraso({})).toBe(30);
    expect(umbralRetraso({ ENTREGA_UMBRAL_RETRASO_MINUTOS: '45' })).toBe(45);
    expect(umbralRetraso({ ENTREGA_UMBRAL_RETRASO_MINUTOS: 'abc' })).toBe(30);
  });

  it('la entrega acepta motivoRetraso y sigue rechazando otros campos', () => {
    const pipe = new ValidarEntregaPipe();
    expect(pipe.transform({ observacion: ' ok ', motivoRetraso: ' Tráfico ' })).toEqual({ observacion: 'ok', motivoRetraso: 'Tráfico' });
    expect(pipe.transform(undefined)).toEqual({ observacion: null, motivoRetraso: null });
    expect(() => pipe.transform({ motivoRetraso: 5 })).toThrow(BadRequestException);
    expect(() => pipe.transform({ fecha: 'x' })).toThrow('Campos no permitidos: fecha');
  });

  it('la migración agrega y quita la diferencia y el motivo', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migracion = new RetrasoEntregaParada1710000000017();
    await migracion.up({ query } as any);
    expect(query.mock.calls[0][0]).toContain('ADD COLUMN diferencia_minutos INTEGER NULL');
    expect(query.mock.calls[0][0]).toContain('ADD COLUMN motivo_retraso VARCHAR(500) NULL');
    query.mockClear();
    await migracion.down({ query } as any);
    expect(query.mock.calls[0][0]).toContain('DROP COLUMN diferencia_minutos');
  });
});
