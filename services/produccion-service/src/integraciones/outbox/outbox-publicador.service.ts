import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PubSubPublisherService } from '../pubsub/pubsub-publisher.service';
import { OUTBOX_CONFIG, OutboxConfig } from './outbox.config';
import { OUTBOX_STORE, OutboxStore } from './outbox.store';

export interface ResultadoProcesamientoOutbox {
  reclamados: number;
  publicados: number;
  fallidos: number;
  resultadosObsoletos: number;
}

@Injectable()
export class OutboxPublicadorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublicadorService.name);
  private timer: NodeJS.Timeout | undefined;
  private cicloActivo = false;

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: OutboxStore,
    private readonly publisher: PubSubPublisherService,
    @Inject(OUTBOX_CONFIG) private readonly config: OutboxConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    void this.ejecutarCicloProtegido();
    this.timer = setInterval(
      () => void this.ejecutarCicloProtegido(),
      this.config.pollIntervalMs,
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async procesarPendientes(
    ahora: Date = new Date(),
  ): Promise<ResultadoProcesamientoOutbox> {
    const eventos = await this.store.reclamarPendientes({
      ahora,
      limite: this.config.batchSize,
      leaseMs: this.config.leaseMs,
    });
    const resultado: ResultadoProcesamientoOutbox = {
      reclamados: eventos.length,
      publicados: 0,
      fallidos: 0,
      resultadosObsoletos: 0,
    };

    for (const evento of eventos) {
      try {
        const confirmacion = await this.publisher.publish(evento.payload);
        const aplicado = await this.store.marcarPublicado(
          evento,
          confirmacion.messageId,
          new Date(),
        );
        resultado.publicados += 1;
        this.logger.log(JSON.stringify({
          codigo: 'PUBLICACION_OUTBOX_CONFIRMADA',
          eventId: evento.eventId,
          eventType: evento.eventType,
          correlationId: evento.correlationId,
          messageId: confirmacion.messageId,
        }));
        if (!aplicado) {
          resultado.resultadosObsoletos += 1;
          this.registrarResultadoObsoleto(evento, 'PUBLICACION_CONFIRMADA');
        }
      } catch (error) {
        const mensaje = this.mensajeSeguro(error);
        const espera = Math.min(
          this.config.retryBaseMs * (2 ** Math.max(0, evento.intentos - 1)),
          this.config.retryMaxMs,
        );
        const aplicado = await this.store.marcarFallo(
          evento,
          mensaje,
          new Date(Date.now() + espera),
        );
        resultado.fallidos += 1;
        if (!aplicado) {
          resultado.resultadosObsoletos += 1;
          this.registrarResultadoObsoleto(evento, 'PUBLICACION_FALLIDA');
        }
        this.logger.warn(JSON.stringify({
          codigo: 'PUBLICACION_OUTBOX_FALLIDA',
          eventId: evento.eventId,
          eventType: evento.eventType,
          intento: evento.intentos,
          error: mensaje,
        }));
      }
    }

    return resultado;
  }

  private registrarResultadoObsoleto(
    evento: { eventId: string; eventType: string; intentos: number },
    resultado: 'PUBLICACION_CONFIRMADA' | 'PUBLICACION_FALLIDA',
  ): void {
    this.logger.warn(JSON.stringify({
      codigo: 'RESULTADO_OUTBOX_OBSOLETO',
      eventId: evento.eventId,
      eventType: evento.eventType,
      intento: evento.intentos,
      resultado,
    }));
  }

  private async ejecutarCicloProtegido(): Promise<void> {
    if (this.cicloActivo) return;
    this.cicloActivo = true;
    try {
      await this.procesarPendientes();
    } catch (error) {
      this.logger.error('No se pudo ejecutar el ciclo de publicación outbox', error);
    } finally {
      this.cicloActivo = false;
    }
  }

  private mensajeSeguro(error: unknown): string {
    const mensaje = error instanceof Error ? error.message : String(error);
    return mensaje.slice(0, 2000);
  }
}
