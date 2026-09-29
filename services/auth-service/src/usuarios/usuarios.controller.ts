import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';

import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { EstadoUsuarioDto } from './dto/estado-usuario.dto';
import { UsuariosService } from './usuarios.service';

import { JwtAuthGuard } from '../authz/jwt-auth.guard';
import { JwtPayload } from '../authz/jwt-payload.interface';
import { PermisosGuard } from '../authz/permisos.guard';
import { RequierePermiso } from '../authz/requiere-permiso.decorator';

interface RequestWithUser extends Request {
  user?: JwtPayload;
}

// El gateway elimina /api/auth; /api/auth/users llega aquí como /users.
@Controller('users')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@UseGuards(JwtAuthGuard, PermisosGuard)
@RequierePermiso('usuarios.gestionar')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  create(@Body() dto: CreateUsuarioDto, @Req() req: RequestWithUser) {
    return this.usuariosService.create(dto, req.user?.sub);
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
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
    @Req() req: RequestWithUser,
  ) {
    return this.usuariosService.update(id, dto, req.user?.sub);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: EstadoUsuarioDto,
    @Req() req: RequestWithUser,
  ) {
    return this.usuariosService.changeStatus(id, dto.activo, req.user?.sub);
  }

  @Delete(':id')
  softDelete(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.usuariosService.softDelete(id, req.user?.sub);
  }
}
