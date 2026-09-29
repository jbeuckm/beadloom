// Notifications for what other people do: friend requests, accepted requests,
// designs shared with me, and comments, likes and ratings on my designs.
//
// There's no server to push from, so while the app is open (in a background
// tab too) it checks about once a minute: what it saw last time is kept per
// user in localStorage and compared with what's there now. What changed is
// shown as a system notification when the page is hidden and permission was
// given, else as the in-app notice. Which kinds, and whether at all, are
// settings on this device (Settings → Notifications).

import type { CloudBackend, CloudUser } from './backend';

export type ActivityKind = 'friendRequest' | 'friendAccepted' | 'sharedWithMe' | 'comment' | 'reaction';

export const ACTIVITY_KINDS: Array<{ kind: ActivityKind; label: string; hint: string }> = [
  { kind: 'friendRequest', label: 'Friend requests', hint: 'Someone asks to be your friend' },
  { kind: 'friendAccepted', label: 'Accepted requests', hint: 'Someone accepts your friend request' },
  { kind: 'sharedWithMe', label: 'Shared with me', hint: 'A friend shares a design with you' },
  { kind: 'comment', label: 'Comments', hint: 'Someone comments on one of your designs' },
  { kind: 'reaction', label: 'Likes and ratings', hint: 'Someone likes or rates one of your designs' },
];

export interface NotifyPrefs {
  /** System notifications on this device (needs the browser's permission). */
  system: boolean;
  kinds: Record<ActivityKind, boolean>;
}

const PREFS_KEY = 'beadloom.notify';
const SEEN_KEY = (uid: string) => `beadloom.activity.${uid}`;
const EVERY_MS = 60_000;

export function readNotifyPrefs(): NotifyPrefs {
  const all = Object.fromEntries(ACTIVITY_KINDS.map((k) => [k.kind, true])) as Record<ActivityKind, boolean>;
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (v) return { system: !!v.system, kinds: { ...all, ...v.kinds } };
  } catch {
    /* defaults */
  }
  return { system: false, kinds: all };
}
export function writeNotifyPrefs(p: NotifyPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export interface ActivityEvent {
  kind: ActivityKind;
  title: string;
  body: string;
  /** Where clicking it goes (a design link), if anywhere in particular. */
  url?: string;
}

interface Seen {
  incoming: string[];
  friends: string[];
  shared: string[];
  stats: Record<string, { likes: number; ratings: number; comments: number }>;
}

export interface ActivityWatcher {
  setUser(user: CloudUser | null): void;
  /** Check now (tests, or when the page comes back into view). */
  check(): Promise<ActivityEvent[]>;
}

export function createActivityWatcher(
  backend: CloudBackend,
  show: (e: ActivityEvent) => void,
  linkTo: (designId: string) => string,
): ActivityWatcher {
  let user: CloudUser | null = null;
  let timer: number | null = null;
  let checking: Promise<ActivityEvent[]> | null = null;

  const load = (uid: string): Seen | null => {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY(uid)) || 'null');
    } catch {
      return null;
    }
  };
  const store = (uid: string, s: Seen) => {
    try {
      localStorage.setItem(SEEN_KEY(uid), JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };

  async function look(u: CloudUser): Promise<ActivityEvent[]> {
    const [friends, shared, mine] = await Promise.all([
      backend.friends(),
      backend.sharedWithMe(),
      backend.myVisibleDesigns(),
    ]);
    const stats = await backend.reactions(mine.map((d) => d.id));
    const now: Seen = {
      incoming: friends.filter((f) => f.status === 'incoming').map((f) => f.user.id),
      friends: friends.filter((f) => f.status === 'friends').map((f) => f.user.id),
      shared: shared.map((i) => i.id),
      stats: Object.fromEntries(
        mine.map((d) => {
          const r = stats.get(d.id);
          return [d.id, { likes: r?.likes ?? 0, ratings: r?.ratings ?? 0, comments: r?.comments ?? 0 }];
        }),
      ),
    };
    const before = load(u.id);
    store(u.id, now);
    // the first look on this device is the baseline: nothing to announce
    if (!before) return [];

    const events: ActivityEvent[] = [];
    const name = (id: string) => '@' + (friends.find((f) => f.user.id === id)?.user.username ?? 'someone');
    for (const id of now.incoming)
      if (!before.incoming.includes(id))
        events.push({ kind: 'friendRequest', title: 'Friend request', body: `${name(id)} wants to be friends` });
    for (const id of now.friends)
      if (!before.friends.includes(id) && !before.incoming.includes(id))
        events.push({ kind: 'friendAccepted', title: 'New friend', body: `${name(id)} accepted your friend request` });
    for (const item of shared)
      if (!before.shared.includes(item.id))
        events.push({
          kind: 'sharedWithMe',
          title: 'Shared with you',
          body: `@${item.owner?.username ?? 'a friend'} shared “${item.path.split('/').pop()}”`,
        });
    for (const d of mine) {
      const was = before.stats[d.id] ?? { likes: 0, ratings: 0, comments: 0 };
      const is = now.stats[d.id];
      if (is.comments > was.comments) {
        const latest = (await backend.comments(d.id).catch(() => [])).filter((c) => c.author?.id !== u.id).pop();
        events.push({
          kind: 'comment',
          title: `New comment on “${d.name}”`,
          body: latest ? `@${latest.author?.username ?? 'someone'}: ${latest.body.slice(0, 140)}` : 'Someone commented',
          url: linkTo(d.id),
        });
      }
      const likes = is.likes - was.likes;
      const ratings = is.ratings - was.ratings;
      if (likes > 0 || ratings > 0)
        events.push({
          kind: 'reaction',
          title: `“${d.name}” is getting attention`,
          body: [
            likes > 0 && `${likes} new like${likes === 1 ? '' : 's'}`,
            ratings > 0 && `${ratings} new rating${ratings === 1 ? '' : 's'}`,
          ]
            .filter(Boolean)
            .join(', '),
          url: linkTo(d.id),
        });
    }
    return events;
  }

  async function check(): Promise<ActivityEvent[]> {
    if (!user) return [];
    if (checking) return checking;
    const u = user;
    checking = look(u)
      .then((events) => {
        const prefs = readNotifyPrefs();
        const wanted = events.filter((e) => prefs.kinds[e.kind]);
        if (user?.id === u.id) wanted.forEach(show);
        return wanted;
      })
      .catch(() => [] as ActivityEvent[]) // offline, or no username yet: try again next time
      .finally(() => {
        checking = null;
      });
    return checking;
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };

  return {
    setUser(u) {
      user = u;
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', onVisible);
      if (!u) return;
      timer = window.setInterval(() => void check(), EVERY_MS);
      document.addEventListener('visibilitychange', onVisible);
      void check();
    },
    check,
  };
}

/** Show an event: the in-app notice while looking at the app, else a system
 *  notification if allowed. */
export async function deliver(e: ActivityEvent, inApp: (text: string) => void) {
  const prefs = readNotifyPrefs();
  const canSystem =
    prefs.system && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  if (document.visibilityState === 'visible' || !canSystem) {
    inApp(`${e.title} — ${e.body}`);
    return;
  }
  const options: NotificationOptions = { body: e.body, icon: './icons/icon-192.png', tag: `${e.kind}:${e.title}`, data: { url: e.url } };
  // an installed app (and iPad) shows them through the service worker
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
  if (reg) {
    await reg.showNotification(e.title, options);
    return;
  }
  const n = new Notification(e.title, options);
  n.onclick = () => {
    window.focus();
    if (e.url) location.href = e.url;
    n.close();
  };
}
