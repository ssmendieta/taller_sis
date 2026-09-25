import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/roles.decorator';



@Injectable()
export class RolesGuard implements CanActivate {


  constructor(
    private reflector: Reflector,
  ) {}



  canActivate(
    context: ExecutionContext,
  ): boolean {


    const roles =
      this.reflector.get<string[]>(
        ROLES_KEY,
        context.getHandler(),
      );



    // Si no tiene restricción de roles
    // permite acceso
    if (!roles) {

      return true;

    }



    const request =
      context.switchToHttp()
      .getRequest();



    // Por ahora tomamos el rol
    // desde el header
    const userRole =
      request.headers['x-role'];



    if (!userRole) {

      throw new ForbiddenException(
        'No se proporcionó rol de usuario'
      );

    }



    if (!roles.includes(
      userRole.toUpperCase()
    )) {


      throw new ForbiddenException(
        'No tienes permisos para acceder a este recurso'
      );


    }



    return true;

  }


}