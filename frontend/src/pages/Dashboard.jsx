import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/Authcontext";
import CustomCalendar from "../components/CustomCalendar";
import ScheduleMeeting from "../components/ScheduleMeeting";
import { getIntegrationStatus, connectGoogle, connectZoom, disconnectIntegration } from "../services/integrations";

export default function Dashboard() {
  const { user, setUser } = useContext(AuthContext);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [integrations, setIntegrations] = useState({
    google: { connected: false, email: null },
    zoom: { connected: false, email: null }
  });

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getIntegrationStatus();
      setIntegrations(status);
    } catch (err) {
      console.error("Failed to fetch integration status", err);
    }
  }, []);

  useEffect(() => {
    if (user) fetchStatus();
  }, [user, fetchStatus]);

  // Handle OAuth Redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("googleConnected") || params.get("zoomConnected")) {
      fetchStatus();
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchStatus]);

  const handleConnectGoogle = async () => {
    try {
      const { url } = await connectGoogle();
      window.location.href = url;
    } catch (err) {
      alert("Failed to start Google connection");
    }
  };

  const handleConnectZoom = async () => {
    try {
      const { url } = await connectZoom();
      window.location.href = url;
    } catch (err) {
      alert("Failed to start Zoom connection");
    }
  };

  const handleDisconnect = async (platform) => {
    if (!window.confirm(`Are you sure you want to disconnect ${platform}?`)) return;
    try {
      await disconnectIntegration(platform);
      fetchStatus();
    } catch (err) {
      alert(`Failed to disconnect ${platform}`);
    }
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#1f1f1f] text-gray-800 dark:text-gray-100">
      <header className="bg-white dark:bg-[#292929] shadow-sm px-6 py-3 flex justify-between items-center border-b border-gray-200 dark:border-[#3d3d3d]">
        <h1 className="text-xl font-semibold text-blue-600 dark:text-[#6264a7]">MeetOps</h1>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {user?.email || "User"}
          </span>

          <button
            onClick={logout}
            className="px-3 py-1.5 rounded bg-red-500 text-white hover:bg-red-600 transition text-sm"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="p-4 max-w-[98%] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold dark:text-gray-100">Calendar</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage your schedule and integrations</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Integrations Group */}
            <div className="flex items-center gap-2 bg-white/80 dark:bg-[#292929]/80 backdrop-blur-md p-1 rounded-xl border border-gray-200/50 dark:border-[#3d3d3d]/50 shadow-sm">
              {/* Google */}
              <div className="flex items-center gap-1">
                <button
                  onClick={integrations.google.connected ? undefined : handleConnectGoogle}
                  title={integrations.google.connected ? `Connected: ${integrations.google.email}` : "Connect Google Calendar"}
                  className={`px-3 py-2 rounded-lg transition-all duration-300 flex items-center gap-2.5 text-xs font-medium ${integrations.google.connected
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)] cursor-default"
                    : "bg-transparent text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent"
                    }`}
                >
                  <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                    <img src="https://www.gstatic.com/images/branding/product/1x/calendar_48dp.png" className="w-4 h-4 object-contain" alt="Google" />
                  </div>
                  <span className="truncate">{integrations.google.connected ? "Google Ready" : "Google"}</span>
                </button>
                {integrations.google.connected && (
                  <button
                    onClick={() => handleDisconnect('google')}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    title="Disconnect Google"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="w-px h-6 bg-gray-200 dark:bg-[#3d3d3d]" />

              {/* Zoom */}
              <div className="flex items-center gap-1">
                <button
                  onClick={integrations.zoom.connected ? undefined : handleConnectZoom}
                  title={integrations.zoom.connected ? `Connected: ${integrations.zoom.email}` : "Connect Zoom"}
                  className={`px-3 py-2 rounded-lg transition-all duration-300 flex items-center gap-2.5 text-xs font-medium ${integrations.zoom.connected
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)] cursor-default"
                    : "bg-transparent text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent"
                    }`}
                >
                  <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#2D8CFF">
                      <path d="M17 9.875L21.375 7V17L17 14.125V17C17 17.65 16.45 18.2 15.8 18.2H3.2C2.55 18.2 2 17.65 2 17V7C2 6.35 2.55 5.8 3.2 5.8H15.8C16.45 5.8 17 6.35 17 7V9.875Z" />
                    </svg>
                  </div>
                  <span>{integrations.zoom.connected ? "Zoom Ready" : "Zoom"}</span>
                </button>
                {integrations.zoom.connected && (
                  <button
                    onClick={() => handleDisconnect('zoom')}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    title="Disconnect Zoom"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowScheduleForm(true)}
              className="bg-blue-600 dark:bg-[#6264a7] text-white px-6 py-2.5 rounded-lg shadow-md hover:bg-blue-700 dark:hover:bg-[#7173b3] transition text-sm font-semibold flex items-center gap-2"
            >
              <span className="text-xl leading-none">+</span> New Meeting
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-[#292929] rounded-lg shadow-sm p-4 border border-gray-200 dark:border-[#3d3d3d]" style={{ height: 'calc(100vh - 200px)' }}>
          <CustomCalendar key={refreshKey} />
        </div>
      </main>

      {showScheduleForm && (
        <ScheduleMeeting
          onClose={() => setShowScheduleForm(false)}
          onMeetingCreated={handleMeetingCreated}
        />
      )}
    </div>
  );
}
