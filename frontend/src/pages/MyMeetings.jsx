import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/Authcontext";
import { getMeetings } from "../services/api";

// Platform display config
const PLATFORM_CONFIG = {
    zoom: { label: "Zoom", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-500" },
    meet: { label: "Google Meet", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", dot: "bg-green-500" },
    google: { label: "Google Meet", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", dot: "bg-green-500" },
    teams: { label: "Teams", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300", dot: "bg-indigo-500" },
    webex: { label: "Webex", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500" },
    other: { label: "Other", color: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300", dot: "bg-gray-400" },
};

function PlatformBadge({ platform }) {
    const cfg = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.other;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

export default function MyMeetings({ onBack }) {
    const { user } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchMeetings();
    }, [user]);

    const fetchMeetings = async () => {
        if (!user?.email) return;

        try {
            setLoading(true);
            setError(null);
            const data = await getMeetings(user.email);
            setMeetings(data);
        } catch (err) {
            console.error("Error fetching meetings:", err);
            setError("Failed to fetch meetings");
        } finally {
            setLoading(false);
        }
    };

    const formatDateTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-neutral-900">
            <header className="bg-white dark:bg-neutral-800 shadow px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="text-blue-600 hover:text-blue-700"
                    >
                        ← Back
                    </button>
                    <h1 className="text-xl font-semibold text-blue-600">My Meetings</h1>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-300">{user?.email}</span>
            </header>

            <main className="p-6 max-w-4xl mx-auto">
                <div className="bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                            Meetings List
                        </h2>
                        <button
                            onClick={fetchMeetings}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            Refresh
                        </button>
                    </div>

                    {loading && (
                        <div className="text-center py-8">
                            <p className="text-gray-500 dark:text-gray-400">Loading...</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4 text-center">
                            <p className="text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}

                    {!loading && !error && meetings.length === 0 && (
                        <div className="text-center py-8">
                            <p className="text-gray-500 dark:text-gray-400">No meetings scheduled</p>
                        </div>
                    )}

                    {!loading && !error && meetings.length > 0 && (
                        <div className="space-y-3">
                            {meetings.map((meeting) => (
                                <div
                                    key={meeting._id}
                                    className="border border-gray-200 dark:border-gray-700 rounded p-4 hover:bg-gray-50 dark:hover:bg-neutral-700"
                                >
                                    {/* Title + platform badge + status */}
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                                            {meeting.title}
                                        </h3>
                                        {meeting.platform && <PlatformBadge platform={meeting.platform} />}
                                        {meeting.status && (
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meeting.status === 'scheduled'
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                    : meeting.status === 'cancelled'
                                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                                }`}>
                                                {meeting.status}
                                            </span>
                                        )}
                                    </div>

                                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                        <p>
                                            <strong>Start:</strong> {formatDateTime(meeting.startTime)}
                                        </p>
                                        <p>
                                            <strong>End:</strong>{" "}
                                            {new Date(meeting.endTime).toLocaleTimeString("en-US", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                        {meeting.attendees && meeting.attendees.length > 0 && (
                                            <p>
                                                <strong>Participants:</strong>{" "}
                                                {meeting.attendees.map((a) => a.name || a.email).join(", ")}
                                            </p>
                                        )}
                                    </div>

                                    {/* Join Meeting button */}
                                    {meeting.joinUrl && (
                                        <div className="mt-3">
                                            <a
                                                href={meeting.joinUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                            >
                                                Join Meeting →
                                            </a>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
