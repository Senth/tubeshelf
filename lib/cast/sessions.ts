/**
 * Cast sessions: one per TV we are playing to. Two transports exist:
 *  - chromecast: direct Cast V2 connection on the LAN (lib/cast/castClient)
 *  - lounge: cloud-relayed YouTube lounge session for TVs without Chromecast
 *    (lib/cast/lounge), paired once with a TV code
 * In-memory on purpose — when the server restarts the TV keeps playing and the
 * next cast simply replaces the session.
 */

import { CastClient, NS_MDX, YOUTUBE_APP_ID } from "./castClient";
import { LoungeApi, refreshLoungeToken } from "./lounge";
import { listCastScreens } from "./castScreens";
import logger from "@/lib/logger";

export type CastDeviceKind = "chromecast" | "lounge";

export interface CastSession {
  kind: CastDeviceKind;
  id: string;
  name: string;
  videoId: string;
  startedAt: number;
}

interface ChromecastSession extends CastSession {
  kind: "chromecast";
  client: CastClient;
}

interface LoungeSession extends CastSession {
  kind: "lounge";
  api: LoungeApi;
}

type ActiveSession = ChromecastSession | LoungeSession;

const sessions = new Map<string, ActiveSession>();

/** How long we give the TV app to confirm it took the video. */
const MDX_ACK_TIMEOUT_MS = 12000;
const LOUNGE_ACK_TIMEOUT_MS = 10000;

export interface StartCastInput {
  kind: CastDeviceKind;
  /** Chromecast: IP address; lounge: screenId. */
  id: string;
  name: string;
  videoId: string;
  /** Preferred playback speed; lounge TVs apply it after the queue lands. */
  speed?: number;
}

function register(session: ActiveSession): CastSession {
  const { kind, id, name, videoId, startedAt } = session;
  sessions.set(id, session);
  return { kind, id, name, videoId, startedAt };
}

async function startChromecastSession(
  input: StartCastInput
): Promise<CastSession> {
  // Cast devices occasionally swallow the first request after a fresh
  // connection, so the whole attempt gets one cheap retry.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = new CastClient();
    try {
      await client.connect(input.id);
      const transportId = await client.launchApp(YOUTUBE_APP_ID);
      client.connectToApp(transportId);
      client.send(NS_MDX, transportId, {
        type: "playVideo",
        videoId: input.videoId,
        queueType: "PLAYLIST",
      });
      await waitForMdxAck(client, MDX_ACK_TIMEOUT_MS);
      const session: ChromecastSession = {
        kind: "chromecast",
        id: input.id,
        name: input.name,
        videoId: input.videoId,
        startedAt: Date.now(),
        client,
      };
      client.on("close", () => {
        // TV closed the app, network dropped, or the heartbeat died.
        if (sessions.get(input.id) === session) sessions.delete(input.id);
      });
      return register(session);
    } catch (err) {
      lastError = err;
      client.close();
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not start casting");
}

/** Resolve once the YouTube app answers over MDX, or after the timeout. */
function waitForMdxAck(client: CastClient, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // The command is almost certainly in the app's inbox already; treating
      // silence as success keeps flaky-but-working TVs from erroring out.
      logger.warn("No MDX acknowledgement from the YouTube app, assuming playback started");
      cleanup();
      resolve();
    }, timeoutMs);
    const onMessage = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      client.off("message", onMessage);
    };
    client.on("message", onMessage);
  });
}

function waitForLoungeAck(api: LoungeApi, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      // Silence is not failure here either: several TV apps never send a
      // nowPlaying until playback truly starts, which may take seconds.
      logger.warn("No lounge acknowledgement from the TV, assuming playback started");
      resolve(true);
    }, timeoutMs);
    const check = () => {
      const events = api.drainEvents();
      // playlistModified is the queue acknowledgement most TV apps send right
      // away; nowPlaying/onStateChange follow only on some devices.
      const playbackStarted = events.some((event) =>
        ["nowPlaying", "onStateChange", "playlistModified"].includes(event.type)
      );
      if (playbackStarted || api.isDead()) {
        cleanup();
        resolve(!api.isDead());
      }
    };
    const interval = setInterval(check, 250);
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  });
}

async function startLoungeSession(input: StartCastInput): Promise<CastSession> {
  const paired = listCastScreens().find((screen) => screen.screenId === input.id);
  if (!paired) {
    throw new Error("This TV is not linked anymore — link it again with a new TV code");
  }

  let loungeToken: string;
  try {
    loungeToken = await refreshLoungeToken(paired.screenId);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Could not refresh the TV pairing");
  }

  const api = new LoungeApi({
    deviceName: "TubeShelf",
    screenId: paired.screenId,
    loungeToken,
  });

  let connected = await api.connect();
  if (!connected && api.isDead()) {
    // Lounge token expired between refresh and connect; one more round.
    throw new Error("The TV did not accept the session — is the YouTube app open on it?");
  }
  if (!connected) {
    throw new Error("The TV did not accept the session — is the YouTube app open on it?");
  }

  const session: LoungeSession = {
    kind: "lounge",
    id: input.id,
    name: input.name,
    videoId: input.videoId,
    startedAt: Date.now(),
    api,
  };

  const pollLoop = (async () => {
    while (!api.isDead()) {
      await api.pollEvents();
      if (api.isDead()) break;
      // Tiny pause keeps a dead TV from turning into a hot request loop.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (sessions.get(input.id) === session) {
      // TV closed the app or killed the session on its own.
      sessions.delete(input.id);
    }
  })();
  void pollLoop.catch(() => {});

  await api.playVideo(input.videoId);
  if (typeof input.speed === "number") {
    // Queue first: setPlaylist resets the app's playback state, so speed goes
    // after it. Best effort — some TV apps ignore the command.
    try {
      await api.setPlaybackSpeed(input.speed);
    } catch {
      logger.warn(`TV ignored the setPlaybackSpeed command (${input.speed}x)`);
    }
  }
  const acked = await waitForLoungeAck(api, LOUNGE_ACK_TIMEOUT_MS);

  if (!acked || api.isDead()) {
    api.stopSubscribe();
    throw new Error("The TV dropped the session right after it started");
  }

  logger.info(`Casting ${input.videoId} to ${input.name} (${input.id}) via lounge`);
  return register(session);
}

export async function startCastSession(input: StartCastInput): Promise<CastSession> {
  // A new cast to the same TV replaces the old session without stopping
  // playback first — the YouTube app just switches videos.
  const previous = sessions.get(input.id);
  if (previous) {
    sessions.delete(input.id);
    if (previous.kind === "chromecast") {
      previous.client.close();
    } else {
      previous.api.stopSubscribe();
    }
  }

  if (input.kind === "lounge") {
    return startLoungeSession(input);
  }
  return startChromecastSession(input);
}

export async function stopCastSession(id: string): Promise<boolean> {
  const session = sessions.get(id);
  if (!session) return false;
  sessions.delete(id);
  try {
    if (session.kind === "chromecast") {
      session.client.close();
    } else {
      await session.api.stopVideo();
      await session.api.disconnect();
    }
  } catch {
    // Device already gone — cleanup below is the real work.
  }
  return true;
}

export function getActiveCastSessions(): CastSession[] {
  return [...sessions.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map(({ kind, id, name, videoId, startedAt }) => ({ kind, id, name, videoId, startedAt }));
}
