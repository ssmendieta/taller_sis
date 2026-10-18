export interface PubSubEvent<T = unknown> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  source: string;
  correlationId: string;
  data: T;
}

export interface PubSubPublicationResult {
  eventId: string;
  correlationId: string;
  messageId: string;
  topicId: string;
}
