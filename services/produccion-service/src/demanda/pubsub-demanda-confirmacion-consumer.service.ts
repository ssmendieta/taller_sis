import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { PUBSUB_CLIENT } from '../integraciones/pubsub/pubsub-client.provider';
import {
  PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG,
  PubSubDemandaConfirmacionConsumerConfig,
} from '../integraciones/pubsub/pubsub-demanda-confirmacion-consumer.config';
import {
  esErrorPermanenteConfirmacionDemanda,
  ProcesadorConfirmacionDemandaService,
} from './procesador-confirmacion-demanda.service';

@Injectable()
export class PubSubDemandaConfirmacionConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PubSubDemandaConfirmacionConsumerService.name);
  private subscription?: Subscription;
  private retryTimer?: NodeJS.Timeout;
  private reprocesando = false;

  constructor(
    private readonly processor: ProcesadorConfirmacionDemandaService,
    @Inject(PUBSUB_CLIENT) private readonly client: PubSub | null,
    @Inject(PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG)
    private readonly config: PubSubDemandaConfirmacionConsumerConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    if (!this.client) throw new Error('El cliente Pub/Sub no esta disponible para el consumidor de confirmaciones');
    this.subscription = this.client.subscription(this.config.subscriptionId, { flowControl: { maxMessages: 10 } });
    this.subscription.on('message', this.onMessage);
    this.subscription.on('error', this.onError);
    this.retryTimer = setInterval(() => { void this.reprocesarPendientes(); }, this.config.retryIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (!this.subscription) return;
    this.subscription.removeListener('message', this.onMessage);
    this.subscription.removeListener('error', this.onError);
    await this.subscription.close();
  }

  async procesarMensaje(message: Pick<Message, 'id' | 'data' | 'ack' | 'nack'>): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(message.data.toString('utf8'));
      const resultado = await this.processor.procesar(payload, message.id);
      message.ack();
      this.logger.log(JSON.stringify({
        codigo: 'CONFIRMACION_DEMANDA_RECIBIDA',
        messageId: message.id,
        eventId: resultado.eventId,
        demandaId: resultado.demandaId,
        resultado: resultado.resultado,
      }));
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (esErrorPermanenteConfirmacionDemanda(error)) {
        if (error instanceof SyntaxError) {
          await this.processor.registrarMensajeInvalido(payload, error, message.id);
        }
        message.ack();
        this.logger.warn(JSON.stringify({
          codigo: 'CONFIRMACION_DEMANDA_RECHAZADA',
          messageId: message.id,
          error: mensaje.slice(0, 500),
        }));
        return;
      }
      message.nack();
      this.logger.error(JSON.stringify({
        codigo: 'CONFIRMACION_DEMANDA_REINTENTABLE',
        messageId: message.id,
        error: mensaje.slice(0, 500),
      }));
    }
  }

  private readonly onMessage = (message: Message): void => {
    void this.procesarMensaje(message);
  };

  private readonly onError = (error: Error): void => {
    this.logger.error(JSON.stringify({ codigo: 'CONSUMIDOR_CONFIRMACION_DEMANDA_ERROR', error: error.message.slice(0, 500) }));
  };

  private async reprocesarPendientes(): Promise<void> {
    if (this.reprocesando) return;
    this.reprocesando = true;
    try {
      const procesados = await this.processor.reprocesarPendientes();
      if (procesados > 0) {
        this.logger.log(JSON.stringify({ codigo: 'CONFIRMACIONES_DEMANDA_REPROCESADAS', cantidad: procesados }));
      }
    } catch (error) {
      this.logger.error(JSON.stringify({
        codigo: 'REPROCESO_CONFIRMACIONES_DEMANDA_ERROR',
        error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      }));
    } finally {
      this.reprocesando = false;
    }
  }
}
