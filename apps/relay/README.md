# Karna Encrypted Relay Service

无账号体系的加密远程中继服务。Relay不理解业务内容，仅负责转发加密信封。

## 安全特性

- **零知识**：不存储、不记录ciphertext或明文内容
- **防重放**：Nonce去重机制
- **速率限制**：滑动窗口算法防止滥用
- **信封过期**：自动清理过期消息
- **无账号**：通过routingId临时路由，无用户数据持久化
- **CORS限制**：仅允许配置的来源访问

## 快速开始

### 使用Docker Compose

```bash
cp .env.example .env
docker-compose up -d
```

### 本地开发

```bash
npm install
npm run dev
```

## API端点

### `GET /health`
健康检查，返回服务和Redis状态。

### `GET /relay/v1/status`
中继服务状态，返回在线客户端数、配置信息（不暴露敏感数据）。

### WebSocket `GET /relay/v1/ws?routingId=<ID>`
建立WebSocket连接。客户端通过此连接发送和接收加密信封。

## 信封格式 (v1)

```json
{
  "version": "v1",
  "nonce": "<unique-nonce>",
  "sourceRoutingId": "<sender-id>",
  "targetRoutingId": "<recipient-id>",
  "expiresAt": <unix-timestamp-ms>,
  "ciphertext": "<encrypted-payload>"
}
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `KARNA_RELAY_PUBLIC_URL` | ws://localhost:3000 | 公开访问URL |
| `KARNA_RELAY_REDIS_URL` | redis://localhost:6379 | Redis连接地址 |
| `KARNA_RELAY_ENVELOPE_TTL` | 24 | 离线信封TTL（小时） |
| `KARNA_RELAY_RATE_LIMIT` | 60:60 | 速率限制：请求数:窗口秒数 |
| `KARNA_RELAY_CORS_ORIGINS` | * | CORS允许来源 |
| `LOG_LEVEL` | info | 日志级别 |
