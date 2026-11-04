import { UnauthorizedException } from '@nestjs/common';
import { minutosInactividad, SesionesService } from './sesiones.service';

function crearServicio(fila: any) {
  const repo: any = {
    findOne: async () => fila,
    save: async (v: any) => v,
    create: (v: any) => v,
    update: async () => undefined,
  };
  return new SesionesService(repo);
}

describe('ABC-177: sesiones en servidor', () => {
  it('rechaza sesiones revocadas', async () => {
    const servicio = crearServicio({
      jti: 'a',
      usuario_id: '3',
      ultima_actividad: new Date(),
      revocada_en: new Date(),
    });
    await expect(servicio.validarYRefrescar('a', '3')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza sesiones vencidas por inactividad', async () => {
    const vieja = new Date(Date.now() - 16 * 60 * 1000);
    const servicio = crearServicio({
      jti: 'a',
      usuario_id: '3',
      ultima_actividad: vieja,
      revocada_en: null,
    });
    await expect(servicio.validarYRefrescar('a', '3')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('acepta sesiones activas y respeta el límite parametrizable', async () => {
    expect(minutosInactividad({})).toBe(15);
    expect(minutosInactividad({ SESION_INACTIVIDAD_MINUTOS: '1' })).toBe(1);
    const servicio = crearServicio({
      jti: 'a',
      usuario_id: '3',
      ultima_actividad: new Date(),
      revocada_en: null,
    });
    await expect(
      servicio.validarYRefrescar('a', '3'),
    ).resolves.toBeUndefined();
  });
});
