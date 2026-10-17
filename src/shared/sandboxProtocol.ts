import type { Localized } from './i18n';

export type SandboxRequest =
  | { id: number; op: 'check'; pac: string }
  | { id: number; op: 'eval'; pac: string; urls: string[] };

export type SandboxResponse =
  | { id: number; ok: true; results?: { url: string; host: string; result: string }[] }
  | { id: number; ok: false; error: Localized };

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export class SandboxClient {
  private frame: HTMLIFrameElement | null = null;
  private ready: Promise<void> | null = null;
  private seq = 0;
  private pending = new Map<number, (r: SandboxResponse) => void>();

  private init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve) => {
      const frame = document.createElement('iframe');
      frame.src = chrome.runtime.getURL('sandbox.html');
      frame.hidden = true;
      frame.addEventListener('load', () => resolve(), { once: true });
      window.addEventListener('message', (e) => {
        if (e.source !== frame.contentWindow) return;
        const msg = e.data as SandboxResponse;
        this.pending.get(msg.id)?.(msg);
        this.pending.delete(msg.id);
      });
      document.body.append(frame);
      this.frame = frame;
    });
    return this.ready;
  }

  async request(req: WithoutId<SandboxRequest>, timeoutMs = 5000): Promise<SandboxResponse> {
    await this.init();
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.frame?.remove();
        this.frame = null;
        this.ready = null;
        resolve({ id, ok: false, error: { key: 'sandbox.timeout' } });
      }, timeoutMs);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      this.frame!.contentWindow!.postMessage({ ...req, id }, '*');
    });
  }
}
