1. El cierre inmutable y `ProduccionCerrada.v1` se guardan juntos en PostgreSQL; el resultado contable se guarda junto con su inbox y la transición de estado en otra transacción atómica.
2. Solo después del commit, el publicador outbox envía el cierre y hace reintentos; el consumidor de resultados hace ACK solo después del commit del inbox y del estado.
3. Si Pub/Sub está caído, el cierre queda confirmado y el evento permanece `PENDIENTE`; al recuperarse el emulador se publica/reentrega sin repetir efectos gracias a `eventId` único.
