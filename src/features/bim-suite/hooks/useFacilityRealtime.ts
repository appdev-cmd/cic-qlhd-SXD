// One Supabase Realtime channel per project (reference counted) for work orders and the asset register
// (postgres_changes on facility_work_orders and bim_assets; RLS limits rows to project readers). While SUBSCRIBED the
// operations queries drop their 15 s poll and keep a 60 s safety sync; offline they fall back to 15 s.
// The channel is opened only for a signed-in account: anonymous sessions never join.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../adapters/supabase';
import { useAuth } from '../adapters/context';

type Status = 'connecting' | 'live' | 'offline';
interface Entry {
  channel: RealtimeChannel | null;
  refs: number;
  status: Status;
  clients: Set<QueryClient>;
  pending: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
}
const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const TABLES = ['facility_work_orders', 'bim_assets'] as const;

/** Query keys to refresh per changed table. */
export const facilityQueryKeys = (project: string, table: string): unknown[][] => {
  if (table === 'facility_work_orders')
    return [
      ['bim-work-orders', project],
      ['bim-my-orders', project],
      ['bim-order-events', project],
      ['facility-kpi', project],
      ['bim-facility-assets', project],
      ['facility-order-parts'],
    ];
  return [
    ['bim-facility-assets', project],
    ['bim-asset-events', project],
    ['facility-kpi', project],
  ];
};

const notify = (project: string) => listeners.get(project)?.forEach((listener) => listener());
const flush = (project: string, entry: Entry) => {
  entry.timer = null;
  const tables = [...entry.pending];
  entry.pending.clear();
  for (const client of entry.clients)
    for (const table of tables)
      for (const queryKey of facilityQueryKeys(project, table)) void client.invalidateQueries({ queryKey });
};

function open(project: string, entry: Entry) {
  const onChange = (table: string) => () => {
    entry.pending.add(table);
    // Coalesce bursts (order update trigger + asset update) into one refresh.
    if (!entry.timer) entry.timer = setTimeout(() => flush(project, entry), 250);
  };
  try {
    let channel = supabase.channel(`facility-ops:${project}`);
    for (const table of TABLES)
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `project_id=eq.${project}` },
        onChange(table),
      );
    entry.channel = channel.subscribe((state) => {
      const next: Status =
        state === 'SUBSCRIBED'
          ? 'live'
          : state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED'
            ? 'offline'
            : 'connecting';
      if (next === entry.status) return;
      const recovered = next === 'live' && entry.status === 'offline';
      entry.status = next;
      // After a reconnect refresh once so changes made while offline are not missed.
      if (recovered) TABLES.forEach((table) => entry.pending.add(table));
      if (recovered && !entry.timer) entry.timer = setTimeout(() => flush(project, entry), 0);
      notify(project);
    });
  } catch {
    entry.status = 'offline';
  }
}

function acquire(project: string, client: QueryClient) {
  let entry = entries.get(project);
  if (!entry) {
    entry = { channel: null, refs: 0, status: 'connecting', clients: new Set(), pending: new Set(), timer: null };
    entries.set(project, entry);
    open(project, entry);
  }
  entry.refs += 1;
  entry.clients.add(client);
  return () => {
    const current = entries.get(project);
    if (!current) return;
    current.refs -= 1;
    if (current.refs > 0) return;
    if (current.timer) clearTimeout(current.timer);
    entries.delete(project);
    if (current.channel) void supabase.removeChannel(current.channel);
    current.status = 'offline';
    notify(project);
  };
}

/** Opens (shared) the project's operations Realtime channel; true while it is live. */
export function useFacilityRealtime(projectId?: string | null, enabled = true): boolean {
  const client = useQueryClient();
  const { supabaseUser } = useAuth();
  const signedIn = !!supabaseUser;
  useEffect(() => {
    if (!projectId || !enabled || !signedIn) return;
    return acquire(projectId, client);
  }, [projectId, enabled, signedIn, client]);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!projectId) return () => undefined;
      const set = listeners.get(projectId) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(projectId, set);
      return () => {
        set.delete(listener);
      };
    },
    [projectId],
  );
  return useSyncExternalStore(
    subscribe,
    () => (projectId ? entries.get(projectId)?.status === 'live' : false),
    () => false,
  );
}

/** Sync interval with / without Realtime. */
export const facilityPollInterval = (live: boolean) => (live ? 60000 : 15000);
