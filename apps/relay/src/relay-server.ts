import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { RedisClient } from './redis-client.js';
import { RateLimiter } from './rate-limiter.js';
import { validateEnvelope, MAX_ENVELOPE_SIZE, isExpired } from './envelope-validator.js';
import type { EncryptedRelayEnvelopeV1 } from './envelope-validator.js';
import logger from './logger.js';

const ONLINE_TTL_SECONDS = 120;
const NONCE_TTL_SECONDS = 300;
const HEARTBEAT_INTERVAL_MS = 30000;

interface ClientConnection {
  socket: WebSocket;
  routingId: string;
  connectedAt: number;
  lastSeen: number;
  logMetadata: { routingId: string; connectionId: string };
}

type ServerStatus = {
  status: 'ok';
  version: string;
  connectedClients: number;
  maxEnvelopeSize: number;
  envelopeTtlSeconds: number;
};

export class RelayServer {
  private fastify: FastifyInstance;
  private redis: RedisClient;
  private rateLimiter: RateLimiter;
  private clients: Map<string, ClientConnection> = new Map();
  private envelopeTtlSeconds: number;
  private maxEnvelopeSize: number;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(
    fastify: FastifyInstance,
    redis: RedisClient,
    rateLimiter: RateLimiter,
    envelopeTtlSeconds: number,
    maxEnvelopeSize: number = MAX_ENVELOPE_SIZE
  ) {
    this.fastify = fastify;
    this.redis = redis;
    this.rateLimiter = rateLimiter;
    this.envelopeTtlSeconds = envelopeTtlSeconds;
    this.maxEnvelopeSize = maxEnvelopeSize;
  }

  async registerRoutes(): Promise<void> {
    this.fastify.get('/relay/v1/status', async () => {
      return this.getStatus();
    });

    this.fastify.get('/relay/v1/ws', { websocket: true }, (socket, req) => {
      this.handleConnection(socket, req);
    });
  }

  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private getStatus(): ServerStatus {
    return {
      status: 'ok',
      version: '1.0.0',
      connectedClients: this.clients.size,
      maxEnvelopeSize: this.maxEnvelopeSize,
      envelopeTtlSeconds: this.envelopeTtlSeconds,
    };
  }

  private handleConnection(socket: WebSocket, req: any): void {
    const connectionId = uuidv4();
    const url = new URL(req.url, 'http://localhost');
    const routingId = url.searchParams.get('routingId');

    if (!routingId) {
      this.sendErrorAndClose(socket, 'missing_routing_id', 'routingId query parameter is required');
      return;
    }

    const ROUTING_ID_PATTERN = /^[a-zA-Z0-9_-]{22,128}$/;
    if (!ROUTING_ID_PATTERN.test(routingId)) {
      this.sendErrorAndClose(socket, 'invalid_routing_id', 'Invalid routingId format');
      return;
    }

    const existingClient = this.clients.get(routingId);
    if (existingClient) {
      const connLog = logger.child({ routingId, connectionId });
      connLog.info('Replacing existing connection for routingId');
      this.sendErrorAndClose(existingClient.socket, 'connection_replaced', 'New connection established for this routingId');
    }

    const client: ClientConnection = {
      socket,
      routingId,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      logMetadata: { routingId, connectionId },
    };

    this.clients.set(routingId, client);
    this.redis.setOnline(routingId, ONLINE_TTL_SECONDS);

    const connLog = logger.child(client.logMetadata);
    connLog.info('Client connected');

    this.deliverOfflineEnvelopes(client);

    socket.on('message', (data: Buffer) => {
      this.handleMessage(client, data);
    });

    socket.on('close', () => {
      this.handleDisconnect(client);
    });

    socket.on('error', (err) => {
      connLog.error({ err: err.message }, 'WebSocket error');
    });

    socket.on('pong', () => {
      client.lastSeen = Date.now();
      this.redis.setOnline(routingId, ONLINE_TTL_SECONDS);
    });
  }

