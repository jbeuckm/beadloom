// Keeping the shared parts of Chromattice kind: anyone signed in can report a
// design, post or comment; staff (moderators and admins) work the reports and
// look after the gallery, the journal and the people on the Admin page. The
// database checks every staff action (db/migrations/0009_moderation.sql).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { cloud } from '../lib/cloud';
import type { LogEntry, QueueItem, ReportKind, StaffContent, StaffRole, StaffUser } from '../lib/cloud/backend';
import { designThumbnail } from '../lib/library';

/** Ask for a reason; null when cancelled or left empty. */
const ask = (question: string): string | null => {
  const r = window.prompt(question);
  return r && r.trim() ? r.trim() : null;
};

// ---- for everyone: reporting --------------------------------------------------------

/** "Report" for something someone else made. Hidden signed out, or for your own. */
export function ReportButton({
  kind,
  targetId,
  ownerId,
  compact = false,
}: {
  kind: ReportKind;
  targetId: string;
  ownerId: string | null | undefined;
  compact?: boolean;
}) {
  const user = useStore((s) => s.cloudUser);
  const notify = useStore((s) => s.notify);
  if (!user || !cloud.backend || (ownerId && ownerId === user.id)) return null;
  const what = kind === 'design' ? 'design' : kind === 'post' ? 'post' : 'comment';
  const report = async () => {
    const reason = ask(`What's wrong with this ${what}? A moderator will take a look.`);
    if (!reason) return;
    const r = await cloud.backend!.report(kind, targetId, reason).catch((e) => ({ ok: false, error: (e as Error).message }));
    notify(r.ok ? 'Thanks — a moderator will take a look' : (r.error ?? 'Could not send the report'));
  };
  return compact ? (
    <button className="btn ghost mini" aria-label={`Report ${what}`} title={`Report this ${what}`} onClick={() => void report()}>
      <Icon name="flag" size={15} />
    </button>
  ) : (
    <button className="btn" onClick={() => void report()}>
      <Icon name="flag" size={16} /> Report
    </button>
  );
}

// ---- for staff: the Admin page ---------------------------------------------------------

type Tab = 'reports' | 'gallery' | 'journal' | 'people' | 'log';

export function AdminPanel() {
  const role = useStore((s) => s.cloudStanding.role);
  const [tab, setTab] = useState<Tab>('reports');
  if (role === 'user')
    return <p className="hint">This page is for moderators and admins.</p>;
  const tabs: Array<[Tab, string]> = [
    ['reports', 'Reports'],
    ['gallery', 'Gallery'],
    ['journal', 'Journal'],
    ['people', 'People'],
    ['log', 'Log'],
  ];
  return (
    <section className="admin" aria-label="Admin">
      <h1 className="page-title">Admin</h1>
      <p className="hint">You're {role === 'admin' ? 'an admin' : 'a moderator'}. Everything you do here is logged.</p>
      <div className="seg admin-tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'reports' && <Reports />}
      {tab === 'gallery' && <Content what="design" />}
      {tab === 'journal' && <Content what="post" />}
      {tab === 'people' && <People role={role} />}
      {tab === 'log' && <Log />}
    </section>
  );
}

/** Load something for a staff list; `reload` after acting. */
function useStaff<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

/** Run a staff action, report how it went, then reload. */
function useAct(reload: () => void) {
  const notify = useStore((s) => s.notify);
  return async (fn: () => Promise<void>, done: string) => {
    try {
      await fn();
      notify(done);
      reload();
    } catch (e) {
      notify((e as Error).message);
    }
  };
}

function Thumb({ doc }: { doc: unknown }) {
  const src = useMemo(() => (doc ? designThumbnail(JSON.stringify(doc), 120) : null), [doc]);
  return <span className="admin-thumb">{src ? <img src={src} alt="" /> : <Icon name="pencil" size={20} />}</span>;
}

