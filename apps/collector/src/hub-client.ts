export interface HubClientOptions {
  hubUrl: string;
  hubToken: string;
}

export class HubClient {
  private readonly options: HubClientOptions;

  constructor(options: HubClientOptions) {
    this.options = options;
  }

  async postBodies(bodies: readonly string[]): Promise<void> {
    await Promise.all(
      bodies.map(async (body) => {
        const response = await fetch(`${this.options.hubUrl}/api/events/batch`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.options.hubToken}`
          },
          body,
          signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
          throw new Error(`hub rejected batch: ${response.status} ${response.statusText}`);
        }
      })
    );
  }
}
