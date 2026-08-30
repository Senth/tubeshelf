/**
 * Minimal Cast V2 protocol client — enough to launch the YouTube receiver app
 * on a cast device and send it playback commands.
 *
 * Protocol: TLS on port 8009, length-prefixed protobuf frames carrying JSON
 * payloads (see the CastMessage definition in the Google Cast docs). The frame
 * format is fixed enough that hand-rolling the encoder beats pulling in a
 * protobuf stack for five fields.
 */

import { EventEmitter } from "node:events";
import tls from "node:tls";
import logger from "@/lib/logger";

const NS_CONNECTION = "urn:x-cast:com.google.cast.tp.connection";
const NS_HEARTBEAT = "urn:x-cast:com.google.cast.tp.heartbeat";
export const NS_RECEIVER = "urn:x-cast:com.google.cast.receiver";
export const NS_MDX = "urn:x-cast:com.google.youtube.mdx";

/** The YouTube receiver app. Same id every cast sender uses. */
export const YOUTUBE_APP_ID = "233637DE";

const SENDER_ID = "client-tubeshelf";
const RECEIVER_ID = "receiver-0";
const PING_INTERVAL_MS = 5000;
const DEAD_AFTER_MS = 15000;

export interface CastReceiverApp {
  appId: string;
  transportId?: string;
  sessionId?: string;
  displayName?: string;
}

export interface CastReceiverStatus {
  applications?: CastReceiverApp[];
}

function encodeVarint(value: number): Buffer {
  const out: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    out.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  out.push(rest);
  return Buffer.from(out);
}

function encodeField(tag: number, value: string): Buffer {
  const payload = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([tag]), encodeVarint(payload.length), payload]);
}

/** Serialize a CastMessage frame. Field layout: 1=version, 2=source, 3=dest, 4=ns, 5=type, 6=json. */
function encodeMessage(
  sourceId: string,
  destinationId: string,
  namespace: string,
  payloadUtf8: string
): Buffer {
  return Buffer.concat([
    Buffer.from([0x08, 0x00]), // protocol_version = CASTV2_1_0
    encodeField(0x12, sourceId),
    encodeField(0x1a, destinationId),
    encodeField(0x22, namespace),
    Buffer.from([0x28, 0x00]), // payload_type = STRING
    encodeField(0x32, payloadUtf8),
  ]);
}

/** Read one varint at offset; returns [value, nextOffset] or null when truncated. */
function decodeVarint(buf: Buffer, offset: number): [number, number] | null {
  let value = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    if (pos >= buf.length) return null;
    const byte = buf[pos++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [value, pos];
    shift += 7;
    if (shift > 35) return null;
  }
}

/** Skip to the next field tag assuming wire type 0 (varint); returns end offset. */
function skipVarintField(buf: Buffer, offset: number): number | null {
  const next = decodeVarint(buf, offset);
  return next ? next[1] : null;
}

/** Skip a length-delimited field (wire type 2); returns end offset. */
function skipLengthField(buf: Buffer, offset: number): number | null {
  const length = decodeVarint(buf, offset);
  if (!length) return null;
  const end = length[1] + length[0];
  return end <= buf.length ? end : null;
}

export interface InboundMessage {
  sourceId: string;
  namespace: string;
  data: any;
}

export class CastClient extends EventEmitter {
  private socket: tls.TLSSocket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private requestId = 0;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;
  private closed = false;

  connect(host: string, timeoutMs = 6000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = tls.connect({
        host,
        port: 8009,
        rejectUnauthorized: false,
      });

      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        if (err) reject(err);
        else resolve();
      };

      const giveUp = setTimeout(() => {
        socket.destroy();
        settle(new Error(`Could not reach the device at ${host}`));
      }, timeoutMs);

