export type InstallOutcome = "accepted" | "dismissed" | "unavailable" | "error";
export type DeferredInstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type InstallEnvironment = {
  path(): string;
  manifest(): string | null;
  standalone(): boolean;
  listen(name: "beforeinstallprompt" | "appinstalled", handler: (event: Event) => void): () => void;
  listenDisplay(handler: () => void): () => void;
};

// Browser capability only: never credentials or evidence of access.
export class PwaInstallController {
  private deferred: { event: DeferredInstallEvent; manifest: string } | null = null;
  private busy = false;
  private stopListening: Array<() => void> = [];
  private subscribers = new Set<() => void>();
  private snapshot = { standalone: false, requested: false };
  constructor(private environment: InstallEnvironment) {}
  getSnapshot() { return this.snapshot; }
  subscribe(handler: () => void) { this.subscribers.add(handler); return () => { this.subscribers.delete(handler); }; }
  private update(value: Partial<typeof this.snapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    this.subscribers.forEach(handler => handler());
  }
  start() {
    this.stop();
    const sync = () => this.update({ standalone: this.environment.standalone() });
    sync();
    this.stopListening = [
      this.environment.listen("beforeinstallprompt", event => {
        if (!/^\/[^/]+\/(login|device-setup|admin|staff|kitchen|cashier)(\/|$)/.test(this.environment.path())) return;
        const manifest = this.environment.manifest();
        if (!manifest) return;
        event.preventDefault(); this.deferred = { event: event as DeferredInstallEvent, manifest };
      }),
      this.environment.listen("appinstalled", () => { this.deferred = null; this.update({ requested: true }); }),
      this.environment.listenDisplay(sync)
    ];
  }
  stop() { this.stopListening.forEach(stop => stop()); this.stopListening = []; this.deferred = null; }
  async requestInstall(): Promise<InstallOutcome> {
    if (this.snapshot.standalone || this.busy || !this.deferred) return "unavailable";
    if (this.deferred.manifest !== this.environment.manifest()) { this.deferred = null; return "unavailable"; }
    const { event } = this.deferred;
    this.busy = true; this.deferred = null;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "accepted") this.update({ requested: true });
      return outcome;
    } catch { return "error"; }
    finally { this.busy = false; }
  }
}
