export class ErrorOverlay {
  private readonly el: HTMLDivElement;
  private lastMessage = "";

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "jk_error";
    this.el.style.display = "none";
    document.body.appendChild(this.el);

    window.addEventListener("error", (ev) => {
      const msg = ev.error instanceof Error ? ev.error.stack ?? ev.error.message : String(ev.message);
      this.show(`Error: ${msg}`);
    });

    window.addEventListener("unhandledrejection", (ev) => {
      const r = (ev as PromiseRejectionEvent).reason;
      const msg = r instanceof Error ? r.stack ?? r.message : String(r);
      this.show(`Unhandled rejection: ${msg}`);
    });
  }

  dispose() {
    this.el.remove();
  }

  show(message: string) {
    if (message === this.lastMessage) return;
    this.lastMessage = message;
    this.el.style.display = "block";
    this.el.textContent = message;
  }

  clear() {
    this.lastMessage = "";
    this.el.style.display = "none";
    this.el.textContent = "";
  }
}


