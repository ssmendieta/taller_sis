import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PubSubLogisticaPublisher } from '../pubsub/pubsub-logistica.client';
import { PUBSUB_LOGISTICA_CONFIG, PubSubLogisticaConfig } from '../pubsub/pubsub-logistica.config';
import { OutboxStore } from './outbox.store';

export interface ResultadoCicloOutbox {
  reclamados: number;
  publicados: number;
  fallidos: number;
  obsoletos: number;
}

// ABC-386: publica después del commit de negocio. Un fallo deja el evento PENDIENTE
// con su error y una espera exponencial; el reintento reenvía el mismo eventId y cuerpo.
@Injectable()
export class OutboxPublicadorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublicadorService.name);
  private timer: NodeJS.Timeout | undefined;
  private cicloActivo = false;

  constructor(
    private readonly store: OutboxStore,
    private readonly publisher: PubSubLogisticaPublisher,
    @Inject(PUBSUB_LOGISTICA_CONFIG) private readonly config: PubSubLogisticaConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.publicacion.enabled) return;
    void this.cicloProtegido();
    this.timer = setInterval(() => void this.cicloProtegido(), this.config.outbox.pollIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async procesarPendientes(ahora: Date = new Date()): Promise<ResultadoCicloOutbox> {
    const { batchSize, leaseMs, retryBaseMs, retryMaxMs } = this.config.outbox;
    const eventos = await this.store.reclamarPendientes({ ahora, limite: batchSize, leaseMs });
    const resultado: ResultadoCicloOutbox = { reclamados: eventos.length, publicados: 0, fallidos: 0, obsoletos: 0 };

    for (const evento of eventos) {
      try {
        const { messageId, topicId } = await this.publisher.publicar(evento.payload);
        const aplicado = await this.store.marcarPublicado(evento, messageId, new Date());
        resultado.publicados += 1;
        if (!aplicado) resultado.obsoletos += 1;
        this.logger.log(JSON.stringify({
          codigo: 'PUBLICACION_OUTBOX_CONFIRMADA', eventId: evento.eventId, eventType: evento.eventType,
          correlationId: evento.correlationId, messageId, topicId, aplicado,
        }));
      } catch (error) {
        const mensaje = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
        const espera = Math.min(retryBaseMs * 2 ** Math.max(0, evento.intentos - 1), retryMaxMs);
        const aplicado = await this.store.marcarFallo(evento, mensaje, new Date(Date.now() + espera));
        resultado.fallidos += 1;
        if (!aplicado) resultado.obsoletos += 1;
        this.logger.warn(JSON.stringify({
          codigo: 'PUBLICACION_OUTBOX_FALLIDA', eventId: evento.eventId, eventType: evento.eventType,
          intento: evento.intentos, error: mensaje, aplicado,
        }));
      }
    }
    return resultado;
  }

  private async cicloProtegido(): Promise<void> {
    if (this.cicloActivo) return;
    this.cicloActivo = true;
    try {
      await this.procesarPendientes();
    } catch (error) {
      this.logger.error('No se pudo ejecutar el ciclo de publicación del outbox de Logística', error);
    } finally {
      this.cicloActivo = false;
    }
  }
}
