import re
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_REDACTED = "[REDACTED]"

_API_KEY_PATTERNS = [
    (re.compile(r'(sk-[A-Za-z0-9]{20,})'), None),
    (re.compile(r'(sk_proj-[A-Za-z0-9_-]{20,})'), None),
    (re.compile(r'(ghp_[A-Za-z0-9]{30,})'), None),
    (re.compile(r'(github_pat_[A-Za-z0-9_]{20,})'), None),
    (re.compile(r'(gho_[A-Za-z0-9]{30,})'), None),
    (re.compile(r'(xox[abprs]-[A-Za-z0-9-]{10,})'), None),
    (re.compile(r'(AIza[0-9A-Za-z\-_]{35})'), None),
    (re.compile(r'(ya29\.[0-9A-Za-z\-_]+)'), None),
    (re.compile(r'(AKIA[0-9A-Z]{16})'), None),
    (re.compile(r'(ASIA[0-9A-Z]{16})'), None),
    (re.compile(r'(?i)(api[_-]?key\s*[=:]\s*["\']?)([A-Za-z0-9_\-]{20,})(["\']?)'), 'triple'),
    (re.compile(r'(?i)(secret[_-]?key\s*[=:]\s*["\']?)([A-Za-z0-9_\-]{20,})(["\']?)'), 'triple'),
    (re.compile(r'(?i)(access[_-]?token\s*[=:]\s*["\']?)([A-Za-z0-9_\-\.]{20,})(["\']?)'), 'triple'),
    (re.compile(r'(?i)(auth[_-]?token\s*[=:]\s*["\']?)([A-Za-z0-9_\-\.]{20,})(["\']?)'), 'triple'),
    (re.compile(r'(?i)(bearer\s+)([A-Za-z0-9_\-\.]{20,})'), 'pair'),
    (re.compile(r'(?i)(password\s*[=:]\s*["\']?)([^\s"\']{6,})(["\']?)'), 'triple'),
    (re.compile(r'(?i)(passwd\s*[=:]\s*["\']?)([^\s"\']{6,})(["\']?)'), 'triple'),
    (re.compile(r'(?i)(authorization\s*:\s*bearer\s+)([A-Za-z0-9_\-\.]+)'), 'pair'),
    (re.compile(r'(?i)(cookie\s*:\s*)([^\n\r]+)'), 'pair'),
    (re.compile(r'(?i)(set-cookie\s*:\s*)([^\n\r]+)'), 'pair'),
    (re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----'), None),
]

_JWT_PATTERN = re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}')

_CREDIT_CARD_PATTERNS = [
    re.compile(r'\b(?:\d{4}[-\s]?){3}\d{4}\b'),
    re.compile(r'\b\d{16}\b'),
]

_SENSITIVE_ENV_PATTERNS = [
    (re.compile(r'(?i)(OPENAI_API_KEY\s*=\s*)([^\s]+)'), 'pair'),
    (re.compile(r'(?i)(ANTHROPIC_API_KEY\s*=\s*)([^\s]+)'), 'pair'),
    (re.compile(r'(?i)(GOOGLE_API_KEY\s*=\s*)([^\s]+)'), 'pair'),
    (re.compile(r'(?i)(AZURE_API_KEY\s*=\s*)([^\s]+)'), 'pair'),
    (re.compile(r'(?i)(DEEPSEEK_API_KEY\s*=\s*)([^\s]+)'), 'pair'),
    (re.compile(r'(?i)(HF_TOKEN\s*=\s*)([^\s]+)'), 'pair'),
    (re.compile(r'(?i)(GITHUB_TOKEN\s*=\s*)([^\s]+)'), 'pair'),
    (re.compile(r'(?i)(DATABASE_URL\s*=\s*)([^\s]+://[^\s]+@[^\s]+)'), 'pair'),
    (re.compile(r'(?i)(REDIS_URL\s*=\s*)([^\s]+://[^\s]+@[^\s]+)'), 'pair'),
    (re.compile(r'(?i)(MONGO_URL\s*=\s*)([^\s]+://[^\s]+@[^\s]+)'), 'pair'),
]

_SENSITIVE_KEYS = {
    'api_key', 'apikey', 'secret', 'password', 'passwd', 'token',
    'authorization', 'auth_token', 'access_token', 'refresh_token',
    'private_key', 'cookie', 'set-cookie', 'key', 'credentials'
}


def redact_text(text: str, redact_emails: bool = False, redact_credit_cards: bool = False) -> str:
    if not text or not isinstance(text, str):
        return text or ""

    result = text

    for pattern, mode in _API_KEY_PATTERNS:
        if mode == 'triple':
            result = pattern.sub(lambda m: m.group(1) + _REDACTED + (m.group(3) or ''), result)
        elif mode == 'pair':
            result = pattern.sub(lambda m: m.group(1) + _REDACTED, result)
        else:
            result = pattern.sub(_REDACTED, result)

    result = _JWT_PATTERN.sub(_REDACTED, result)

    for pattern, mode in _SENSITIVE_ENV_PATTERNS:
        result = pattern.sub(lambda m: m.group(1) + _REDACTED, result)

    if redact_credit_cards:
        for pattern in _CREDIT_CARD_PATTERNS:
            result = pattern.sub(_REDACTED, result)

    return result


def redact_dict(obj: Any, depth: int = 0) -> Any:
    if depth > 10:
        return _REDACTED
    if obj is None:
        return None
    if isinstance(obj, str):
        return redact_text(obj)
    if isinstance(obj, (int, float, bool)):
        return obj
    if isinstance(obj, list):
        return [redact_dict(item, depth + 1) for item in obj]
    if isinstance(obj, dict):
        redacted = {}
        for k, v in obj.items():
            if isinstance(k, str) and k.lower() in _SENSITIVE_KEYS and isinstance(v, str) and len(v) > 4:
                redacted[k] = _REDACTED
            else:
                redacted[k] = redact_dict(v, depth + 1)
        return redacted
    return obj


def is_safe_to_store(text: str) -> bool:
    if not text or not isinstance(text, str):
        return True
    return redact_text(text) == text
