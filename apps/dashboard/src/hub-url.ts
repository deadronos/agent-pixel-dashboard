export function buildHubWebSocketUrl(hubHttp: string): string {
  const base = new URL(hubHttp);
  const protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${base.host}/ws`;
}
