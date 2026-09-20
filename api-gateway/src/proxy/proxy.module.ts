import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';

@Module({})
export class ProxyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const authTarget = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
    const prodTarget = process.env.PRODUCCION_SERVICE_URL || 'http://localhost:3002';
    const logiTarget = process.env.LOGISTICA_SERVICE_URL || 'http://localhost:3003';

    consumer
      .apply(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createProxyMiddleware({
          target: authTarget,
          changeOrigin: true,
          pathRewrite: { '^/api/auth': '' },
          logLevel: 'warn',
        }) as any,
      )
      .forRoutes('api/auth');

    consumer
      .apply(
        createProxyMiddleware({
          target: prodTarget,
          changeOrigin: true,
          pathRewrite: { '^/api/produccion': '' },
          logLevel: 'warn',
        }) as any,
      )
      .forRoutes('api/produccion');

    consumer
      .apply(
        createProxyMiddleware({
          target: logiTarget,
          changeOrigin: true,
          pathRewrite: { '^/api/logistica': '' },
          logLevel: 'warn',
        }) as any,
      )
      .forRoutes('api/logistica');
  }
}
