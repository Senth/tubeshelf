/**
 * YouTube lounge client — the protocol the phone/YouTube apps use to talk to
 * TV YouTube apps that are not Chromecast receivers (LG webOS, older smart
 * TVs). Sessions pair once with the 12-digit "Link with TV code" shown on the
 * TV and then relay commands through YouTube's lounge servers, so the server
 * does not need to reach the TV over the LAN.
 *
 * Wire format: form-encoded POSTs to youtube.com/api/lounge/bc/bind whose
 * chunked responses carry length-prefixed JSON event tuples
 * [[eventId, [type, ...args]], ...]; "c" and "S" tuples carry the session ids
 * that every later command must echo back.
 */

import logger from "@/lib/logger";

const API_BASE = "https://www.youtube.com/api/lounge";

export interface PairingResult {
  screenId: string;
  loungeToken: string;
  name: string | null;
}

const STATE_STOPPED = -1;
const STATE_PLAYING = 1;
const STATE_PAUSED = 2;

export function isPlaybackActive(state: unknown): boolean {
  const parsed = Number(state);
  return parsed === STATE_PLAYING || parsed === STATE_PAUSED;
}

async function postForm(
  path: string,
  data: Record<string, string>,
  query: Record<string, string | number> = {},
  timeoutMs = 15000
): Promise<Response> {
  const url = new URL(path, `${API_BASE}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams(data).toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Exchange a 12-digit "Link with TV code" for permanent screen credentials. */
export async function pairWithCode(pairingCode: string): Promise<PairingResult> {
  const response = await postForm("pairing/get_screen", {
    pairing_code: pairingCode,
  });
  const payload = await response.json().catch(() => null);
  const screen = payload?.screen;
  if (!screen?.screenId || !screen?.loungeToken) {
    throw new Error(
      "That TV code was not accepted — check the code and that the YouTube app is open on the TV"
    );
  }
  return {
    screenId: screen.screenId,
    loungeToken: screen.loungeToken,
    name: typeof screen.name === "string" ? screen.name : null,
  };
}

/** Fresh short-lived lounge token for a stored screen id. */
export async function refreshLoungeToken(screenId: string): Promise<string> {
  const response = await postForm("pairing/get_lounge_token_batch", {
    screen_ids: screenId,
  });
  if (!response.ok) {
    throw new Error("Could not reach YouTube to refresh the TV pairing");
  }
  const payload = await response.json().catch(() => null);
  const screen = payload?.screens?.[0];
  if (!screen?.loungeToken) {
    throw new Error("The TV pairing is no longer valid — link the TV again");
  }
  return screen.loungeToken;
}

export async function screenIsOnline(loungeToken: string): Promise<boolean> {
  try {
    const response = await postForm(
      "pairing/get_screen_availability",
      { lounge_token: loungeToken },
      {},
      6000
    );
    const payload = await response.json().catch(() => null);
    return payload?.screens?.[0]?.status === "online";
  } catch {
    return false;
  }
}

interface EventTuple {
  id: number;
  payload: any[];
}

export interface LoungeEvent {
  type: string;
  args: any[];
}

function ingestChunkText(text: string, sink: (chunk: EventTuple[]) => void): void {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  let remaining = 0;
  let current = "";
  for (const line of lines) {
    if (remaining <= 0) {
      const length = parseInt(line.trim(), 10);
      if (!Number.isNaN(length)) {
        remaining = length;
        current = "";
      }
      continue;
    }
    const clean = line.replace(/\n/g, "");
    current += clean;
    remaining -= clean.length + 1;
    if (remaining === 0) {
      try {
        const chunk = JSON.parse(current) as [number, any[]][];
        sink(chunk.map(([id, payload]) => ({ id, payload: payload || [] })));
      } catch {
        logger.warn("lounge: undecodable event chunk");
      }
      current = "";
    }
  }
}

export class LoungeApi {
  private deviceName: string;
  private screenId: string;
  private loungeToken: string | null;
  private sid: string | null = null;
  private gsession: string | null = null;
  private lastEventId: number | null = null;
  private commandOffset = 1;
  private subscribeAbort: AbortController | null = null;
  private pending: LoungeEvent[] = [];
  private dead = false;

  constructor(options: { deviceName: string; screenId: string; loungeToken: string }) {
    this.deviceName = options.deviceName;
    this.screenId = options.screenId;
    this.loungeToken = options.loungeToken;
  }

  isDead(): boolean {
    return this.dead;
  }

  private commonParams(): Record<string, string> {
    const params: Record<string, string> = {
      name: this.deviceName,
      device: "REMOTE_CONTROL",
      app: "youtube-desktop",
      VER: "8",
      v: "2",
    };
    if (this.loungeToken !== null) params.loungeIdToken = this.loungeToken;
    if (this.sid !== null) params.SID = this.sid;
    if (this.lastEventId !== null) params.AID = String(this.lastEventId);
    if (this.gsession !== null) params.gsessionid = this.gsession;
    return params;
  }

  private async bind(
    body: Record<string, string>,
    query: Record<string, string>,
    timeoutMs = 10000
  ): Promise<Response> {
    const url = new URL("bc/bind", `${API_BASE}/`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams(body).toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private handleSessionFailure(status: number, text: string): boolean {
    if (status === 400 && text.includes("Unknown SID")) return false;
    if (status === 410 && text.includes("Gone")) return false;
    if (status === 401 && text.includes("Expired")) {
      this.loungeToken = null;
      return false;
    }
    return true;
  }

  private ingestChunk(chunk: EventTuple[]): void {
    for (const tuple of chunk) {
      const id = tuple.id;
      const [type, ...args] = tuple.payload;
      if (typeof id === "number") this.lastEventId = id;
      if (type === "c") {
        this.sid = args[0];
      } else if (type === "S") {
        this.gsession = args[0];
      } else if (type === "loungeScreenDisconnected") {
        this.markDead();
      } else {
        this.pending.push({ type, args });
      }
    }
  }

  private async bindSession(
    body: Record<string, string>,
    query: Record<string, string>
  ): Promise<Response> {
    return this.bind(body, { ...this.commonParams(), ...query });
  }

  /** Establish the bc session. Resolves true once SID and gsession arrived. */
  async connect(): Promise<boolean> {
    if (this.loungeToken === null) throw new Error("No lounge token");
    const response = await this.bindSession(
      {
        app: "web",
        "mdx-version": "3",
        name: this.deviceName,
        id: this.screenId,
        device: "REMOTE_CONTROL",
        capabilities: "que,dsdtr,atp,vsp",
        magnaKey: "cloudPairedDevice",
        ui: "false",
        deviceContext:
          "user_agent=dunno&window_width_points=&window_height_points=&os_name=android&ms=",
        theme: "cl",
        loungeIdToken: this.loungeToken,
      },
      { RID: "1", VER: "8", CVER: "1", auth_failure_option: "send_error" }
    );
    const text = await response.text();
    if (response.status === 401) {
      this.loungeToken = null;
      return false;
    }
    if (response.status !== 200) {
      logger.warn(`lounge connect failed: ${response.status} ${text.slice(0, 200)}`);
      return false;
    }
    ingestChunkText(text, (chunk) => this.ingestChunk(chunk));
    return this.sid !== null && this.gsession !== null;
  }

  /** Consume events the TV pushed so far (from connect or the poll loop). */
  drainEvents(): LoungeEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  /** Long-poll the event stream once. Call again in a loop until dead. */
  async pollEvents(): Promise<void> {
    this.subscribeAbort = new AbortController();
    try {
      const response = await this.bindSession(
        {},
        { RID: "rpc", CI: "0", TYPE: "xmlhttp" }
      );
      const text = await response.text();
      if (
        !this.handleSessionFailure(
          response.status,
          response.statusText || text.slice(0, 200)
        )
      ) {
        this.markDead();
        return;
      }
      ingestChunkText(text, (chunk) => this.ingestChunk(chunk));
    } catch (err) {
      if (!this.subscribeAbort.signal.aborted) {
        logger.warn(`lounge event stream failed: ${err instanceof Error ? err.message : err}`);
        this.markDead();
      }
    } finally {
      this.subscribeAbort = null;
    }
  }

  stopSubscribe(): void {
    this.subscribeAbort?.abort();
    this.subscribeAbort = null;
  }

  private markDead(): void {
    this.dead = true;
    this.sid = null;
    this.gsession = null;
  }

  private async command(
    name: string,
    parameters: Record<string, string | number> = {}
  ): Promise<boolean> {
    if (this.sid === null || this.gsession === null) return false;

    const body: Record<string, string> = {
      count: "1",
      ofs: String(this.commandOffset),
      req0__sc: name,
    };
    for (const [key, value] of Object.entries(parameters)) {
      body[`req0_${key}`] = String(value);
    }
    this.commandOffset += 1;

    const response = await this.bindSession(body, {
      RID: String(this.commandOffset),
    });
    const text = await response.text();
    if (!this.handleSessionFailure(response.status, text)) {
      this.markDead();
      return false;
    }
    if (!response.ok) {
      throw new Error(`TV rejected the ${name} command (${response.status})`);
    }
    return true;
  }

  playVideo(videoId: string): Promise<boolean> {
    return this.command("setPlaylist", { videoId });
  }

  play(): Promise<boolean> {
    return this.command("play");
  }

  pause(): Promise<boolean> {
    return this.command("pause");
  }

  next(): Promise<boolean> {
    return this.command("next");
  }

  setPlaybackSpeed(rate: number): Promise<boolean> {
    return this.command("setPlaybackSpeed", { playbackSpeed: rate });
  }

  /** Best effort; some TV apps ignore it, then terminate is the only stopper. */
  stopVideo(): Promise<boolean> {
    return this.command("stopVideo");
  }

  /** Close the cast session the way the phone app does. */
  async disconnect(): Promise<void> {
    if (this.sid === null || this.gsession === null) return;
    this.stopSubscribe();
    try {
      await this.bindSession(
        {
          ui: "",
          TYPE: "terminate",
          clientDisconnectReason: "MDX_SESSION_DISCONNECT_REASON_DISCONNECTED_BY_USER",
        },
        { CVER: "1", RID: String(this.commandOffset), auth_failure_option: "send_error" }
      );
    } catch {
      // Terminate is best effort.
    }
    this.markDead();
  }
}
