import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rol } from '../roles/entities/role.entity';
import { JwtPayload } from './jwt-payload.interface';
import { REQUIERE_PERMISO_KEY } from './requiere-permiso.decorator';

// Debe usarse DESPUÉS de JwtAuthGuard: @UseGuards(JwtAuthGuard, PermisosGuard).
// - Sin @RequierePermiso en el endpoint → deja pasar.
// - Con @RequierePermiso → exige rolId en request.user y que ese rol tenga el
//   permiso activo (permisos.activo = true) con ese código.
// - En caso contrario, 403 genérico sin revelar qué permiso faltaba.
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Rol)
    private readonly rolRepository: Repository<Rol>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const codigo = this.reflector.getAllAndOverride<string>(
      REQUIERE_PERMISO_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!codigo) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const usuario = request.user as JwtPayload | undefined;

    if (!usuario?.rolId) {
      throw new ForbiddenException(
        'No tiene permisos para realizar esta acción',
      );
    }

    const rol = await this.rolRepository.findOne({
      where: { id: usuario.rolId as unknown as string },
      relations: { permisos: true },
    });

    const tienePermiso = (rol?.permisos ?? []).some(
      (permiso) => permiso.codigo === codigo && permiso.activo === true,
    );

    if (!tienePermiso) {
      throw new ForbiddenException(
        'No tiene permisos para realizar esta acción',
      );
    }

    return true;
  }
}