  private async handleMessage(client: ClientConnection, data: Buffer): Promise<void> {
    const log = logger.child(client.logMetadata);

    try {
      client.lastSeen = Date.now();

      const rateLimitResult = await this.rateLimiter.check(client.routingId);
      if (!rateLimitResult.allowed) {
        this.sendError(client.socket, 'rate_limited', 'Rate limit exceeded', {
          retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        });
        log.warn({ currentCount: rateLimitResult.currentCount }, 'Rate limit exceeded');
        return;
      }

      let rawMessage: unknown;
      try {
        rawMessage = JSON.parse(data.toString('utf8'));
      } catch {
        this.sendError(client.socket, 'invalid_json', 'Invalid JSON format');
        return;
      }

      const validation = validateEnvelope(rawMessage, this.maxEnvelopeSize);
      if (!validation.valid) {
        this.sendError(client.socket, 'invalid_envelope', validation.error || 'Envelope validation failed');
        log.warn({ error: validation.error, envelopeSize: validation.size }, 'Envelope validation failed');
        return;
      }

      const envelope = validation.envelope!;

      if (envelope.sourceRoutingId !== client.routingId) {
        this.sendError(client.socket, 'source_mismatch', 'sourceRoutingId does not match connection routingId');
        log.warn({ sourceRoutingId: envelope.sourceRoutingId }, 'Source routing ID mismatch');
        return;
      }

      if (isExpired(envelope)) {
        this.sendError(client.socket, 'envelope_expired', 'Envelope has expired');
        return;
      }

      const nonceTtl = Math.max(1, Math.floor((envelope.expiresAt - Date.now()) / 1000) + 60);
      const isNewNonce = await this.redis.checkAndSetNonce(envelope.nonce, Math.min(nonceTtl, NONCE_TTL_SECONDS));
      if (!isNewNonce) {
        this.sendError(client.socket, 'duplicate_nonce', 'Duplicate or replayed envelope detected');
        log.warn({ nonce: envelope.nonce.substring(0, 8) + '...' }, 'Replay detected');
        return;
      }

      log.info(
        {
          targetRoutingId: envelope.targetRoutingId,
          envelopeSize: validation.size,
          ttl: Math.floor((envelope.expiresAt - Date.now()) / 1000),
        },
        'Envelope received'
      );

      await this.forwardEnvelope(envelope);
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'Error handling message');
      this.sendError(client.socket, 'internal_error', 'Internal server error');
    }
  }

  private async forwardEnvelope(envelope: EncryptedRelayEnvelopeV1): Promise<void> {
    const targetClient = this.clients.get(envelope.targetRoutingId);

    if (targetClient && targetClient.socket.readyState === 1) {
      try {
        const serialized = JSON.stringify(envelope);
        targetClient.socket.send(serialized);
        const log = logger.child({ routingId: targetClient.routingId });
        log.info({ envelopeSize: serialized.length }, 'Envelope delivered directly');
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Failed to deliver directly, queuing');
        await this.redis.enqueueOfflineEnvelope(envelope.targetRoutingId, envelope, this.envelopeTtlSeconds);
      }
    } else {
      await this.redis.enqueueOfflineEnvelope(envelope.targetRoutingId, envelope, this.envelopeTtlSeconds);
      logger.info(
        { targetRoutingId: envelope.targetRoutingId },
        'Target offline, envelope queued'
      );
    }
  }

  private async deliverOfflineEnvelopes(client: ClientConnection): Promise<void> {
    try {
      const envelopes = await this.redis.dequeueOfflineEnvelopes(client.routingId);
      let delivered = 0;

      for (const envelope of envelopes) {
        if (isExpired(envelope)) {
          continue;
        }
        if (client.socket.readyState === 1) {
          client.socket.send(JSON.stringify(envelope));
          delivered++;
        }
      }

      if (delivered > 0) {
        const log = logger.child(client.logMetadata);
        log.info({ delivered }, 'Offline envelopes delivered');
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Failed to deliver offline envelopes');
    }
  }

  private handleDisconnect(client: ClientConnection): void {
    const log = logger.child(client.logMetadata);
    log.info('Client disconnected');
    this.clients.delete(client.routingId);
    this.redis.setOffline(client.routingId);
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = now - ONLINE_TTL_SECONDS * 1000;

    for (const [routingId, client] of this.clients.entries()) {
      if (client.lastSeen < staleThreshold) {
        const log = logger.child(client.logMetadata);
        log.info('Cleaning up stale connection');
        client.socket.terminate();
        this.clients.delete(routingId);
        this.redis.setOffline(routingId);
      } else if (client.socket.readyState === 1) {
        try {
          client.socket.ping();
          this.redis.setOnline(routingId, ONLINE_TTL_SECONDS);
        } catch {
          // socket may be closing
        }
      }
    }
  }

  private sendError(socket: WebSocket, code: string, message: string, extra?: Record<string, unknown>): void {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({ error: code, message, ...extra }));
    }
  }

  private sendErrorAndClose(socket: WebSocket, code: string, message: string): void {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({ error: code, message }));
      setTimeout(() => socket.close(1008, code), 50);
    }
  }

  async shutdown(): Promise<void> {
    this.stopHeartbeat();
    for (const [routingId, client] of this.clients.entries()) {
      try {
        client.socket.close(1001, 'server_shutdown');
      } catch {
        // ignore
      }
      await this.redis.setOffline(routingId);
    }
    this.clients.clear();
  }
}
