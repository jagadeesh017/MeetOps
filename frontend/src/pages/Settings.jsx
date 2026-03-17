import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../context/Authcontext";
import { getMySettings, updateMySettings } from "../services/settings";
import { useToast } from "../context/ToastContext";

const TZ_OPTIONS = ["Asia/Kolkata", "UTC", "America/New_York", "Europe/London", "Asia/Singapore"];

const defaultForm = {
  timezone: "Asia/Kolkata",
  defaultPlatform: "zoom",
  defaultDurationMinutes: 30,
  bufferMinutes: 10,
  workHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5], availableAllTime: false },
  ai: { autoConfirmBeforeCreate: false, includeConflictDetails: true },
  notifications: { emailRemindersEnabled: true, reminderMinutesBefore: 15 },
};

const dayChoices = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];

export default function Settings() {
  const { user, setUser } = useContext(AuthContext);
  const { showToast } = useToast();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await getMySettings();
        setForm({ ...defaultForm, ...data, workHours: { ...defaultForm.workHours, ...(data.workHours || {}) }, ai: { ...defaultForm.ai, ...(data.ai || {}) }, notifications: { ...defaultForm.notifications, ...(data.notifications || {}) } });
      } catch {
        showToast("Failed to load settings", "error");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [showToast]);

  const selectedDays = useMemo(() => new Set(form.workHours.days || []), [form.workHours.days]);
  const isAvailableAllTime = Boolean(form.workHours.availableAllTime);

  const update = (path, value) => {
    setForm((prev) => {
      if (path.length === 1) return { ...prev, [path[0]]: value };
      if (path[0] === "workHours") return { ...prev, workHours: { ...prev.workHours, [path[1]]: value } };
      if (path[0] === "ai") return { ...prev, ai: { ...prev.ai, [path[1]]: value } };
      if (path[0] === "notifications") return { ...prev, notifications: { ...prev.notifications, [path[1]]: value } };
      return prev;
    });
  };

  const toggleDay = (day) => {
    const next = new Set(selectedDays);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    update(["workHours", "days"], [...next].sort((a, b) => a - b));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateMySettings(form);
      const nextSettings = res.settings || form;
      setUser((prev) => ({ ...(prev || {}), settings: nextSettings }));
      showToast("Settings saved", "success");
    } catch {
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">Loading settings...</div>;

  return (
    <section className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Workspace Settings</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">Scheduling defaults</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Timezone</span>
            <select value={form.timezone} onChange={(e) => update(["timezone"], e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {TZ_OPTIONS.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Default Platform</span>
            <select value={form.defaultPlatform} onChange={(e) => update(["defaultPlatform"], e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <option value="zoom">Zoom</option>
              <option value="google">Google Meet</option>
              <option value="teams">Teams (when integrated)</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              Teams preference is saved, but meeting creation currently falls back to Zoom until Teams integration is enabled.
            </span>
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Default Duration (min)</span>
            <input type="number" min={15} max={180} value={form.defaultDurationMinutes} onChange={(e) => update(["defaultDurationMinutes"], Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Buffer Minutes</span>
            <input type="number" min={0} max={60} value={form.bufferMinutes} onChange={(e) => update(["bufferMinutes"], Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Work Start</span>
            <input type="time" value={form.workHours.start} disabled={isAvailableAllTime} onChange={(e) => update(["workHours", "start"], e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Work End</span>
            <input type="time" value={form.workHours.end} disabled={isAvailableAllTime} onChange={(e) => update(["workHours", "end"], e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </label>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isAvailableAllTime}
              onChange={(e) => update(["workHours", "availableAllTime"], e.target.checked)}
            />
            Available all time (disable working-hours restrictions)
          </label>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Working days</p>
          <div className="flex flex-wrap gap-2">
            {dayChoices.map((d) => (
              <button
                key={d.v}
                type="button"
                disabled={isAvailableAllTime}
                onClick={() => toggleDay(d.v)}
                className={`rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${selectedDays.has(d.v) ? "border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-blue-300 dark:text-slate-900" : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
              >
                {d.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Automation</p>
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={form.ai.autoConfirmBeforeCreate} onChange={(e) => update(["ai", "autoConfirmBeforeCreate"], e.target.checked)} />
            Ask confirmation before AI creates meetings
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={form.ai.includeConflictDetails} onChange={(e) => update(["ai", "includeConflictDetails"], e.target.checked)} />
            Show conflict details in AI responses
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={form.notifications.emailRemindersEnabled} onChange={(e) => update(["notifications", "emailRemindersEnabled"], e.target.checked)} />
            Enable email reminders
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Reminder before (min)</span>
            <input type="number" min={5} max={120} value={form.notifications.reminderMinutesBefore} onChange={(e) => update(["notifications", "reminderMinutesBefore"], Number(e.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </label>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </section>
  );
}
