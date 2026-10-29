// Live measurement session shared between components (useSyncExternalStore). Emits only on a new frame, a connection
// change or when a point just went stale — never on a fixed 1-second tick. Sessions without listeners are disposed
// after SESSION_IDLE_MS. Ported from cic-hud lib/iotLiveSession.ts without the local demo source.
import type { IotCatalog, IotPoint } from './iotTypes';
import {
  appendHistory,
  LIVE_HISTORY_LIMIT,
  mergeReadings,
  nextStaleDeadline,
  readingsFromBroadcast,
  readingsFromLatest,
  type IotLiveState,
  type LatestSnapshotRow,
  type LiveFrame,
} from './iotLiveFrame';

export const SESSION_IDLE_MS = 60_000;
/** Data-age refresh when the gateway sends nothing new (real sample periods are minutes). */
export const GATEWAY_CLOCK_MS = 30_000;

export interface LiveSession {
  getSnapshot(): IotLiveState;
  subscribe(listener: () => void): () => void;
  staleMsFor(point: Pick<IotPoint, 'point_id' | 'stale_after_seconds'>): number;
  sourceStaleMs: number;
  dispose(): void;
}
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface GatewayTransport {
  loadSnapshot(): Promise<LatestSnapshotRow[]>;
  subscribe(handlers: {
    onMessage(payload: unknown): void;
    onStatus(status: string, error?: unknown): void;
  }): () => void;
}

/**
 * Gateway source: iot_latest snapshot on (re)connect, then Broadcast packets on channel iot:<project> merged in.
 * Data age per point from stale_after_seconds; no reading means stale, never 0.
 */
export function createGatewaySession(
  catalog: Pick<IotCatalog, 'points'>,
  transport: GatewayTransport,
  clock: Clock = systemClock,
): LiveSession {
  const staleMsFor = (point: Pick<IotPoint, 'stale_after_seconds'>) =>
    Math.max(1, point.stale_after_seconds || 900) * 1000;
  const sourceStaleMs = Math.max(...catalog.points.map((p) => staleMsFor(p)), 900_000);
  const start = clock.now();
  const empty: LiveFrame = { sequence: 0, receivedAt: start, readings: {} };
  let state: IotLiveState = { now: start, frame: empty, history: [empty], connection: 'connecting', error: null };
  const listeners = new Set<() => void>();
  let staleTimer: unknown;
  let unsubscribe: (() => void) | null = null;
  let tick: unknown;
  let loading = 0;

  const scheduleStale = () => {
    if (staleTimer !== undefined) clock.clearTimeout(staleTimer);
    staleTimer = undefined;
    if (!listeners.size) return;
    const deadline = nextStaleDeadline(state.frame, catalog.points, staleMsFor, state.now);
    if (deadline === null) return;
    staleTimer = clock.setTimeout(
      () => {
        staleTimer = undefined;
        set({ now: clock.now() });
      },
      Math.max(0, deadline - clock.now()),
    );
  };
  const set = (patch: Partial<IotLiveState>) => {
    const next = { ...state, ...patch };
    const changed = (Object.keys(patch) as (keyof IotLiveState)[]).some((key) => next[key] !== state[key]);
    if (!changed) return;
    state = next;
    scheduleStale();
    listeners.forEach((listener) => listener());
  };
  const applyReadings = (readings: Parameters<typeof mergeReadings>[1], replace: boolean) => {
    const at = clock.now();
    const frame = mergeReadings(state.frame, readings, at, replace);
    if (frame === state.frame) return;
    set({ now: at, frame, history: appendHistory(state.history, frame, LIVE_HISTORY_LIMIT) });
  };
  const reload = async () => {
    const request = ++loading;
    try {
      const rows = await transport.loadSnapshot();
      if (request !== loading || !unsubscribe) return;
      applyReadings(readingsFromLatest(rows), true);
      set({ connection: 'live', error: null, now: clock.now() });
    } catch (error) {
      if (request !== loading) return;
      set({ connection: 'error', error: error instanceof Error ? error.message : 'Không tải được số đo mới nhất' });
    }
  };
  const heartbeat = () => {
    tick = clock.setTimeout(() => {
      set({ now: clock.now() });
      heartbeat();
    }, GATEWAY_CLOCK_MS);
  };
  const begin = () => {
    unsubscribe = transport.subscribe({
      onMessage(payload) {
        const parsed = readingsFromBroadcast(payload);
        if (parsed) applyReadings(parsed.readings, false);
      },
      onStatus(status, error) {
        if (status === 'SUBSCRIBED') void reload();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
          set({
            connection: 'reconnecting',
            error:
              error instanceof Error
                ? error.message
                : status === 'TIMED_OUT'
                  ? 'Hết thời gian chờ kênh Realtime'
                  : null,
          });
      },
    });
    heartbeat();
  };
  const stop = () => {
    unsubscribe?.();
    unsubscribe = null;
    loading++;
    if (tick !== undefined) clock.clearTimeout(tick);
    tick = undefined;
    if (staleTimer !== undefined) clock.clearTimeout(staleTimer);
    staleTimer = undefined;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        set({ connection: 'connecting' });
        begin();
        scheduleStale();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) stop();
      };
    },
    staleMsFor,
    sourceStaleMs,
    dispose: () => {
      stop();
      listeners.clear();
    },
  };
}

// ---- Shared session registry, idle sessions are disposed -------------------------------------------------
interface Entry {
  session: LiveSession;
  listeners: number;
  idle?: ReturnType<typeof setTimeout>;
}
const sessions = new Map<string, Entry>();
function shared(key: string, create: () => LiveSession): LiveSession {
  let entry = sessions.get(key);
  if (!entry) {
    entry = { session: create(), listeners: 0 };
    sessions.set(key, entry);
  }
  const current = entry;
  return {
    ...current.session,
    subscribe(listener) {
      if (current.idle) clearTimeout(current.idle);
      current.idle = undefined;
      current.listeners++;
      const release = current.session.subscribe(listener);
      return () => {
        release();
        current.listeners--;
        if (current.listeners > 0) return;
        current.idle = setTimeout(() => {
          if (current.listeners > 0 || sessions.get(key) !== current) return;
          current.session.dispose();
          sessions.delete(key);
        }, SESSION_IDLE_MS);
      };
    },
  };
}
export const liveSessionCount = () => sessions.size;
/** One gateway session per project and catalog version (point list), shared by every open view. */
export function iotGatewaySession(catalog: IotCatalog, transport: GatewayTransport): LiveSession {
  const version = catalog.points.map((p) => `${p.point_id}:${p.stale_after_seconds}`).join('|');
  return shared(`gateway:${catalog.project_id}:${version}`, () => createGatewaySession(catalog, transport));
}
