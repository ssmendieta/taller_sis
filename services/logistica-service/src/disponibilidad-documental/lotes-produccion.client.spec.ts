import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { LotesProduccionClient } from './lotes-produccion.client';

describe('ABC-296: cliente de lotes de Producción', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => { global.fetch = fetchOriginal; });

  it('usa la ruta acordada, reenvía Bearer y devuelve el contrato', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: '1', codigo: 'L-1', ordenId: '8', ordenCodigo: 'ORD-7', cantidad: '10.0000', fechaHora: '2026-10-13T00:00:00.000Z' }] }) as any;
    const result = await new LotesProduccionClient().consultarPorOrden('ORD-7', 'Bearer token');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain('http://localhost:3002/lotes/orden/ORD-7');
    expect(options.headers.Authorization).toBe('Bearer token');
    expect(result[0].codigo).toBe('L-1');
  });

  it('distingue caída de Producción y respuesta inválida', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any;
    await expect(new LotesProduccionClient().consultarPorOrden('ORD-7', 'Bearer token')).rejects.toBeInstanceOf(ServiceUnavailableException);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ invalid: true }) }) as any;
    await expect(new LotesProduccionClient().consultarPorOrden('ORD-7', 'Bearer token')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
