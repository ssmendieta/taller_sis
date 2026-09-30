import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

type IdentidadAuth = { id: string };

// Guard de solo sesión: exige un token que Auth valide en GET /me, sin mirar
// rol ni permisos. Los permisos concretos se revisan con PermisoProduccionGuard.
// Evita que los endpoints de recetas, materiales e inventario queden abiertos
// a cualquiera que llegue directo al servicio.
@Injectable()
export class SesionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      usuarioId?: number;
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
      throw new ServiceUnavailableException(
        'No se pudo comprobar la sesión con Auth',
      );
    }

    if (respuesta.status === 401) {
      throw new UnauthorizedException('La sesión no es válida');
    }
    if (respuesta.status === 403) {
      throw new UnauthorizedException('La sesión no es válida');
    }
    if (!respuesta.ok) {
      throw new ServiceUnavailableException(
        'Auth no pudo comprobar la sesión',
      );
    }

    let identidad: IdentidadAuth;
    try {
      identidad = (await respuesta.json()) as IdentidadAuth;
    } catch {
      throw new ServiceUnavailableException('Auth devolvió una respuesta inválida');
    }

    const usuarioId = Number(identidad?.id);
    if (!Number.isSafeInteger(usuarioId) || usuarioId < 1) {
      throw new UnauthorizedException('La sesión no es válida');
    }

    request.usuarioId = usuarioId;
    return true;
  }
}
