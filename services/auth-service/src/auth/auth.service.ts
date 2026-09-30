import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare } from 'bcryptjs';
import { Repository } from 'typeorm';

import { Usuario } from '../usuarios/entities/usuario.entity';
import { Rol } from '../roles/entities/role.entity';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../authz/jwt-payload.interface';

export interface UsuarioParaAuth {
  id: string;
  correo: string;
  password_hash: string;
  activo: boolean;
  eliminado_en: Date | string | null;
  rol_id: string | null;
  nombre_completo?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,

    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,

    @InjectRepository(Rol)
    private readonly roles: Repository<Rol>,
  ) {}

  async login(dto: LoginDto) {
    const correo = dto.correo.trim().toLowerCase();

    const usuario = await this.buscarUsuarioParaAuth(correo);
    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!usuario.activo) {
      throw new ForbiddenException('La cuenta se encuentra desactivada');
    }

    if (usuario.eliminado_en !== null && usuario.eliminado_en !== undefined) {
      throw new ForbiddenException('La cuenta se encuentra desactivada');
    }

    if (!usuario.rol_id) {
      throw new ForbiddenException('El usuario no tiene un rol asignado en el sistema');
    }

    const rolAsignado = await this.roles.findOne({
      where: { id: usuario.rol_id },
      relations: ['permisos'],
    });

    if (!rolAsignado) {
      throw new ForbiddenException('El rol asignado al usuario no existe');
    }
    if (rolAsignado.activo === false) {
      throw new ForbiddenException('El rol asignado está desactivado');
    }

    const coincide = await compare(dto.password, usuario.password_hash);
    if (!coincide) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const permisos = (rolAsignado.permisos ?? []).filter((permiso) => permiso.activo);

    const payload = {
      sub: usuario.id,
      correo: usuario.correo,
      rolId: usuario.rol_id,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      usuario: {
        id: usuario.id,
        correo: usuario.correo,
        nombre_completo: usuario.nombre_completo ?? null,
        rol: {
          id: rolAsignado.id,
          nombre: rolAsignado.nombre,
        },
        permisos: permisos.map((permiso) => ({
          id: permiso.id,
          codigo: permiso.codigo,
          nombre: permiso.nombre,
        })),
      },
    };
  }

  // Auth conserva la fuente de verdad sobre el usuario y sus permisos actuales.
  // Producción consulta este endpoint protegido antes de efectuar una operación.
  async sesionActual(usuario: JwtPayload) {
    const rol = await this.roles.findOne({
      where: { id: String(usuario.rolId) },
      relations: ['permisos'],
    });
    if (!rol || !rol.activo) {
      throw new ForbiddenException('El rol asignado ya no está disponible');
    }
    const titular = await this.usuarios.findOne({
      where: { id: String(usuario.sub) },
    });
    return {
      id: String(usuario.sub),
      correo: titular?.correo ?? String(usuario.correo ?? ''),
      nombre_completo: titular?.nombre_completo ?? null,
      rol: rol.nombre,
      permisos: (rol.permisos ?? [])
        .filter((permiso) => permiso.activo)
        .map((permiso) => ({
          id: permiso.id,
          codigo: permiso.codigo,
          nombre: permiso.nombre,
        })),
    };
  }

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