      socket.on("secureConnect", () => {
        this.socket = socket;
        this.lastMessageAt = Date.now();
        // Platform channel first; the receiver only talks to connected senders.
        this.sendRaw(NS_CONNECTION, RECEIVER_ID, { type: "CONNECT" });
        this.heartbeatTimer = setInterval(() => this.heartbeatTick(), PING_INTERVAL_MS);
        socket.on("close", () => this.handleClose());
        settle();
      });
      socket.on("data", (chunk: Buffer) => this.handleData(chunk));
      socket.on("error", (err: Error) => {
        socket.destroy();
        if (settled) this.handleClose();
        else settle(err);
      });
    });
  }

  /** Send a JSON payload on a namespace. Fire-and-forget. */
  send(namespace: string, destinationId: string, payload: object): void {
    this.sendRaw(namespace, destinationId, payload);
  }

  /**
   * Request/response on the receiver channel. Resolves with the RECEIVER_STATUS
   * (or error type) that echoes the requestId.
   */
  request(payload: object, timeoutMs = 5000): Promise<any> {
    const requestId = ++this.requestId;
    const body = { ...payload, requestId };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Device did not answer in time"));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.sendRaw(NS_RECEIVER, RECEIVER_ID, body);
    });
  }

  /** GET_STATUS, with the payload unwrapped from its "status" envelope. */
  async getStatus(timeoutMs = 5000): Promise<CastReceiverStatus> {
    const response = await this.request({ type: "GET_STATUS" }, timeoutMs);
    return response?.status ?? {};
  }

  /** Launch an app by id and return its transportId. Reuses a running app. */
  async launchApp(appId: string): Promise<string> {
    const status = await this.getStatus();
    const running = status.applications?.find((app) => app.appId === appId);
    if (running?.transportId) return running.transportId;

    const launched = await this.request({ type: "LAUNCH", appId }, 15000);
    const app = launched.applications?.find((entry) => entry.appId === appId);
    if (!app?.transportId) {
      throw new Error("The device did not start the YouTube app");
    }
    return app.transportId;
  }

  /** Open the virtual connection the app channel runs over. */
  connectToApp(transportId: string): void {
    this.send(NS_CONNECTION, transportId, { type: "CONNECT" });
  }

  close(): void {
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Connection closed"));
    }
    this.pending.clear();
    this.socket?.destroy();
    this.socket = null;
  }

  private sendRaw(namespace: string, destinationId: string, payload: object): void {
    const socket = this.socket;
    if (!socket || socket.destroyed) return;
    const message = encodeMessage(SENDER_ID, destinationId, namespace, JSON.stringify(payload));
    // Cast V2 is a length-prefixed stream: 4-byte big-endian message size.
    const frame = Buffer.concat([
      Buffer.from([0, 0, 0, message.length]),
      message,
    ]);
    logger.debug(`cast tx ${destinationId} ${namespace.split("cast.")?.[1]} ${JSON.stringify(payload).slice(0, 120)}`);
    socket.write(frame);
  }

  private handleData(chunk: Buffer): void {
    logger.debug(`cast rx ${chunk.length} bytes`);
    this.buffer = Buffer.concat([this.buffer, chunk]);    for (;;) {
      if (this.buffer.length < 4) return;
      const length = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + length) return;

      const frame = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      this.lastMessageAt = Date.now();

      const message = decodeMessage(frame);
      if (message) this.dispatch(message);
    }
  }

  private dispatch(message: InboundMessage): void {
    switch (message.namespace) {
      case NS_HEARTBEAT:
        if (message.data?.type === "PING") {
          this.sendRaw(NS_HEARTBEAT, message.sourceId, { type: "PONG" });
        }
        return;
      case NS_CONNECTION:
        // The receiver says goodbye when the app session goes away.
        if (message.data?.type === "CLOSE") this.handleClose();
        return;
      case NS_RECEIVER: {
        const requestId = message.data?.requestId;
        const entry = typeof requestId === "number" ? this.pending.get(requestId) : undefined;
        if (entry) {
          this.pending.delete(requestId);
          clearTimeout(entry.timer);
          const type = message.data?.type;
          if (type === "LAUNCH_ERROR" || type === "INVALID_REQUEST") {
            entry.reject(new Error(message.data.detail?.reason || type));
          } else {
            entry.resolve(message.data);
          }
        }
        return;
      }
      default:
        this.emit("message", message);
    }
  }

  private heartbeatTick(): void {
    if (Date.now() - this.lastMessageAt > DEAD_AFTER_MS) {
      logger.warn(`Cast device ${this.socket?.remoteAddress} went quiet, dropping session`);
      this.handleClose();
      return;
    }
    this.sendRaw(NS_HEARTBEAT, RECEIVER_ID, { type: "PING" });
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.socket?.destroy();
    this.socket = null;
    this.emit("close");
  }
}

function decodeMessage(frame: Buffer): InboundMessage | null {
  let sourceId = "";
  let namespace = "";
  let payload = "";
  let pos = 0;

  while (pos < frame.length) {
    const tag = frame[pos++];
    const wireType = tag & 0x07;
    const fieldNumber = tag >> 3;

    if (wireType === 0) {
      const skipped = skipVarintField(frame, pos);
      if (skipped === null) return null;
      pos = skipped;
      continue;
    }
    if (wireType !== 2) {
      // Fixed-width fields (1 and 5) never appear in CastMessage; bail safely.
      return null;
    }

    const length = decodeVarint(frame, pos);
    if (!length) return null;
    const [size, afterLength] = length;
    const end = afterLength + size;
    if (end > frame.length) return null;
    const value = frame.subarray(afterLength, end);

    if (fieldNumber === 2) sourceId = value.toString("utf8");
    else if (fieldNumber === 4) namespace = value.toString("utf8");
    else if (fieldNumber === 6) payload = value.toString("utf8");
    // 3=destination, 7=binary payload: not needed, skip.
    pos = end;
  }

  if (!namespace) return null;
  let data: any = null;
  try {
    data = payload ? JSON.parse(payload) : null;
  } catch {
    data = null;
  }
  return { sourceId, namespace, data };
}
