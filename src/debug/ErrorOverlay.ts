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
      console.error(`Error: ${msg}`);
    });

    window.addEventListener("unhandledrejection", (ev) => {
      const r = (ev as PromiseRejectionEvent).reason;
      const msg = r instanceof Error ? r.stack ?? r.message : String(r);
      console.error(`Unhandled rejection: ${msg}`);
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
    // #region agent log
    fetch('http://127.0.0.1:7787/ingest/ff287420-bd71-42b1-a96a-cab11f8b9ea0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ecbfa3'},body:JSON.stringify({sessionId:'ecbfa3',location:'ErrorOverlay.ts:show',message:'ErrorOverlay.show called',data:{errorMessage:message},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }

  clear() {
    this.lastMessage = "";
    this.el.style.display = "none";
    this.el.textContent = "";
  }
}


