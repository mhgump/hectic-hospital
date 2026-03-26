let playTracked = false;
let heartbeatTimer: number | null = null;
let heartbeatActive = false;

const HEARTBEAT_INTERVAL_MS = 15000;

type GameMeta = {
  slug: string;
  analyticsUrl: string;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function loadGameMeta(): Promise<GameMeta> {
  const res = await fetch("/game.json", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GET /game.json failed (${res.status})`);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error("game.json did not return JSON");
  }

  const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw) {
    throw new Error("Invalid game.json payload");
  }

  return {
    slug: normalizeString(raw.slug),
    analyticsUrl: normalizeString(raw.analyticsUrl),
  };
}

function getHeartbeatUrl(analyticsUrl: string): string {
  const url = new URL(analyticsUrl);
  url.pathname = "/api/heartbeat";
  url.search = "";
  return url.toString();
}

async function sendPlay(analyticsUrl: string, slug: string): Promise<void> {
  const res = await fetch(analyticsUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
    keepalive: true,
    mode: "cors",
  });

  if (!res.ok) {
    throw new Error(`POST ${analyticsUrl} failed (${res.status})`);
  }
}

function stopHeartbeat(heartbeatUrl: string, slug: string, sessionId: string) {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  void fetch(heartbeatUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, sessionId, ended: true }),
    keepalive: true,
    mode: "cors",
  }).catch((err) => {
    console.warn("[analytics] Heartbeat end failed.", err);
  });
}

function startHeartbeat(heartbeatUrl: string, slug: string) {
  if (heartbeatActive) return;
  heartbeatActive = true;

  let sessionId = crypto.randomUUID();

  const beat = () =>
    fetch(heartbeatUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, sessionId }),
      keepalive: true,
      mode: "cors",
    }).catch((err) => {
      console.warn("[analytics] Heartbeat failed.", err);
    });

  void beat();
  heartbeatTimer = window.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);

  const handleVisibility = () => {
    if (document.hidden) {
      stopHeartbeat(heartbeatUrl, slug, sessionId);
    } else {
      sessionId = crypto.randomUUID();
      void beat();
      if (heartbeatTimer === null) {
        heartbeatTimer = window.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
      }
    }
  };

  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", () => stopHeartbeat(heartbeatUrl, slug, sessionId));
}

export async function trackPlay(): Promise<void> {
  if (playTracked) return;
  playTracked = true;

  try {
    const meta = await loadGameMeta();
    if (!meta.slug || !meta.analyticsUrl) {
      throw new Error("Missing slug or analyticsUrl in /game.json");
    }

    const heartbeatUrl = getHeartbeatUrl(meta.analyticsUrl);

    await sendPlay(meta.analyticsUrl, meta.slug);
    startHeartbeat(heartbeatUrl, meta.slug);
  } catch (err) {
    console.warn("[analytics] Tracking skipped.", err);
  }
}
