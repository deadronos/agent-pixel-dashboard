import type { EntityStatusSummary } from "./dashboard-view.js";
import type { ConnectionState } from "./use-live-entities.js";

function formatTopbarTimestamp(timestamp: string | undefined): string {
  if (!timestamp) {
    return "Waiting for activity";
  }

  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return "Waiting for activity";
  }

  return value.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function DashboardTopbar({
  connectionState,
  statusSummary
}: {
  connectionState: ConnectionState;
  statusSummary: EntityStatusSummary;
}) {
  return (
    <header className="topbar">
      <div className="topbar__copy">
        <p className="eyebrow">Live session mural</p>
        <h1>Agent Watch</h1>
        <p className="topbar__lede">
          {statusSummary.total > 0
            ? `Tracking ${statusSummary.total} conversations. Latest activity at ${formatTopbarTimestamp(statusSummary.latestEventAt)}.`
            : "Waiting for the first collector event."}
        </p>
      </div>
      <div className="topbar__meta">
        <div className="topbar__stats" aria-label="Conversation status summary">
          <span className="topbar__stat">
            <strong>{statusSummary.total}</strong>
            <span>Total</span>
          </span>
          <span className="topbar__stat">
            <strong>{statusSummary.active}</strong>
            <span>Active</span>
          </span>
          <span className="topbar__stat">
            <strong>{statusSummary.idle}</strong>
            <span>Idle</span>
          </span>
          <span className="topbar__stat">
            <strong>{statusSummary.dormant}</strong>
            <span>Dormant</span>
          </span>
        </div>
        <div className={`badge ${connectionState === "live" ? "ok" : "warn"}`} aria-live="polite">
          {connectionState === "live"
            ? "Live"
            : connectionState === "connecting"
              ? "Connecting"
              : "Disconnected"}
        </div>
      </div>
    </header>
  );
}
