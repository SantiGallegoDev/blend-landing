import { env } from '../env';

export function clientIp(request?: Request | null): string | null {
  return request?.headers.get(env.CLIENT_IP_HEADER)?.split(',')[0].trim() || null;
}
