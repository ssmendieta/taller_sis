import { BadGatewayException } from '@nestjs/common';

/**
 * Las cantidades documentales se guardan como NUMERIC(14,4). Para sumar y
 * comparar sin perder precisión se trabaja con enteros escalados x10000.
 */
export const ESCALA_CANTIDAD = BigInt('10000');

/**
 * Convierte una cantidad decimal textual ("12.5000") a su entero escalado.
 * Rechaza cualquier texto que no sea un decimal positivo con hasta cuatro decimales.
 */
export function escalarCantidad(
  cantidad: string,
  mensajeError = 'Cantidad documental inválida',
): bigint {
  if (typeof cantidad !== 'string' || !/^\d+(?:\.\d{1,4})?$/.test(cantidad)) {
    throw new BadGatewayException(mensajeError);
  }
  const [entero, decimales = ''] = cantidad.split('.');
  return BigInt(entero) * ESCALA_CANTIDAD + BigInt(decimales.padEnd(4, '0'));
}

/** Formatea un entero escalado como decimal con cuatro decimales ("40.0000"). */
export function formatearCantidad(valor: bigint): string {
  const negativo = valor < BigInt('0');
  const absoluto = negativo ? -valor : valor;
  const texto = absoluto.toString().padStart(5, '0');
  const entero = texto.slice(0, -4) || '0';
  const resultado = `${entero}.${texto.slice(-4)}`;
  return negativo ? `-${resultado}` : resultado;
}
