// OSS direct-upload API. Real implementation lands in T17.
//
// Endpoints (backend reference: backend/src/routes/oss.ts):
//   POST /oss/sts-token     — real STS credentials, production path
//   POST /oss/sts-token/dev — mock STS for dev box without Aliyun RAM creds

import { http } from '../utils/request';

export interface StsCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string; // ISO date-time
  bucket: string;
  region: string;
  uploadPrefix: string; // e.g. "photos/123/"
  _mock?: true; // present only on the /dev endpoint
}

export function getStsToken(): Promise<StsCredentials> {
  // TODO(T17): real call → http.post<StsCredentials>('/oss/sts-token')
  throw new Error('getStsToken() not implemented (T17)');
}

export function getStsTokenDev(): Promise<StsCredentials> {
  // TODO(T17): real call → http.post<StsCredentials>('/oss/sts-token/dev')
  throw new Error('getStsTokenDev() not implemented (T17)');
}
