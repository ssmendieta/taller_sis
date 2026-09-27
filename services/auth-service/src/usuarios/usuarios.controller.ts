import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UsePipes, ValidationPipe } from '@nestjs/common';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { EstadoUsuarioDto } from './dto/estado-usuario.dto';
import { UsuariosService } from './usuarios.service';

// El gateway elimina /api/auth; /api/auth/users llega aquí como /users.
@Controller('users')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  create(@Body() dto: CreateUsuarioDto) {
    return this.usuariosService.create(dto);
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
  update(@Param('id') id: string, @Body() dto: UpdateUsuarioDto) {
    return this.usuariosService.update(id, dto);
  }

  @Patch(':id/status')
  changeStatus(@Param('id') id: string, @Body() dto: EstadoUsuarioDto) {
    return this.usuariosService.changeStatus(id, dto.activo);
  }

  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.usuariosService.softDelete(id);
  }
}
