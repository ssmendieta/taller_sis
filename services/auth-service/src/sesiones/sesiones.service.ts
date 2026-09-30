import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sesion } from './entities/sesion.entity';

export function minutosInactividad(
  env: Record<string, string | undefined> = process.env,
): number {
  const valor = Number(env.SESION_INACTIVIDAD_MINUTOS ?? 15);
  return Number.isFinite(valor) && valor > 0 ? valor : 15;
}

@Injectable()
export class SesionesService {
  constructor(
    @InjectRepository(Sesion)
    private readonly sesiones: Repository<Sesion>,
  ) {}

  async crear(jti: string, usuarioId: string | number): Promise<void> {
    await this.sesiones.save(
      this.sesiones.create({ jti, usuario_id: String(usuarioId) }),
    );
  }

  async validarYRefrescar(
    jti: string,
    usuarioId: string | number,
  ): Promise<void> {
    const sesion = await this.sesiones.findOne({ where: { jti } });
    if (!sesion || String(sesion.usuario_id) !== String(usuarioId)) {
      throw new UnauthorizedException('La sesión no es válida');
    }
    if (sesion.revocada_en) {
      throw new UnauthorizedException('La sesión fue cerrada');
    }
    const limite =
      Date.now() - minutosInactividad() * 60 * 1000;
    if (new Date(sesion.ultima_actividad).getTime() < limite) {
      throw new UnauthorizedException('La sesión expiró por inactividad');
    }
    await this.sesiones.update(
      { jti },
      { ultima_actividad: new Date() },
    );
  }

  async revocar(jti: string, usuarioId?: string | number): Promise<boolean> {
    const sesion = await this.sesiones.findOne({ where: { jti } });
    if (!sesion) return false;
    if (
      usuarioId !== undefined &&
      String(sesion.usuario_id) !== String(usuarioId)
    ) {
      return false;
    }
    if (sesion.revocada_en) return true;
    await this.sesiones.update({ jti }, { revocada_en: new Date() });
    return true;
  }
}
