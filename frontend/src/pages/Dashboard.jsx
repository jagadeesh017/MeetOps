import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/Authcontext";
import CustomCalendar from "../components/CustomCalendar";
import ScheduleMeeting from "../components/ScheduleMeeting";
import AIScheduler from "../components/AIScheduler";
import { getIntegrationStatus, connectGoogle, connectZoom, disconnectIntegration } from "../services/integrations";
import { useToast } from "../context/ToastContext";

export default function Dashboard() {
  const { user, setUser } = useContext(AuthContext);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showAIScheduler, setShowAIScheduler] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingDisconnect, setPendingDisconnect] = useState(null);
  const [integrations, setIntegrations] = useState({
    google: { connected: false, email: null },
    zoom: { connected: false, email: null }
  });
  const { showToast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getIntegrationStatus();
      setIntegrations(status);
    } catch (err) {
      console.error("Failed to fetch integration status", err);
    }
  }, []);

  useEffect(() => {
    if (user) {
    
      fetchStatus();
    }
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("googleConnected") || params.get("zoomConnected")) {
      fetchStatus();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchStatus]);

  const handleConnectGoogle = async () => {
    try {
      const { url } = await connectGoogle();
      window.location.href = url;
    } catch {
      showToast("Failed to start Google connection", "error");
    }
  };

  const handleConnectZoom = async () => {
    try {
      const { url } = await connectZoom();
      window.location.href = url;
    } catch {
      showToast("Failed to start Zoom connection", "error");
    }
  };

  const requestDisconnect = (platform) => {
    setPendingDisconnect(platform);
  };

  const confirmDisconnect = async () => {
    if (!pendingDisconnect) return;
    try {
      await disconnectIntegration(pendingDisconnect);
      fetchStatus();
      const label = pendingDisconnect === "google" ? "Google" : "Zoom";
      showToast(`${label} disconnected successfully`, "success");
    } catch {
      showToast(`Failed to disconnect ${pendingDisconnect}`, "error");
    } finally {
      setPendingDisconnect(null);
    }
  };

  const cancelDisconnect = () => {
    setPendingDisconnect(null);
  };

  const logout = () => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    setUser(null);
  };

  const handleMeetingCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-gray-50 dark:bg-[#1f1f1f] text-gray-800 dark:text-gray-100">
      <header className="bg-white dark:bg-[#292929] shadow-sm px-4 py-2 flex justify-between items-center border-b border-gray-200 dark:border-[#3d3d3d]">
        <h1 className="text-xl font-semibold text-blue-600 dark:text-[#6264a7]">MeetOps</h1>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {user?.email || "User"}
          </span>

          <button
            onClick={logout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition font-medium text-sm border border-red-200 dark:border-red-800/40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-[#292929] border-b border-gray-200 dark:border-[#3d3d3d] shrink-0 flex-wrap">
          <span className="text-base font-bold text-gray-900 dark:text-white mr-2">Schedule</span>

          <button
              onClick={() => setShowScheduleForm(true)}
              className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition hover:bg-blue-700 shadow-sm text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
              </svg>
              New Meeting
            </button>

            <button
              onClick={() => setShowAIScheduler(true)}
              className="inline-flex items-center gap-2 bg-white dark:bg-[#2b2b2b] text-gray-800 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg border border-gray-200 dark:border-[#3a3a3a] transition hover:bg-gray-50 dark:hover:bg-[#333] shadow-sm text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI Scheduler
            </button>

          <div className="ml-auto flex gap-2.5">
            <button
              onClick={integrations.google.connected ? () => requestDisconnect('google') : handleConnectGoogle}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                integrations.google.connected
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title={integrations.google.connected ? `Connected: ${integrations.google.email}` : 'Connect Google Calendar'}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {integrations.google.connected ? 'Google ✓' : 'Google'}
            </button>

            <button
              onClick={integrations.zoom.connected ? () => requestDisconnect('zoom') : handleConnectZoom}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                integrations.zoom.connected
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title={integrations.zoom.connected ? `Connected: ${integrations.zoom.email}` : 'Connect Zoom'}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 9.875L21.375 7V17L17 14.125V17C17 17.65 16.45 18.2 15.8 18.2H3.2C2.55 18.2 2 17.65 2 17V7C2 6.35 2.55 5.8 3.2 5.8H15.8C16.45 5.8 17 6.35 17 7V9.875Z" />
              </svg>
              {integrations.zoom.connected ? 'Zoom ✓' : 'Zoom'}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <CustomCalendar key={refreshKey} />
        </div>
      </main>

      {showScheduleForm && (
        <ScheduleMeeting
          onClose={() => setShowScheduleForm(false)}
          onMeetingCreated={handleMeetingCreated}
        />
      )}

      {showAIScheduler && (
        <AIScheduler 
          onClose={() => setShowAIScheduler(false)}
          onMeetingCreated={handleMeetingCreated}
        />
      )}

      {pendingDisconnect && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
          <div className="bg-white dark:bg-[#2b2b2b] rounded-lg shadow-xl p-6 w-full max-w-sm border border-gray-200 dark:border-[#3a3a3a]">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Disconnect integration</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Are you sure you want to disconnect {pendingDisconnect === "google" ? "Google Calendar" : "Zoom"}?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDisconnect}
                className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-[#4a4a4a] text-gray-700 dark:text-gray-200 bg-white dark:bg-[#333] hover:bg-gray-50 dark:hover:bg-[#444]"
              >
                Cancel
              </button>
              <button
                onClick={confirmDisconnect}
                className="px-3 py-1.5 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
