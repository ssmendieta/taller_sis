import { AppController } from './app.controller';

describe('ABC-271: endpoint base de Logística', () => {
  it('informa que el servicio está disponible', () => {
    const controller = new AppController();

    expect(controller.root()).toEqual({
      message: 'logistica-service running',
      health: '/health',
    });
  });
});
