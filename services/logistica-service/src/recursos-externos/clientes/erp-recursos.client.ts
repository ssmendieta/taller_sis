import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  ErpRecursosNoDisponibleError,
  MotivoFalloErpRecursos,
  RUTA_ERP_RECURSOS_V1,
  RespuestaRecursosErpV1,
  motivoPorEstadoHttp,
} from '../dto/recursos-logisticos-v1';
import {
  RespuestaRecursosV1InvalidaError,
  esFechaValida,
  validarRespuestaRecursosV1,
} from '../dto/recursos-logisticos-v1.validator';
import { ERP_RECURSOS_CONFIG, ErpRecursosConfig } from './erp-recursos.config';

export const ESPERA_ERP_RECURSOS = Symbol('ESPERA_ERP_RECURSOS');
export type EsperaErpRecursos = (ms: number) => Promise<void>;

const esperarPorDefecto: EsperaErpRecursos = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Timeout, red caída y HTTP 5xx pueden recuperarse; el resto falla en el primer intento.
const TRANSITORIOS: MotivoFalloErpRecursos[] = ['TIMEOUT', 'NO_DISPONIBLE'];

function esCorte(error: unknown): boolean {
  const nombre = (error as { name?: string })?.name;
  return nombre === 'TimeoutError' || nombre === 'AbortError';
}

// ABC-351: cliente HTTP del contrato recursos-logisticos v1 (ABC-350). Solo
// devuelve respuestas validadas; cualquier fallo lanza ErpRecursosNoDisponibleError
// para que nunca se presente como disponibilidad confirmada.
@Injectable()
export class ErpRecursosClient {
  private readonly logger = new Logger(ErpRecursosClient.name);

  constructor(
    @Inject(ERP_RECURSOS_CONFIG) private readonly config: ErpRecursosConfig,
    @Optional() @Inject(ESPERA_ERP_RECURSOS) private readonly esperar: EsperaErpRecursos = esperarPorDefecto,
  ) {}

  async consultarRecursos(fecha: string): Promise<RespuestaRecursosErpV1> {
    if (!esFechaValida(fecha)) throw new BadRequestException('La fecha debe ser una fecha AAAA-MM-DD válida');
    if (!this.config.url) throw new ErpRecursosNoDisponibleError('NO_DISPONIBLE', 'ERP_RECURSOS_URL no configurada');
    if (!this.config.token) throw new ErpRecursosNoDisponibleError('CREDENCIALES', 'ERP_RECURSOS_TOKEN no configurado');

    const url = new URL(`${RUTA_ERP_RECURSOS_V1.slice(1)}?fecha=${encodeURIComponent(fecha)}`, this.config.url.replace(/\/?$/, '/'));
    const intentos = this.config.reintentos + 1;

    for (let intento = 1; ; intento++) {
      try {
        return await this.consultarUnaVez(url, fecha);
      } catch (error) {
        if (!(error instanceof ErpRecursosNoDisponibleError)) throw error;
        // Sin token ni URL completa en el registro.
        this.logger.warn(JSON.stringify({
          codigo: 'CONSULTA_ERP_RECURSOS_FALLIDA', fecha, intento, intentos, motivo: error.motivo, detalle: error.detalle,
        }));
        if (!TRANSITORIOS.includes(error.motivo) || intento >= intentos) throw error;
        await this.esperar(this.config.esperaReintentoMs * 2 ** (intento - 1));
      }
    }
  }

  private async consultarUnaVez(url: URL, fecha: string): Promise<RespuestaRecursosErpV1> {
    // Un mismo límite cubre la conexión, los encabezados y la lectura del cuerpo.
    const signal = AbortSignal.timeout(this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.config.token}`, Accept: 'application/json' },
        signal,
      });
    } catch (error) {
      if (esCorte(error)) throw new ErpRecursosNoDisponibleError('TIMEOUT', `sin respuesta en ${this.config.timeoutMs} ms`);
      throw new ErpRecursosNoDisponibleError('NO_DISPONIBLE', 'no se pudo conectar con el ERP');
    }

    const motivo = motivoPorEstadoHttp(response.status);
    if (motivo) throw new ErpRecursosNoDisponibleError(motivo, `HTTP ${response.status}`);

    let texto: string;
    try {
      texto = await response.text();
    } catch (error) {
      if (esCorte(error)) throw new ErpRecursosNoDisponibleError('TIMEOUT', `respuesta incompleta en ${this.config.timeoutMs} ms`);
      throw new ErpRecursosNoDisponibleError('NO_DISPONIBLE', 'se cortó la respuesta del ERP');
    }

    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      throw new ErpRecursosNoDisponibleError('RESPUESTA_INVALIDA', 'el cuerpo no es JSON');
    }
    try {
      return validarRespuestaRecursosV1(cuerpo, fecha);
    } catch (error) {
      if (error instanceof RespuestaRecursosV1InvalidaError) {
        throw new ErpRecursosNoDisponibleError(
          'RESPUESTA_INVALIDA',
          error.errores.map(({ campo, motivo: razon }) => `${campo}: ${razon}`).join('; '),
        );
      }
      throw error;
    }
  }
}
