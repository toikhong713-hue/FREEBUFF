// Tiny synchronous event bus used to wire the six subsystems together.
export type Handler<T = unknown> = (payload: T) => void;

export class EventBus {
  private map = new Map<string, Set<Handler<any>>>();

  on<T>(event: string, fn: Handler<T>): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
    };
  }

  once<T>(event: string, fn: Handler<T>): () => void {
    const off = this.on<T>(event, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  emit<T>(event: string, payload?: T): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] handler for "${event}" failed`, err);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}
