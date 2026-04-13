import { useEffect, type CSSProperties } from 'react';

import type { ConversationDetailPayload } from './conversation-detail.js';
import type { DashboardEntityGroup } from './dashboard-view.js';
import type { EntityStatus } from './face.js';

type DrawerMember = {
  entityId: string;
  entityKind: string;
  currentStatus: EntityStatus;
  lastEventAt: string;
  displayName?: string;
  sourceHost?: string;
  lastSummary?: string;
};

export type ConversationDrawerGroup = Pick<
  DashboardEntityGroup,
  | 'groupId'
  | 'source'
  | 'sessionId'
  | 'currentStatus'
  | 'lastEventAt'
  | 'activityScore'
  | 'memberCount'
> & {
  representative: DrawerMember;
  members: DrawerMember[];
};

export interface ConversationDrawerProps {
  open: boolean;
  group: ConversationDrawerGroup | null;
  detail: ConversationDetailPayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function formatTimestamp(timestamp: string): string {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return timestamp;
  }

  return value.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getMemberLabel(member: DrawerMember): string {
  return member.displayName ?? member.entityId;
}

export function ConversationDrawer({
  open,
  group,
  detail,
  loading,
  error,
  onClose,
}: ConversationDrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !group) {
    return null;
  }

  const selectedDetail = detail?.current ?? detail?.representative ?? null;
  const title =
    selectedDetail?.displayName ??
    group.representative.displayName ??
    group.representative.entityId;
  const sourceHost = selectedDetail?.sourceHost ?? group.representative.sourceHost;
  const summary = selectedDetail?.lastSummary ?? group.representative.lastSummary;
  const members = detail?.members ?? group.members;
  const events = detail?.recentEvents ?? [];
  const drawerStyle = {
    '--drawer-bg': 'rgba(248, 250, 255, 0.94)',
  } as CSSProperties;

  return (
    <div className="conversation-drawer" style={drawerStyle}>
      <button
        type="button"
        className="conversation-drawer__backdrop"
        aria-label="Close conversation drawer"
        onClick={onClose}
      />
      <section
        className="conversation-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-drawer-title"
      >
        <header className="conversation-drawer__header">
          <div className="conversation-drawer__header-copy">
            <p className="conversation-drawer__eyebrow">Conversation</p>
            <h2 id="conversation-drawer-title">{title}</h2>
            <p className="conversation-drawer__identity">
              {group.source}
              {group.sessionId
                ? ` · session ${group.sessionId}`
                : ` · ${group.representative.entityId}`}
            </p>
          </div>
          <button type="button" className="conversation-drawer__close" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="conversation-drawer__section conversation-drawer__summary">
          <div className="conversation-drawer__summary-grid">
            <div>
              <span>Group</span>
              <strong>{group.groupId}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{group.currentStatus}</strong>
            </div>
            <div>
              <span>Members</span>
              <strong>{group.memberCount}</strong>
            </div>
            <div>
              <span>Last event</span>
              <strong>{formatTimestamp(selectedDetail?.lastEventAt ?? group.lastEventAt)}</strong>
            </div>
          </div>
          <p className="conversation-drawer__summary-copy">
            {summary ??
              'No summary yet. The drawer will keep the selected group visible while detail loads.'}
          </p>
          {sourceHost ? (
            <p className="conversation-drawer__source">Source host: {sourceHost}</p>
          ) : null}
        </section>

        <section className="conversation-drawer__section">
          <div className="conversation-drawer__section-heading">
            <h3>Members</h3>
            <span>{members.length}</span>
          </div>
          <ul className="conversation-drawer__list">
            {members.map(member => (
              <li key={member.entityId} className="conversation-drawer__item">
                <div>
                  <strong>{getMemberLabel(member)}</strong>
                  <span>{member.entityKind}</span>
                </div>
                <time dateTime={member.lastEventAt}>{formatTimestamp(member.lastEventAt)}</time>
              </li>
            ))}
          </ul>
        </section>

        <section className="conversation-drawer__section">
          <div className="conversation-drawer__section-heading">
            <h3>Timeline</h3>
            <span>{events.length}</span>
          </div>
          {loading ? (
            <p className="conversation-drawer__state">Loading conversation detail...</p>
          ) : error ? (
            <p className="conversation-drawer__state conversation-drawer__state--error">
              {error}. Click the card again to retry.
            </p>
          ) : events.length === 0 ? (
            <p className="conversation-drawer__state">No recent activity yet.</p>
          ) : (
            <ol className="conversation-drawer__timeline">
              {events.map(event => (
                <li key={event.eventId} className="conversation-drawer__event">
                  <div className="conversation-drawer__event-head">
                    <strong>{event.summary ?? event.detail ?? event.eventType}</strong>
                    <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
                  </div>
                  <p>
                    {event.displayName} {event.status}
                  </p>
                  {event.detail ? (
                    <p className="conversation-drawer__event-detail">{event.detail}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </section>
    </div>
  );
}
