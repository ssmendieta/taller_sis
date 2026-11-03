import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { PUBSUB_CLIENT } from '../integraciones/pubsub/pubsub-client.provider';
import {
  PUBSUB_DEMANDA_CONSUMER_CONFIG,
  PubSubDemandaConsumerConfig,
} from '../integraciones/pubsub/pubsub-demanda-consumer.config';
import { esErrorPermanenteDemanda, ProcesadorDemandaService } from './procesador-demanda.service';

// ABC-356: ACK solo después del commit; NACK ante fallos transitorios para que
// Pub/Sub vuelva a entregar; los errores permanentes se confirman y registran.
@Injectable()
export class PubSubDemandaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PubSubDemandaConsumerService.name);
  private subscription?: Subscription;

  constructor(
    private readonly processor: ProcesadorDemandaService,
    @Inject(PUBSUB_CLIENT) private readonly client: PubSub | null,
    @Inject(PUBSUB_DEMANDA_CONSUMER_CONFIG) private readonly config: PubSubDemandaConsumerConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    if (!this.client) throw new Error('El cliente Pub/Sub no esta disponible para el consumidor de demandas');
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
    this.logger.error(JSON.stringify({ codigo: 'CONSUMIDOR_DEMANDA_PUBSUB_ERROR', error: error.message.slice(0, 500) }));
  };

  async procesarMensaje(message: Pick<Message, 'id' | 'data' | 'ack' | 'nack'>): Promise<void> {
    try {
      const payload = JSON.parse(message.data.toString('utf8')) as Record<string, unknown>;
      const resultado = await this.processor.procesar(payload, message.id);
      message.ack();
      this.logger.log(JSON.stringify({
        codigo: 'DEMANDA_RECIBIDA',
        messageId: message.id,
        eventId: resultado.eventId,
        demandaId: resultado.demandaId,
        resultado: resultado.resultado,
        correlationId: payload.correlationId,
      }));
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (esErrorPermanenteDemanda(error)) {
        message.ack();
        this.logger.warn(JSON.stringify({ codigo: 'DEMANDA_RECHAZADA', messageId: message.id, error: mensaje.slice(0, 500) }));
        return;
      }
      message.nack();
      this.logger.error(JSON.stringify({ codigo: 'DEMANDA_REINTENTABLE', messageId: message.id, error: mensaje.slice(0, 500) }));
    }
  }
}
