import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PERMISO_LOGISTICA = 'permiso_logistica';
type PermisoAuth = string | { codigo: string };
type IdentidadAuth = { id: string; permisos: PermisoAuth[] };
type RequestAutenticada = {
  headers: { authorization?: string };
  usuarioId?: string;
};

@Injectable()
export class PermisoLogisticaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestAutenticada>();
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }

    const base = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
    let response: Response;
    try {
      response = await fetch(new URL('me', base.replace(/\/?$/, '/')), {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException('No se pudo comprobar la sesión con Auth');
    }

    if (response.status === 401) throw new UnauthorizedException('La sesión no es válida');
    if (response.status === 403) throw new ForbiddenException('No tiene permisos para esta operación');
    if (!response.ok) throw new ServiceUnavailableException('Auth no pudo comprobar la sesión');

    let identity: IdentidadAuth;
    try {
      identity = await response.json() as IdentidadAuth;
    } catch {
      throw new ServiceUnavailableException('Auth devolvió una respuesta inválida');
    }

    if (!identity || typeof identity.id !== 'string' || !/^\d+$/.test(identity.id) ||
        BigInt(identity.id) < BigInt('1') || BigInt(identity.id) > BigInt('9223372036854775807') ||
        !Array.isArray(identity.permisos) || identity.permisos.some((permission) =>
          typeof permission !== 'string' &&
          (!permission || typeof permission !== 'object' || typeof permission.codigo !== 'string' || !permission.codigo.trim()),
        )) {
      throw new ServiceUnavailableException('Auth devolvió una identidad incompleta');
    }
    const requiredPermission = this.reflector.get<string>(PERMISO_LOGISTICA, context.getHandler());
    if (!requiredPermission) throw new ServiceUnavailableException('La ruta no tiene un permiso configurado');
    const permissions = identity.permisos.map((permission) =>
      typeof permission === 'string' ? permission : permission?.codigo,
    );
    if (!permissions.includes(requiredPermission)) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }

    request.usuarioId = identity.id;
    return true;
  }
}
