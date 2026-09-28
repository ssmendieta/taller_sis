import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../authz/jwt-auth.guard';
import { PermisosGuard } from '../authz/permisos.guard';
import { RequierePermiso } from '../authz/requiere-permiso.decorator';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { EstadoUsuarioDto } from './dto/estado-usuario.dto';
import { UsuariosService } from './usuarios.service';

// El gateway elimina /api/auth; /api/auth/users llega aquí como /users.
@Controller('users')
@UseGuards(JwtAuthGuard, PermisosGuard)
@RequierePermiso('usuarios.gestionar')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  create(@Body() dto: CreateUsuarioDto, @Req() request: { user: { sub: string | number } }) {
    return this.usuariosService.create(dto, String(request.user.sub));
  }

  @Get()
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get('roles-disponibles')
  rolesDisponibles() {
    return this.usuariosService.rolesDisponibles();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usuariosService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUsuarioDto, @Req() request: { user: { sub: string | number } }) {
    return this.usuariosService.update(id, dto, String(request.user.sub));
  }

  @Patch(':id/status')
  changeStatus(@Param('id') id: string, @Body() dto: EstadoUsuarioDto, @Req() request: { user: { sub: string | number } }) {
    return this.usuariosService.changeStatus(id, dto.activo, String(request.user.sub));
  }

  @Delete(':id')
  softDelete(@Param('id') id: string, @Req() request: { user: { sub: string | number } }) {
    return this.usuariosService.softDelete(id, String(request.user.sub));
  }
}
