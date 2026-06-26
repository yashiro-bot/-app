// OSS direct-upload API.
//
// Endpoints (backend reference: backend/src/routes/oss.ts):
//   POST /oss/sts-token     — real STS credentials, production path
//   POST /oss/sts-token/dev — mock STS for dev box without Aliyun RAM creds
//
// `getStsToken` is attempted first; on failure (e.g. backend not configured
// with RAM credentials) the caller falls back to `getDevStsToken`, which
// returns a stub whose `bucket` starts with `MOCK_` — the PhotoUploader
// detects this prefix and returns a placeholder URL instead of doing a real
// signed PUT.

import { http } from '../utils/request';

export interface StsCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  bucket: string;
  region: string;
  uploadPrefix: string;
}

export async function getStsToken(): Promise<StsCredentials> {
  const res = await http.post<StsCredentials>('/oss/sts-token');
  return res.data;
}

export async function getDevStsToken(): Promise<StsCredentials> {
  const res = await http.post<StsCredentials>('/oss/sts-token/dev');
  return res.data;
}
