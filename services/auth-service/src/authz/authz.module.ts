import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rol } from '../roles/entities/role.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermisosGuard } from './permisos.guard';

// Módulo reutilizable de autorización (ABC-151).
//
// Uso desde otro controller del propio auth-service:
//
//   import { UseGuards } from '@nestjs/common';
//   import {
//     JwtAuthGuard,
//     PermisosGuard,
//     RequierePermiso,
//   } from '../authz/authz.module';
//
//   @UseGuards(JwtAuthGuard, PermisosGuard)
//   @RequierePermiso('ordenes.cambiar_estado')
//   @Patch(':id/estado')
//   cambiarEstado(...) { ... }
//
// NOTA: la propagación a produccion-service y logistica-service queda fuera
// de esta tarea: son procesos Nest aparte y cada uno deberá validar el JWT
// con el mismo JWT_SECRET por su cuenta. La integración del permiso
// 'ordenes.cambiar_estado' con el endpoint de ABC-148 es una tarea aparte
// de coordinación entre servicios.
@Module({
  imports: [TypeOrmModule.forFeature([Rol, Usuario])],
  providers: [JwtStrategy, JwtAuthGuard, PermisosGuard],
  exports: [JwtAuthGuard, PermisosGuard],
})
export class AuthzModule {}
