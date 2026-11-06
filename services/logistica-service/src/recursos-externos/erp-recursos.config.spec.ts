import { loadErpRecursosConfig } from './clientes/erp-recursos.config';

describe('ABC-351: configuración del cliente del ERP de recursos', () => {
  it('usa los valores por defecto del contrato sin URL ni token', () => {
    expect(loadErpRecursosConfig({})).toEqual({ url: null, token: null, timeoutMs: 3000, reintentos: 2, esperaReintentoMs: 200 });
  });

  it('lee URL, token, timeout y reintentos del entorno', () => {
    expect(loadErpRecursosConfig({
      ERP_RECURSOS_URL: ' http://erp-simulado:4100 ', ERP_RECURSOS_TOKEN: ' abc ',
      ERP_RECURSOS_TIMEOUT_MS: '1500', ERP_RECURSOS_REINTENTOS: '0', ERP_RECURSOS_ESPERA_REINTENTO_MS: '50',
    })).toEqual({ url: 'http://erp-simulado:4100', token: 'abc', timeoutMs: 1500, reintentos: 0, esperaReintentoMs: 50 });
  });

  it.each([
    ['ERP_RECURSOS_URL', 'ftp://erp'],
    ['ERP_RECURSOS_TIMEOUT_MS', '50'],
    ['ERP_RECURSOS_TIMEOUT_MS', '1.5'],
    ['ERP_RECURSOS_REINTENTOS', '4'],
    ['ERP_RECURSOS_REINTENTOS', '-1'],
    ['ERP_RECURSOS_ESPERA_REINTENTO_MS', 'rapido'],
  ])('rechaza %s=%s', (nombre, valor) => {
    expect(() => loadErpRecursosConfig({ [nombre]: valor })).toThrow(nombre);
  });
});
