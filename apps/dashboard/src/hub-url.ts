export function buildHubWebSocketUrl(hubHttp: string): string {
  const base = new URL(hubHttp);
  const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${base.host}/ws`;
}

export function resolveHubWebSocketUrl(explicitHubWs: string | undefined, hubHttp: string): string {
  const trimmed = explicitHubWs?.trim();
  return trimmed ? trimmed : buildHubWebSocketUrl(hubHttp);
}
