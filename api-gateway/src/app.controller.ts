import { Body, Controller, Get, Post } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return { message: 'API Gateway funcionando' };
  }

  @Post('api/auth/login')
  async login(@Body() body: { correo: string; password: string }) {
    const respuesta = await fetch('http://auth-service:3001/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const datos = await respuesta.json();

    return datos;
  }
}