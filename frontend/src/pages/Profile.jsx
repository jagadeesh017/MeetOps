import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/Authcontext";
import { getIntegrationStatus } from "../services/integrations";

export default function Profile() {
  const { user } = useContext(AuthContext);
  const [integrations, setIntegrations] = useState({ google: { connected: false }, zoom: { connected: false } });

  useEffect(() => {
    getIntegrationStatus().then(setIntegrations).catch(() => null);
  }, []);

  return (
    <section className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Profile</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{user?.name || "User"}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your account details and workspace identity.</p>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Email</dt>
            <dd className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{user?.email || "-"}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Department</dt>
            <dd className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{user?.department || "-"}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Timezone</dt>
            <dd className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{user?.settings?.timezone || "Asia/Kolkata"}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Default Platform</dt>
            <dd className="mt-2 text-sm font-medium capitalize text-slate-900 dark:text-slate-100">{user?.settings?.defaultPlatform || "zoom"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Connections</p>
        <div className="mt-4 space-y-3">
          {["google", "zoom"].map((k) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">{k}</p>
              <p className={`mt-1 text-xs font-medium ${integrations[k]?.connected ? "text-emerald-700" : "text-amber-700"}`}>
                {integrations[k]?.connected ? `Connected (${integrations[k]?.email || ""})` : "Not connected"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
