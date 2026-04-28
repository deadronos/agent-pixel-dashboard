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

function getConnectionMessage(
  connectionState: ConnectionState,
  latestEventAt: string | undefined
): string {
  if (connectionState === "live") {
    if (latestEventAt) {
      return `Latest event ${formatTopbarTimestamp(latestEventAt)}.`;
    }

    return "Connected and waiting for new events.";
  }

  if (connectionState === "connecting") {
    return "Connecting to the hub…";
  }

  return "Disconnected from the hub. Check the collector and hub process.";
}

export function DashboardTopbar({
  connectionState,
  statusSummary,
  settingsPanelAvailable,
  settingsPanelOpen,
  darkMode,
  onToggleDarkMode,
  onToggleSettings
}: {
  connectionState: ConnectionState;
  statusSummary: EntityStatusSummary;
  settingsPanelAvailable: boolean;
  settingsPanelOpen: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onToggleSettings: () => void;
}) {
  const connectionLabel =
    connectionState === "live"
      ? "Live"
      : connectionState === "connecting"
        ? "Connecting"
        : "Disconnected";
  const connectionTone =
    connectionState === "live" ? "ok" : connectionState === "connecting" ? "pending" : "warn";
  const connectionMessage = getConnectionMessage(connectionState, statusSummary.latestEventAt);

  return (
    <header className="topbar">
      <div className="topbar__copy">
        <p className="eyebrow">Live session mural</p>
        <h1>Agent Watch</h1>
        <p className="topbar__lede">
          {statusSummary.total > 0
            ? `Tracking ${statusSummary.total} conversations. Latest activity at ${formatTopbarTimestamp(statusSummary.latestEventAt)}.`
            : settingsPanelAvailable
              ? "Waiting for the first collector event. Use the settings toggle to tune layout and filters."
              : "Waiting for the first collector event."}
        </p>
      </div>
      <div className="topbar__stats" aria-label="Conversation status summary">
        <span className="topbar__stat topbar__stat--total">
          <strong>{statusSummary.total}</strong>
          <span>Total</span>
        </span>
        <span className="topbar__stat topbar__stat--active">
          <strong>{statusSummary.active}</strong>
          <span>Active</span>
        </span>
        <span className="topbar__stat topbar__stat--idle">
          <strong>{statusSummary.idle}</strong>
          <span>Idle</span>
        </span>
        <span className="topbar__stat topbar__stat--dormant">
          <strong>{statusSummary.dormant}</strong>
          <span>Dormant</span>
        </span>
      </div>
      <div className="topbar__actions">
        <div className="topbar__utility">
          <div className="topbar__status">
            <div className={`badge ${connectionTone}`} aria-live="polite">
              {connectionLabel}
            </div>
            <p className="topbar__status-copy">{connectionMessage}</p>
          </div>
          <button
            type="button"
            className="topbar__icon-toggle"
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={darkMode}
            onClick={onToggleDarkMode}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? "☀" : "☾"}
          </button>
        </div>
        {settingsPanelAvailable ? (
          <button
            type="button"
            className="topbar__settings-toggle"
            aria-label={settingsPanelOpen ? "Hide settings panel" : "Show settings panel"}
            onClick={onToggleSettings}
            title={settingsPanelOpen ? "Hide settings panel" : "Show settings panel"}
          >
            {settingsPanelOpen ? "Hide settings" : "Show settings"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
