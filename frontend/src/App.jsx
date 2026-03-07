import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./context/Authcontext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "settings", label: "Settings" },
  { key: "profile", label: "Profile" },
];

function ThemeToggle({ isDark, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      aria-label="Toggle theme"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
        </svg>
      )}
    </button>
  );
}

function ShellNav({ activeTab, setActiveTab, user, onLogout, isDark, onToggleTheme }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/95">
      <div className="flex w-full items-center gap-4 px-3 py-3 md:px-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">MeetOps</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Meeting operations workspace</p>
        </div>

        <nav className="ml-2 flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-slate-900 text-white dark:bg-blue-300 dark:text-slate-900"
                  : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user?.name || "User"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user?.email || ""}</p>
          </div>
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          <button
            onClick={onLogout}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

function App() {
  const { user, loading, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", theme);
  }, [theme, isDark]);

  const activeView = useMemo(() => {
    if (activeTab === "settings") return <Settings />;
    if (activeTab === "profile") return <Profile />;
    return <Dashboard />;
  }, [activeTab]);

  if (loading) return <p className="p-6">Loading...</p>;
  if (!user) return <Login />;

  return (
    <div className="min-h-screen bg-[radial-gradient(1000px_400px_at_10%_-10%,#dbeafe_0%,transparent_50%),radial-gradient(1000px_450px_at_100%_0%,#ede9fe_0%,transparent_45%),#f8fafc] text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <ShellNav activeTab={activeTab} setActiveTab={setActiveTab} user={user} onLogout={logout} isDark={isDark} onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
      <main className="min-h-[calc(100vh-70px)] w-full px-3 py-2 md:px-4 dark:bg-slate-950">{activeView}</main>
    </div>
  );
}

export default App;
