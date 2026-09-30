// How the sync status reads, wherever it's shown. Sync only ever concerns
// Cloud Storage (Local Storage never leaves the device), so every message
// names it rather than saying "synced".

import type { SyncInfo } from './sync';

const changes = (n: number) => `${n} Cloud Storage change${n === 1 ? '' : 's'}`;

/** A sentence for tooltips and the Account dialog. */
export function cloudStatusText(info: SyncInfo): string {
  switch (info.status) {
    case 'syncing':
      return 'Updating Cloud Storage…';
    case 'offline':
      return info.pending
        ? `Offline — ${changes(info.pending)} will upload when you're back online`
        : 'Offline — Cloud Storage will catch up when you’re back online';
    case 'error':
      return `Cloud Storage problem: ${info.error ?? 'request failed'}`;
    default:
      return info.pending ? `${changes(info.pending)} waiting to upload` : 'Cloud Storage is up to date';
  }
}

/** Which cloud icon, and whether it's busy. */
export function cloudStatusLook(info: SyncInfo): { icon: 'cloud' | 'cloud-off'; busy: boolean; alert: boolean } {
  return {
    icon: info.status === 'offline' || info.status === 'error' ? 'cloud-off' : 'cloud',
    busy: info.status === 'syncing',
    alert: info.status === 'error',
  };
}
