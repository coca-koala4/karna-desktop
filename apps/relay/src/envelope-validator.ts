export const ENVELOPE_VERSION_V1 = 'v1';
export const MAX_ENVELOPE_SIZE = 1024 * 1024;

export interface EncryptedRelayEnvelopeV1 {
  version: 'v1';
  nonce: string;
  sourceRoutingId: string;
  targetRoutingId: string;
  expiresAt: number;
  ciphertext: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  envelope?: EncryptedRelayEnvelopeV1;
  size: number;
}

const REQUIRED_FIELDS = ['version', 'nonce', 'sourceRoutingId', 'targetRoutingId', 'expiresAt', 'ciphertext'];
const ROUTING_ID_PATTERN = /^[a-zA-Z0-9_-]{22,128}$/;
const NONCE_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;

export function validateEnvelope(raw: unknown, maxSize: number = MAX_ENVELOPE_SIZE): ValidationResult {
  const rawString = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const size = Buffer.byteLength(rawString, 'utf8');

  if (size > maxSize) {
    return { valid: false, error: `Envelope size ${size} exceeds limit ${maxSize}`, size };
  }

  let envelope: EncryptedRelayEnvelopeV1;
  try {
    envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { valid: false, error: 'Invalid JSON format', size };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in envelope)) {
      return { valid: false, error: `Missing required field: ${field}`, size };
    }
  }

  if (envelope.version !== ENVELOPE_VERSION_V1) {
    return { valid: false, error: `Unsupported envelope version: ${envelope.version}`, size };
  }

  if (typeof envelope.nonce !== 'string' || !NONCE_PATTERN.test(envelope.nonce)) {
    return { valid: false, error: 'Invalid nonce format', size };
  }

  if (typeof envelope.sourceRoutingId !== 'string' || !ROUTING_ID_PATTERN.test(envelope.sourceRoutingId)) {
    return { valid: false, error: 'Invalid sourceRoutingId format', size };
  }

  if (typeof envelope.targetRoutingId !== 'string' || !ROUTING_ID_PATTERN.test(envelope.targetRoutingId)) {
    return { valid: false, error: 'Invalid targetRoutingId format', size };
  }

  if (typeof envelope.expiresAt !== 'number' || envelope.expiresAt <= 0) {
    return { valid: false, error: 'Invalid expiresAt value', size };
  }

  const now = Date.now();
  if (envelope.expiresAt < now) {
    return { valid: false, error: 'Envelope has expired', size };
  }

  if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length === 0) {
    return { valid: false, error: 'ciphertext must be a non-empty string', size };
  }

  return { valid: true, envelope, size };
}

export function isExpired(envelope: EncryptedRelayEnvelopeV1): boolean {
  return Date.now() > envelope.expiresAt;
}
