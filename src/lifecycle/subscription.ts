export interface HasSubscribeEvents {
  subscribeEvents(
    callback: (event: { data: { entity_id: string } }) => void,
    eventType: string
  ): Promise<() => void>;
}

export class SubscriptionManager {
  private _gen = 0;
  private _unsub: (() => void) | null = null;

  get active(): boolean {
    return this._unsub !== null;
  }

  subscribe(
    connection: Partial<HasSubscribeEvents> | null | undefined,
    trackedIds: Set<string> | null | undefined,
    onMatch: () => void
  ): void {
    if (!connection?.subscribeEvents) return;
    const gen = this._gen;
    connection
      .subscribeEvents((event) => {
        if (this._gen === gen && trackedIds?.has(event.data.entity_id)) {
          onMatch();
        }
      }, "state_changed")
      .then((unsub) => {
        if (this._gen === gen) {
          this._unsub = unsub;
        } else {
          unsub();
        }
      })
      .catch(() => {});
  }

  clear(): void {
    this._gen++;
    this._unsub?.();
    this._unsub = null;
  }
}
