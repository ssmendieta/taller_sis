import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { PUBSUB_LOGISTICA_CLIENT } from '../pubsub/pubsub-logistica.client';
import { PUBSUB_LOGISTICA_CONFIG, PubSubLogisticaConfig } from '../pubsub/pubsub-logistica.config';
import { esErrorPermanenteResultadoSalida, ProcesadorResultadoSalidaService } from './procesador-resultado-salida.service';

// ABC-387: ACK solo después del commit; NACK ante fallos transitorios para que Pub/Sub
// reentregue; los errores permanentes (inválidos, no correlacionados) se confirman y registran.
@Injectable()
export class PubSubResultadoSalidaConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PubSubResultadoSalidaConsumer.name);
  private subscription?: Subscription;

  constructor(
    private readonly processor: ProcesadorResultadoSalidaService,
    @Inject(PUBSUB_LOGISTICA_CLIENT) private readonly client: PubSub | null,
    @Inject(PUBSUB_LOGISTICA_CONFIG) private readonly config: PubSubLogisticaConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.resultado.enabled) return;
    if (!this.client) throw new Error('El cliente Pub/Sub de Logística no está disponible');
    this.subscription = this.client.subscription(this.config.resultado.subscriptionId, { flowControl: { maxMessages: 10 } });
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
    this.logger.error(JSON.stringify({ codigo: 'CONSUMIDOR_RESULTADO_SALIDA_ERROR', error: error.message.slice(0, 500) }));
  };

  async procesarMensaje(message: Pick<Message, 'id' | 'data' | 'ack' | 'nack'>): Promise<void> {
    try {
      const payload = JSON.parse(message.data.toString('utf8')) as Record<string, unknown>;
      const resultado = await this.processor.procesar(payload, message.id);
      message.ack();
      this.logger.log(JSON.stringify({
        codigo: 'RESULTADO_SALIDA_RECIBIDO', messageId: message.id, eventId: resultado.eventId,
        rutaId: resultado.rutaId, estado: resultado.estado, resultado: resultado.resultado,
      }));
    } catch (error) {
      const mensaje = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      if (esErrorPermanenteResultadoSalida(error)) {
        message.ack();
        this.logger.warn(JSON.stringify({ codigo: 'RESULTADO_SALIDA_RECHAZADO', messageId: message.id, error: mensaje }));
        return;
      }
      message.nack();
      this.logger.error(JSON.stringify({ codigo: 'RESULTADO_SALIDA_REINTENTABLE', messageId: message.id, error: mensaje }));
    }
  }
}
