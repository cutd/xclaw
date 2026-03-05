type Handler = (payload: unknown) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  once(event: string, handler: Handler): void {
    const wrapper: Handler = async (payload) => {
      this.off(event, wrapper);
      await handler(payload);
    };
    this.on(event, wrapper);
  }

  async emit(event: string, payload?: unknown): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    const promises = [...handlers].map((h) => h(payload));
    await Promise.all(promises);
  }
}
