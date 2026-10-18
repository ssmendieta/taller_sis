import { PubSubPublisherService } from '../pubsub/pubsub-publisher.service';
import { PubSubEvent } from '../pubsub/pubsub.types';
import { PRODUCCION_CERRADA_V1_EJEMPLO } from './contabilidad-v1';
import {
  DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO,
  SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
} from './inventario-almacen-v1';

describe('ABC-249/ABC-277: contratos salientes en el topic unico', () => {
  it('publica todos los eventos salientes mediante el mismo PUBSUB_TOPIC_ID', async () => {
    const publishMessage = jest
      .fn()
      .mockResolvedValueOnce('message-contabilidad')
      .mockResolvedValueOnce('message-disponibilidad')
      .mockResolvedValueOnce('message-almacen');
    const topic = jest.fn().mockReturnValue({ publishMessage });
    const publisher = new PubSubPublisherService(
      {
        enabled: true,
        projectId: 'proyecto-local',
        topicId: 'topic-unico-configurado',
      },
      { topic } as any,
    );

    const eventosSalientes: PubSubEvent<unknown>[] = [
      PRODUCCION_CERRADA_V1_EJEMPLO,
      DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO,
      SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
    ];

    const resultados = [];
    for (const evento of eventosSalientes) {
      resultados.push(await publisher.publish(evento));
    }

    expect(topic).toHaveBeenCalledTimes(3);
    expect(topic).toHaveBeenNthCalledWith(1, 'topic-unico-configurado');
    expect(topic).toHaveBeenNthCalledWith(2, 'topic-unico-configurado');
    expect(topic).toHaveBeenNthCalledWith(3, 'topic-unico-configurado');
    expect(resultados.map((resultado) => resultado.topicId)).toEqual([
      'topic-unico-configurado',
      'topic-unico-configurado',
      'topic-unico-configurado',
    ]);

    const tiposPublicados = publishMessage.mock.calls.map(([mensaje]) =>
      JSON.parse(mensaje.data.toString('utf8')).eventType,
    );
    expect(tiposPublicados).toEqual([
      'ProduccionCerrada.v1',
      'DisponibilidadMaterialSolicitada.v1',
      'SolicitudMaterialAlmacen.v1',
    ]);
  });
});