function Row({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return <li className={'admin-row' + (dim ? ' dim' : '')}>{children}</li>;
}

function Reports() {
  const b = cloud.backend!;
  const { data, error, reload } = useStaff(() => b.staffQueue());
  const act = useAct(reload);
  if (error) return <p className="acct-error">{error}</p>;
  if (!data) return <p className="hint">Loading…</p>;
  if (!data.length) return <p className="hint">No open reports. Nice.</p>;
  return (
    <ul className="admin-list">
      {data.map((q: QueueItem) => (
        <Row key={q.kind + q.targetId}>
          <Thumb doc={q.doc} />
          <span className="admin-text">
            <b>
              {q.kind === 'design' ? 'Design' : q.kind === 'post' ? 'Post' : 'Comment'}: {q.title}
            </b>
            <span className="hint">
              by {q.ownerName ? '@' + q.ownerName : 'someone'} · {q.reports} report{q.reports === 1 ? '' : 's'}
              {q.hidden ? ' · already hidden' : ''}
            </span>
            {q.body && <span className="admin-excerpt">{q.body.slice(0, 200)}</span>}
            <span className="admin-reasons">
              {q.reasons.map((r, i) => (
                <q key={i}>{r}</q>
              ))}
            </span>
          </span>
          <span className="admin-actions">
            {q.kind === 'comment' ? (
              <button
                className="btn mini danger"
                onClick={() => {
                  const why = ask('Why delete this comment? (for the log)');
                  if (why) void act(() => b.staffDeleteComment(q.targetId, why), 'Comment deleted');
                }}
              >
                Delete comment
              </button>
            ) : (
              !q.hidden && (
                <button
                  className="btn mini danger"
                  onClick={() => {
                    const why = ask(`Why hide this ${q.kind}? Its owner will see this.`);
                    if (why) void act(() => b.staffSetHidden(q.kind as 'design' | 'post', q.targetId, true, why), 'Hidden');
                  }}
                >
                  Hide
                </button>
              )
            )}
            <button
              className="btn mini"
              onClick={() => void act(() => b.staffDismiss(q.kind, q.targetId, null), 'Reports dismissed')}
            >
              Dismiss
            </button>
          </span>
        </Row>
      ))}
    </ul>
  );
}

function Content({ what }: { what: 'design' | 'post' }) {
  const b = cloud.backend!;
  const { data, error, reload } = useStaff(() => b.staffContent(what), [what]);
  const act = useAct(reload);
  if (error) return <p className="acct-error">{error}</p>;
  if (!data) return <p className="hint">Loading…</p>;
  if (!data.length) return <p className="hint">Nothing {what === 'design' ? 'published' : 'posted'} yet.</p>;
  return (
    <ul className="admin-list">
      {data.map((c: StaffContent) => (
        <Row key={c.id} dim={c.hidden}>
          <Thumb doc={c.doc} />
          <span className="admin-text">
            <b>{c.title}</b>
            <span className="hint">
              by {c.ownerName ? '@' + c.ownerName : 'someone'}
              {c.at ? ` · ${new Date(c.at).toLocaleDateString()}` : ''}
              {c.hidden ? ` · hidden: ${c.hiddenReason}` : ''}
            </span>
            {c.body && <span className="admin-excerpt">{c.body.slice(0, 200)}</span>}
          </span>
          <span className="admin-actions">
            {c.hidden ? (
              <button className="btn mini" onClick={() => void act(() => b.staffSetHidden(what, c.id, false, null), 'Restored')}>
                Restore
              </button>
            ) : (
              <button
                className="btn mini danger"
                onClick={() => {
                  const why = ask(`Why hide this ${what}? Its owner will see this.`);
                  if (why) void act(() => b.staffSetHidden(what, c.id, true, why), 'Hidden');
                }}
              >
                Hide
              </button>
            )}
          </span>
        </Row>
      ))}
    </ul>
  );
}

function People({ role }: { role: StaffRole }) {
  const b = cloud.backend!;
  const me = useStore((s) => s.cloudUser?.id);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, reload } = useStaff(() => b.staffUsers(query), [query]);
  const act = useAct(reload);
  const admin = role === 'admin';
  return (
    <>
      <div className="field find-people">
        <input
          type="search"
          aria-label="Find people"
          placeholder="Search by email, name or username"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {error ? (
        <p className="acct-error">{error}</p>
      ) : !data ? (
        <p className="hint">Loading…</p>
      ) : (
        <ul className="admin-list">
          {data.map((u: StaffUser) => (
            <Row key={u.id} dim={u.banned}>
              <span className="admin-text">
                <b>
                  {u.username ? '@' + u.username : u.name || u.email}
                  {u.role !== 'user' && <span className="post-badge">{u.role}</span>}
                </b>
                <span className="hint">
                  {u.email} · {u.designs} design{u.designs === 1 ? '' : 's'}, {u.published} published
                </span>
                {u.suspendedReason && <span className="admin-flag">Suspended: {u.suspendedReason}</span>}
                {u.banned && <span className="admin-flag">Banned</span>}
              </span>
              <span className="admin-actions">
                {admin && u.id !== me && (
                  <select
                    aria-label={`Role of ${u.email}`}
                    value={u.role}
                    onChange={(e) =>
                      void act(() => b.adminSetRole(u.id, e.target.value as StaffRole), `Now ${e.target.value}`)
                    }
                  >
                    <option value="user">User</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
                {u.id !== me &&
                  (u.suspendedReason ? (
                    <button className="btn mini" onClick={() => void act(() => b.staffUnsuspend(u.id), 'Suspension lifted')}>
                      Unsuspend
                    </button>
                  ) : (
                    <button
                      className="btn mini"
                      onClick={() => {
                        const why = ask(`Why suspend ${u.email}? They'll see this.`);
                        if (why) void act(() => b.staffSuspend(u.id, why), 'Suspended');
                      }}
                    >
                      Suspend
                    </button>
                  ))}
                {admin &&
                  u.id !== me &&
                  (u.banned ? (
                    <button className="btn mini" onClick={() => void act(() => b.adminUnban(u.id), 'Ban lifted')}>
                      Unban
                    </button>
                  ) : (
                    <button
                      className="btn mini danger"
                      onClick={() => {
                        const why = ask(`Why ban ${u.email}? They won't be able to sign in.`);
                        if (why) void act(() => b.adminBan(u.id, why), 'Banned');
                      }}
                    >
                      Ban
                    </button>
                  ))}
              </span>
            </Row>
          ))}
        </ul>
      )}
    </>
  );
}

function Log() {
  const b = cloud.backend!;
  const { data, error } = useStaff(() => b.staffLog(100));
  if (error) return <p className="acct-error">{error}</p>;
  if (!data) return <p className="hint">Loading…</p>;
  if (!data.length) return <p className="hint">Nothing yet.</p>;
  return (
    <table className="admin-log">
      <thead>
        <tr>
          <th>When</th>
          <th>Who</th>
          <th>What</th>
          <th>Why</th>
        </tr>
      </thead>
      <tbody>
        {data.map((l: LogEntry, i) => (
          <tr key={i}>
            <td>{new Date(l.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td>{l.actor === 'command line' ? l.actor : '@' + l.actor}</td>
            <td>
              {l.action} {l.targetKind}
            </td>
            <td>{l.reason ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
