import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authz/jwt-auth.guard';
import { PermisosGuard } from '../authz/permisos.guard';
import { RequierePermiso } from '../authz/requiere-permiso.decorator';
import type { JwtPayload } from '../authz/jwt-payload.interface';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReemplazarPermisosRolDto } from './dto/reemplazar-permisos-rol.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermisosGuard)
@RequierePermiso('roles_permisos.gestionar')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  create(
    @Body() dto: CreateRoleDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.rolesService.create(dto, req.user?.sub ?? null);
  }

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.rolesService.update(id, dto, req.user?.sub ?? null);
  }

  @Put(':id/permisos')
  reemplazarPermisos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReemplazarPermisosRolDto,
    @Req() req: { user: JwtPayload },
  ) {
    return this.rolesService.reemplazarPermisos(
      id,
      dto.permisoIds ?? [],
      req.user?.sub ?? null,
    );
  }

  @Delete(':id')
  remove() {
    return this.rolesService.remove();
  }
}
