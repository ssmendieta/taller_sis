import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare } from 'bcryptjs';
import { Repository } from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity';
import { LoginDto } from './dto/login.dto';

export interface UsuarioParaAuth {
  id: number;
  correo: string;
  password_hash: string;
  activo: boolean;
  eliminado_en: Date | string | null;
  rol_id?: number | null;
  nombre_completo?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  async login(dto: LoginDto) {
    const correo = dto.correo.trim().toLowerCase();

    const usuario = await this.buscarUsuarioParaAuth(correo);

    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (usuario.activo === false) {
      throw new ForbiddenException('La cuenta se encuentra desactivada');
    }

    if (usuario.eliminado_en !== null && usuario.eliminado_en !== undefined) {
      throw new ForbiddenException('La cuenta se encuentra desactivada');
    }

    const coincide = await compare(dto.password, usuario.password_hash);
    if (!coincide) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload: Record<string, unknown> = {
      sub: usuario.id,
      correo: usuario.correo,
    };
    if (usuario.rol_id !== null && usuario.rol_id !== undefined) {
      payload.rolId = usuario.rol_id;
    }

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      usuario: {
        id: usuario.id,
        correo: usuario.correo,
      },
    };
  }


  // Consulta ORM parametrizada (sin SQL concatenado), insensible a
  // mayusculas para aprovechar el indice ux_usuarios_correo_ci.
  private async buscarUsuarioParaAuth(
    correoNormalizado: string,
  ): Promise<UsuarioParaAuth | null> {
    const usuario = await this.usuarios
      .createQueryBuilder('u')
      .addSelect('u.password_hash')
      .where('LOWER(u.correo) = :correo', { correo: correoNormalizado })
      .getOne();
    if (!usuario) {
      return null;
    }
    return {
      id: usuario.id,
      correo: usuario.correo,
      password_hash: usuario.password_hash,
      activo: usuario.activo,
      eliminado_en: usuario.eliminado_en,
      rol_id: usuario.rol_id,
      nombre_completo: usuario.nombre_completo,
    };
  }
}
