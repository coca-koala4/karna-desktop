import pino from 'pino';

export interface RelayLogMetadata {
  routingId?: string;
  envelopeSize?: number;
  ttl?: number;
  version?: string;
  error?: string;
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['ciphertext', 'payload', 'body.ciphertext'],
    remove: true,
  },
});

export function createChildLogger(metadata: RelayLogMetadata) {
  return logger.child(metadata);
}

export default logger;
