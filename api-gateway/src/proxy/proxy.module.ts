import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Module({})
export class ProxyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(async (req: Request, res: Response, next: NextFunction) => {
      if (!req.path.startsWith('/api/auth')) {
        return next();
      }

      try {
        const body = req.body;

        const respuesta = await fetch('http://auth-service:3001/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        const datos = await respuesta.text();

        res.status(respuesta.status).send(datos);
      } catch (error) {
        console.error('Error conectando con auth-service:', error);
        res.status(502).json({
          message: 'No se pudo conectar con el servicio de autenticación',
        });
      }
    }).forRoutes('*');
  }
}