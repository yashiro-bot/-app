// Aliyun OSS STS temporary-credentials helper.
//
// The mobile app uploads collection photos directly to OSS without the
// bytes flowing through the backend. To do that, the backend issues a
// short-lived (1 hour) STS credential pair scoped to a single user's
// prefix (`photos/${userId}/*`). The mobile app uses those creds to call
// oss:PutObject / oss:GetObject directly from the user's device.
//
// Security:
//   - STS credentials expire after DurationSeconds=3600 (the SDK's max).
//   - The inline RAM policy hard-codes the user's prefix — cross-user
//     writes are blocked at the OSS side, not just by our app logic.
//   - We never expose the long-lived OSS_STS_ACCESS_KEY_ID/SECRET to the
//     client. Only the temporary AccessKeyId/Secret/SecurityToken flow
//     out via /oss/sts-token.
//   - We fail loud when env vars are missing — never silently leak a
//     misconfig back to the client as a generic 500.
//
// @alicloud/sts-sdk is a CommonJS module without TypeScript declarations.
// We pull it in via createRequire so the runtime side is identical to
// `const STS = require('@alicloud/sts-sdk')` and only locally type the
// surface we touch. Avoids polluting the codebase with `as any`.

import { createRequire } from 'node:module';
import { config } from '../config/index.js';

const requireCjs = createRequire(import.meta.url);
const STS = requireCjs('@alicloud/sts-sdk') as StsCtor;

interface StsCtor {
  new (cfg: {
    accessKeyId: string;
    accessKeySecret: string;
    endpoint?: string;
  }): StsClient;
}

interface StsClient {
  assumeRole(
    roleArn: string,
    roleSessionName: string,
    policy?: string,
    durationSeconds?: number,
    runtimeOption?: unknown,
  ): Promise<{ readonly Credentials: StsCredentialsRaw }>;
}

interface StsCredentialsRaw {
  readonly AccessKeyId: string;
  readonly AccessKeySecret: string;
  readonly SecurityToken: string;
  readonly Expiration: string;
}

// ─── Public types ────────────────────────────────────────────────────────────

/** Body shape returned by `GET /oss/sts-token` for the mobile app. */
export interface StsCredentials {
  readonly accessKeyId: string;
  readonly accessKeySecret: string;
  readonly securityToken: string;
  readonly expiration: string;
  readonly bucket: string;
  readonly region: string;
  readonly uploadPrefix: string;
}

/** Thrown when OSS is misconfigured or the STS call fails. Carries a
 *  user-presentable message — the route maps it to a 5xx response. */
export class OssConfigError extends Error {
  public override readonly name = 'OssConfigError';
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Reject anything that isn't a positive integer — guards path-prefix
 *  injection (e.g. userId=../42 would let the policy leak across users). */
function assertPositiveIntUserId(userId: number): void {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new OssConfigError(
      `userId must be a positive integer, got: ${String(userId)}`,
    );
  }
}

interface OssRuntimeConfig {
  readonly region: string;
  readonly bucket: string;
  readonly roleArn: string;
  readonly accessKeyId: string;
  readonly accessKeySecret: string;
}

/** Read the 5 OSS env vars. If any is empty, throws an error naming
 *  exactly which ones are missing — never a generic "OSS misconfigured". */
function requireOssConfig(): OssRuntimeConfig {
  const region = config.ossRegion;
  const bucket = config.ossBucket;
  const roleArn = config.ossStsRoleArn;
  const accessKeyId = config.ossStsAccessKeyId;
  const accessKeySecret = config.ossStsAccessKeySecret;

  const missing: string[] = [];
  if (region === '') missing.push('OSS_REGION');
  if (bucket === '') missing.push('OSS_BUCKET');
  if (roleArn === '') missing.push('OSS_STS_ROLE_ARN');
  if (accessKeyId === '') missing.push('OSS_STS_ACCESS_KEY_ID');
  if (accessKeySecret === '') missing.push('OSS_STS_ACCESS_KEY_SECRET');

  if (missing.length > 0) {
    throw new OssConfigError(
      `OSS STS not configured (set ${missing.join(', ')})`,
    );
  }
  // After the missing-list check, all five are non-empty — assert for TS.
  return {
    region: region as string,
    bucket: bucket as string,
    roleArn: roleArn as string,
    accessKeyId: accessKeyId as string,
    accessKeySecret: accessKeySecret as string,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Issue STS temporary credentials scoped to `photos/${userId}/*`.
 *
 * The inline policy grants only `oss:PutObject` and `oss:GetObject`. The
 * Resource ARN is the user's prefix under the configured bucket — no
 * other prefix is reachable with these credentials. Duration is the SDK
 * maximum (3600 s = 1 h) per Aliyun's hard limit (range 900..3600).
 *
 * Throws `OssConfigError` when:
 *   - any of the 5 OSS env vars is missing/empty (with a list of which)
 *   - userId is not a positive integer
 *   - the underlying STS AssumeRole call fails (network, auth, throttle)
 */
export async function getStsToken(userId: number): Promise<StsCredentials> {
  assertPositiveIntUserId(userId);
  const { region, bucket, roleArn, accessKeyId, accessKeySecret } = requireOssConfig();

  // `${userId}/` is already validated as a positive integer by
  // assertPositiveIntUserId, so this prefix can never contain `..`,
  // slashes that escape the user's directory, or any other traversal
  // characters.
  const uploadPrefix = `photos/${userId}/`;

  const policy = {
    Version: '1',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['oss:PutObject', 'oss:GetObject'],
        Resource: [`acs:oss:${region}:*:${bucket}/${uploadPrefix}*`],
      },
    ],
  };

  // STS API requires a session name matching /^[a-zA-Z0-9.@\-_]+$/. We
  // embed the userId (digits) and a timestamp for uniqueness across
  // concurrent requests.
  const sessionName = `cigar-${userId}-${Date.now()}`;

  const client = new STS({
    accessKeyId,
    accessKeySecret,
    endpoint: 'sts.aliyuncs.com',
  });

  let response: { readonly Credentials: StsCredentialsRaw };
  try {
    response = await client.assumeRole(
      roleArn,
      sessionName,
      JSON.stringify(policy),
      3600,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new OssConfigError(`OSS STS AssumeRole failed: ${detail}`);
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId,
    accessKeySecret: response.Credentials.AccessKeySecret,
    securityToken: response.Credentials.SecurityToken,
    expiration: response.Credentials.Expiration,
    bucket,
    region,
    uploadPrefix,
  };
}
