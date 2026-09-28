import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';


@Module({})
export class ProxyModule implements NestModule {


  configure(consumer: MiddlewareConsumer) {


    const authTarget =
      process.env.AUTH_SERVICE_URL ||
      'http://localhost:3001';


    const prodTarget =
      process.env.PRODUCCION_SERVICE_URL ||
      'http://localhost:3002';


    const logiTarget =
      process.env.LOGISTICA_SERVICE_URL ||
      'http://localhost:3003';





    // =========================
    // AUTH SERVICE
    // =========================

    consumer
      .apply(

        createProxyMiddleware({

          target: authTarget,

          changeOrigin: true,

          pathRewrite: {
            '^/api/auth': '',
          },

          logLevel: 'debug',

        }) as any,

      )
      .forRoutes('api/auth');







    // =========================
    // PRODUCCION SERVICE
    // =========================

    consumer
      .apply(

        createProxyMiddleware({

          target: prodTarget,

          changeOrigin: true,


          pathRewrite: {
            '^/api/produccion': '',
          },


          logLevel: 'debug',



          onProxyReq(
            proxyReq: any,
            req: any,
          ) {

            console.log(
              '➡️ PROXY PRODUCCION:',
              req.method,
              req.url
            );

          },



          onProxyRes(
            proxyRes: any,
            req: any,
          ) {

            console.log(
              '⬅️ RESPUESTA PRODUCCION:',
              proxyRes.statusCode,
              req.url
            );

          },



          onError(
            error: any,
            req: any,
          ) {

            console.error(
              '❌ ERROR PROXY PRODUCCION:',
              error.message
            );

          },


        }) as any,

      )
      .forRoutes('api/produccion');








    // =========================
    // LOGISTICA SERVICE
    // =========================

    consumer
      .apply(

        createProxyMiddleware({

          target: logiTarget,

          changeOrigin: true,

          pathRewrite: {
            '^/api/logistica': '',
          },

          logLevel: 'debug',

        }) as any,

      )
      .forRoutes('api/logistica');


  }

}