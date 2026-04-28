import type { CorsOptions } from 'cors';

export interface HubCorsOptionsInput {
  nodeEnv?: string;
}

export function getHubCorsOptions(
  corsOrigins: string[],
  options: HubCorsOptionsInput = {}
): CorsOptions {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  if (corsOrigins.length === 0 && nodeEnv === "production") {
    return { origin: false };
  }
  return corsOrigins.length > 0 ? { origin: corsOrigins } : { origin: true };
}
