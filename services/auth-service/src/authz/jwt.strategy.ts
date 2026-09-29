import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET no esta configurado. Definelo en el entorno (.env / docker-compose).',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const id = String(payload.sub);
    if (!/^[1-9]\d*$/.test(id)) throw new UnauthorizedException();
    const usuario = await this.usuarios.findOne({ where: { id } });
    if (!usuario || !usuario.activo || usuario.eliminado_en || !usuario.rol_id) {
      throw new UnauthorizedException('La sesión ya no está activa');
    }
    return {
      sub: usuario.id,
      correo: usuario.correo,
      rolId: usuario.rol_id,
    };
  }
}
