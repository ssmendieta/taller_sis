import { HealthController } from './health.controller';

describe('ABC-271: estado base de Logística', () => {
  it('devuelve un estado correcto con una fecha válida', () => {
    const respuesta = new HealthController().check();

    expect(respuesta.service).toBe('logistica-service');
    expect(respuesta.status).toBe('ok');
    expect(Number.isNaN(Date.parse(respuesta.timestamp))).toBe(false);
  });
});
