import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { LotesProduccionClient } from './lotes-produccion.client';

describe('ABC-296: cliente de lotes de Producción', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => { global.fetch = fetchOriginal; });

  it('usa la ruta acordada, reenvía Bearer y devuelve el contrato', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: '1', codigo: 'L-1', ordenId: '8', ordenCodigo: 'ORD-7', productoId: '3', cantidad: '10.0000', fechaHora: '2026-10-13T00:00:00.000Z' }] }) as any;
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

  it('consulta una orden existente y rechaza un 404', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 8, codigo: 'ORD-7', producto_id: 3, producto: { codigo: 'P-3' } }) }) as any;
    await expect(new LotesProduccionClient().consultarOrdenPorId('8', 'Bearer token')).resolves.toMatchObject({ codigo: 'ORD-7' });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as any;
    await expect(new LotesProduccionClient().consultarOrdenPorId('99', 'Bearer token')).rejects.toThrow('Orden no encontrada');
  });

  it('consulta conformes filtrando el tipo real y rechaza formato inválido', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ cantidad: '12.5000' }] }) as any;
    await expect(new LotesProduccionClient().consultarConformesPorOrden('8', 'Bearer token')).resolves.toEqual([{ cantidad: '12.5000' }]);
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('/calidad/conformes/orden/8?tipo=CONFORME');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ cantidad: 'bad' }] }) as any;
    await expect(new LotesProduccionClient().consultarConformesPorOrden('8', 'Bearer token')).rejects.toThrow('formato inválido');
  });
});
