import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/Authcontext";
import CustomCalendar from "../components/CustomCalendar";
import ScheduleMeeting from "../components/ScheduleMeeting";
import AIScheduler from "../components/AIScheduler";
import { getIntegrationStatus, connectGoogle, connectZoom, disconnectIntegration } from "../services/integrations";
import { useToast } from "../context/ToastContext";

function StatusMark({ connected }) {
  return connected ? (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"
      aria-label="Connected"
      title="Connected"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M5 12l5 5L19 8" />
      </svg>
    </span>
  ) : (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/20 text-rose-400"
      aria-label="Not connected"
      title="Not connected"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M6 6l12 12M18 6l-12 12" />
      </svg>
    </span>
  );
}

function IntegrationChip({ title, connected, email, onClick, tone }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      title={connected && email ? `${title} connected as ${email}` : `${title} ${connected ? "connected" : "not connected"}`}
    >
      <span className={`h-2 w-2 rounded-full ${connected ? tone : "bg-slate-300"}`} />
      <span>{title}</span>
      <StatusMark connected={connected} />
    </button>
  );
}

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showAIScheduler, setShowAIScheduler] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingDisconnect, setPendingDisconnect] = useState(null);
  const [integrations, setIntegrations] = useState({ google: { connected: false, email: null }, zoom: { connected: false, email: null } });
  const { showToast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getIntegrationStatus();
      setIntegrations(status);
    } catch {
      showToast("Failed to load integration status", "error");
    }
  }, [showToast]);

  useEffect(() => {
    if (user) fetchStatus();
  }, [user, fetchStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("googleConnected") || params.get("zoomConnected")) {
      fetchStatus();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchStatus]);

  const handleConnect = async (connectFn, platform) => {
    try {
      const { url } = await connectFn();
      window.location.href = url;
    } catch {
      showToast(`Failed to start ${platform} connection`, "error");
    }
  };

  const handleDisconnect = async () => {
    if (!pendingDisconnect) return;
    try {
      await disconnectIntegration(pendingDisconnect);
      await fetchStatus();
      showToast(`${pendingDisconnect === "google" ? "Google" : "Zoom"} disconnected`, "success");
    } catch {
      showToast(`Failed to disconnect ${pendingDisconnect}`, "error");
    } finally {
      setPendingDisconnect(null);
    }
  };

  const handleMeetingCreated = () => setRefreshKey((prev) => prev + 1);

  return (
    <div className="flex h-[calc(100vh-94px)] min-h-[620px] flex-col gap-2">
      <section className="shrink-0 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/88 dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.name || "User"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Calendar workspace</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <IntegrationChip
              title="Google"
              connected={integrations.google.connected}
              email={integrations.google.email}
              tone="bg-emerald-500"
              onClick={integrations.google.connected ? () => setPendingDisconnect("google") : () => handleConnect(connectGoogle, "Google")}
            />
            <IntegrationChip
              title="Zoom"
              connected={integrations.zoom.connected}
              email={integrations.zoom.email}
              tone="bg-blue-500"
              onClick={integrations.zoom.connected ? () => setPendingDisconnect("zoom") : () => handleConnect(connectZoom, "Zoom")}
            />
            <button
              onClick={() => setShowScheduleForm(true)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              New Meeting
            </button>
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900 dark:shadow-none">
        <CustomCalendar key={refreshKey} />
      </section>

      {showScheduleForm && <ScheduleMeeting onClose={() => setShowScheduleForm(false)} onMeetingCreated={handleMeetingCreated} />}
      {showAIScheduler && <AIScheduler onClose={() => setShowAIScheduler(false)} onMeetingCreated={handleMeetingCreated} />}

      {pendingDisconnect && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Disconnect integration</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Are you sure you want to disconnect {pendingDisconnect === "google" ? "Google Calendar" : "Zoom"}?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPendingDisconnect(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Cancel</button>
              <button onClick={handleDisconnect} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400">Disconnect</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
