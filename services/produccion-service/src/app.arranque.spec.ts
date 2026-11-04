import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

// Prueba de arranque real: detecta errores de inyección al compilar el
// módulo completo contra PostgreSQL real.
// Solo corre con ARRANQUE_REAL=1 (verificación contra servicios levantados).
const describeReal = process.env.ARRANQUE_REAL ? describe : describe.skip;

describeReal('ABC-190: arranque real del produccion-service', () => {
  it('compila AppModule sin errores de dependencias', async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = modulo.createNestApplication();
    await app.init();
    expect(app).toBeDefined();
    await app.close();
  }, 60000);
});
