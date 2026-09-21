import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';


@Controller('usuarios')
export class UsersController {

  constructor(
    private readonly usersService: UsersService
  ) {}


  @Get()
  findAll() {
    return this.usersService.findAll();
  }


  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(Number(id));
  }


  @Post()
  create(@Body() dto: CreateUserDto) {
    console.log(dto);
    return this.usersService.create(dto);
  }


  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: any
  ) {
    return this.usersService.update(Number(id), data);
  }


  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(Number(id));
  }

}