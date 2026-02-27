/**
 * WebSocket client manager for the Living Textbook backend.
 *
 * Handles:
 * - Connection lifecycle with automatic reconnect
 * - Typed message sending
 * - Callback-based message dispatch
 */

export type ServerMessage =
  | { type: "status"; content: string }
  | { type: "meta"; subject: string; topic: string }
  | { type: "title"; content: string }
  | { type: "section_start"; section_id: number }
  | { type: "audio"; section_id: number; data: string }
  | { type: "text"; section_id: number; content: string }
  | { type: "image_url"; section_id: number; url: string; caption: string }
  | { type: "section_end"; section_id: number }
  | { type: "error"; content: string }
  | { type: "done" };

export interface WSClientOptions {
  url: string;
  onMessage: (msg: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private options: WSClientOptions;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private shouldReconnect = true;

  constructor(options: WSClientOptions) {
    this.options = options;
  }

  connect(): void {
    this.shouldReconnect = true;
    this._open();
  }

  private _open(): void {
    try {
      this.ws = new WebSocket(this.options.url);

      this.ws.onopen = () => {
        this.reconnectDelay = 2000;
        this.options.onOpen?.();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          this.options.onMessage(msg);
        } catch {
          console.warn("WSClient: failed to parse message", event.data);
        }
      };

      this.ws.onclose = () => {
        this.options.onClose?.();
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 10000);
            this._open();
          }, this.reconnectDelay);
        }
      };

      this.ws.onerror = (err) => {
        this.options.onError?.(err);
      };
    } catch (err) {
      console.error("WSClient: could not open WebSocket", err);
    }
  }

  sendPhoto(base64Jpeg: string): void {
    this._send({ type: "photo", data: base64Jpeg });
  }

  sendQuestion(text: string): void {
    this._send({ type: "question", text });
  }

  sendStop(): void {
    this._send({ type: "stop" });
  }

  private _send(payload: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn("WSClient: attempted to send while not connected");
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
