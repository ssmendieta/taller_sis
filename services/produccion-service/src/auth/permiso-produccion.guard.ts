import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

type PermisoAuth = string | { codigo: string };
type IdentidadAuth = {
  id: string;
  rol: string;
  nombre_completo?: string | null;
  permisos: PermisoAuth[];
};
export const PERMISO_PRODUCCION = 'permiso_produccion';

@Injectable()
export class PermisoProduccionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      body?: { nuevoEstado?: string };
      usuarioId?: number;
      usuarioNombre?: string | null;
      usuarioAutenticado?: { sub: number; rolNombre: string; nombre?: string | null };
    }>();
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }

    const base = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
    let respuesta: Response;
    try {
      respuesta = await fetch(new URL('me', base.replace(/\/?$/, '/')), {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException('No se pudo comprobar la sesión con Auth');
    }
    if (respuesta.status === 401) throw new UnauthorizedException('La sesión no es válida');
    if (respuesta.status === 403) throw new ForbiddenException('No tiene permisos para esta operación');
    if (!respuesta.ok) throw new ServiceUnavailableException('Auth no pudo comprobar la sesión');

    let identidad: IdentidadAuth;
    try {
      identidad = await respuesta.json() as IdentidadAuth;
    } catch {
      throw new ServiceUnavailableException('Auth devolvió una respuesta inválida');
    }
    const usuarioId = Number(identidad?.id);
    if (!Number.isSafeInteger(usuarioId) || usuarioId < 1 ||
        !Array.isArray(identidad.permisos)) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }
    const codigos = identidad.permisos.map((p) =>
      typeof p === 'string' ? p : p?.codigo,
    );

    let permiso = this.reflector.get<string>(PERMISO_PRODUCCION, context.getHandler());
    if (!permiso) throw new ForbiddenException('No hay permiso configurado para esta ruta');
    if (permiso === 'ordenes.cambiar_estado') {
      if (request.body?.nuevoEstado === 'EN_PRODUCCION') permiso = 'ordenes.iniciar';
      if (['FINALIZADA', 'CANCELADA'].includes(request.body?.nuevoEstado ?? '')) {
        permiso = 'ordenes.finalizar_cancelar';
      }
    }
    if (!codigos.includes(permiso)) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }
    request.usuarioId = usuarioId;
    const nombre = typeof identidad.nombre_completo === 'string' && identidad.nombre_completo.trim()
      ? identidad.nombre_completo.trim()
      : null;
    request.usuarioNombre = nombre;
    request.usuarioAutenticado = { sub: usuarioId, rolNombre: identidad.rol, nombre };
    return true;
  }
}
