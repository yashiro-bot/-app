// OSS STS routes.
//
// POST /oss/sts-token       — auth required; returns a fresh STS credential
//                             pair scoped to photos/${userId}/*. Path-prefix
//                             is bound from `req.user.sub` server-side —
//                             the client cannot influence it.
// POST /oss/sts-token/dev   — DEV ONLY (404 in production). Returns MOCK
//                             credentials without calling STS. Useful when
//                             the dev box doesn't have Aliyun RAM creds yet
//                             but the mobile app still wants to wire up
//                             the upload flow.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { getStsToken, OssConfigError, type StsCredentials } from '../lib/oss.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function positiveIntGuard(reply: FastifyReply, userId: number | undefined): userId is number {
  if (userId === undefined || !Number.isInteger(userId) || userId <= 0) {
    void reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'userId must be a positive integer',
    });
    return false;
  }
  return true;
}

// ─── Route registration ─────────────────────────────────────────────────────

export async function registerOssRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /oss/sts-token ───────────────────────────────────────────────────
  // Production endpoint. Calls the real STS API. 500 with a clear message
  // if env vars are missing; the client should never see a generic 500.
  app.post('/oss/sts-token', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user?.sub;
    if (!positiveIntGuard(reply, userId)) return;

    try {
      const creds = await getStsToken(userId);
      return creds;
    } catch (err) {
      if (err instanceof OssConfigError) {
        app.log.warn({ err: { message: err.message } }, 'OSS STS misconfigured');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: err.message,
        });
      }
      throw err;
    }
  });

  // ── POST /oss/sts-token/dev ──────────────────────────────────────────────
  // Dev-only mock. Returns credentials with the same shape as the real
  // endpoint, so the mobile app's upload code is identical in dev and
  // prod. Disabled (404) in production — never expose to a real user.
  app.post('/oss/sts-token/dev', { preHandler: requireAuth }, async (req, reply) => {
    if (config.nodeEnv === 'production') {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'dev endpoint disabled in production',
      });
    }

    const userId = req.user?.sub;
    if (!positiveIntGuard(reply, userId)) return;

    const now = new Date();
    const mock: StsCredentials & { _mock: true } = {
      accessKeyId: 'MOCK_STS_ACCESS_KEY_ID',
      accessKeySecret: 'MOCK_STS_ACCESS_KEY_SECRET',
      securityToken: 'MOCK_STS_SECURITY_TOKEN',
      expiration: new Date(now.getTime() + 3600 * 1000).toISOString(),
      bucket: config.ossBucket === '' ? 'MOCK_BUCKET' : config.ossBucket,
      region: config.ossRegion === '' ? 'oss-cn-shanghai' : config.ossRegion,
      uploadPrefix: `photos/${userId}/`,
      _mock: true,
    };
    return mock;
  });
}
