import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { EventoContabilidadV1InvalidoError } from '../contratos/contabilidad-v1.validator';
import { PUBSUB_CLIENT } from '../pubsub/pubsub-client.provider';
import {
  PUBSUB_CONTABILIDAD_CONSUMER_CONFIG,
  PubSubContabilidadConsumerConfig,
} from '../pubsub/pubsub-contabilidad-consumer.config';
import {
  esErrorPermanenteResultadoContable,
  ProcesadorResultadoContableService,
} from './procesador-resultado-contable.service';

@Injectable()
export class PubSubContabilidadConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PubSubContabilidadConsumerService.name);
  private subscription?: Subscription;

  constructor(
    private readonly processor: ProcesadorResultadoContableService,
    @Inject(PUBSUB_CLIENT) private readonly client: PubSub | null,
    @Inject(PUBSUB_CONTABILIDAD_CONSUMER_CONFIG) private readonly config: PubSubContabilidadConsumerConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    if (!this.client) throw new Error('El cliente Pub/Sub no esta disponible para el consumidor contable');
    this.subscription = this.client.subscription(this.config.subscriptionId, { flowControl: { maxMessages: 10 } });
    this.subscription.on('message', this.onMessage);
    this.subscription.on('error', this.onError);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.subscription) return;
    this.subscription.removeListener('message', this.onMessage);
    this.subscription.removeListener('error', this.onError);
    await this.subscription.close();
  }

  private readonly onMessage = (message: Message): void => {
    void this.procesarMensaje(message);
  };

  private readonly onError = (error: Error): void => {
    this.logger.error(JSON.stringify({ codigo: 'CONSUMIDOR_CONTABLE_PUBSUB_ERROR', error: error.message.slice(0, 500) }));
  };

  private async procesarMensaje(message: Message): Promise<void> {
    try {
      const payload = JSON.parse(message.data.toString('utf8')) as Record<string, unknown>;
      this.validarAtributos(message, payload);
      const resultado = await this.processor.procesar(payload, message.id);
      message.ack();
      this.logger.log(JSON.stringify({
        codigo: 'RESULTADO_CONTABLE_RECIBIDO',
        messageId: message.id,
        eventId: resultado.eventId,
        cierreId: resultado.cierreId,
        resultado: resultado.resultado,
        correlationId: payload.correlationId,
        requestEventId: (payload.data as Record<string, unknown>)?.requestEventId,
      }));
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (esErrorPermanenteResultadoContable(error)) {
        message.ack();
        this.logger.warn(JSON.stringify({ codigo: 'RESULTADO_CONTABLE_RECHAZADO', messageId: message.id, error: mensaje.slice(0, 500) }));
        return;
      }
      message.nack();
      this.logger.error(JSON.stringify({ codigo: 'RESULTADO_CONTABLE_REINTENTABLE', messageId: message.id, error: mensaje.slice(0, 500) }));
    }
  }

  private validarAtributos(message: Message, payload: Record<string, unknown>): void {
    const errores = ['eventId', 'eventType', 'correlationId']
      .filter((campo) => !message.attributes?.[campo] || message.attributes[campo] !== payload[campo])
      .map((campo) => ({ campo: `attributes.${campo}`, motivo: 'es obligatorio y debe coincidir con el payload' }));
    if (errores.length) {
      throw new EventoContabilidadV1InvalidoError(
        typeof payload.eventType === 'string' ? payload.eventType : undefined,
        typeof payload.eventId === 'string' ? payload.eventId : undefined,
        errores,
      );
    }
  }
}
