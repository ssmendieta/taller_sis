import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { EventoInventarioV1InvalidoError } from '../contratos/inventario-almacen-v1.validator';
import { DISPONIBILIDAD_MATERIAL_SOLICITADA_V1, SOLICITUD_MATERIAL_ALMACEN_V1 } from '../contratos/inventario-almacen-v1';
import { PUBSUB_CLIENT } from '../pubsub/pubsub-client.provider';
import { PUBSUB_CONSUMER_CONFIG, PubSubConsumerConfig } from '../pubsub/pubsub-consumer.config';
import {
  esErrorPermanenteRespuestaInventario,
  ProcesadorRespuestaInventarioService,
} from './procesador-respuesta-inventario.service';

@Injectable()
export class PubSubInventarioConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PubSubInventarioConsumerService.name);
  private subscription?: Subscription;

  constructor(
    private readonly processor: ProcesadorRespuestaInventarioService,
    @Inject(PUBSUB_CLIENT) private readonly client: PubSub | null,
    @Inject(PUBSUB_CONSUMER_CONFIG) private readonly config: PubSubConsumerConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    if (!this.client) throw new Error('El cliente Pub/Sub no esta disponible para el consumidor');
    this.subscription = this.client.subscription(this.config.subscriptionId, {
      flowControl: { maxMessages: 10 },
    });
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
    this.logger.error(JSON.stringify({ codigo: 'CONSUMIDOR_PUBSUB_ERROR', error: error.message.slice(0, 500) }));
  };

  private async procesarMensaje(message: Message): Promise<void> {
    try {
      const payload = JSON.parse(message.data.toString('utf8')) as Record<string, unknown>;
      this.validarAtributos(message, payload);
      // El topic compartido también entrega nuestros propios eventos de solicitud.
      if (payload.source === 'produccion-service'
        && (payload.eventType === DISPONIBILIDAD_MATERIAL_SOLICITADA_V1 || payload.eventType === SOLICITUD_MATERIAL_ALMACEN_V1)) {
        message.ack();
        return;
      }
      const resultado = await this.processor.procesar(payload, message.id);
      message.ack();
      this.logger.log(JSON.stringify({
        codigo: 'RESPUESTA_INVENTARIO_RECIBIDA',
        messageId: message.id,
        eventId: resultado.eventId,
        resultado: resultado.resultado,
      }));
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (esErrorPermanenteRespuestaInventario(error)) {
        message.ack();
        this.logger.warn(JSON.stringify({
          codigo: 'RESPUESTA_INVENTARIO_RECHAZADA',
          messageId: message.id,
          error: mensaje.slice(0, 500),
        }));
        return;
      }
      message.nack();
      this.logger.error(JSON.stringify({
        codigo: 'RESPUESTA_INVENTARIO_REINTENTABLE',
        messageId: message.id,
        error: mensaje.slice(0, 500),
      }));
    }
  }

  private validarAtributos(message: Message, payload: Record<string, unknown>): void {
    const errores = ['eventId', 'eventType', 'correlationId']
      .filter((campo) => message.attributes?.[campo] && message.attributes[campo] !== payload[campo])
      .map((campo) => ({ campo: `attributes.${campo}`, motivo: 'no coincide con el payload' }));
    if (errores.length) {
      throw new EventoInventarioV1InvalidoError(
        typeof payload.eventType === 'string' ? payload.eventType : undefined,
        typeof payload.eventId === 'string' ? payload.eventId : undefined,
        errores,
      );
    }
  }
}
