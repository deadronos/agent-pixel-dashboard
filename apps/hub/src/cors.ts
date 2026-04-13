import type { CorsOptions } from 'cors';

export function getHubCorsOptions(corsOrigins: string[]): CorsOptions {
  return corsOrigins.length > 0 ? { origin: corsOrigins } : { origin: true };
}
