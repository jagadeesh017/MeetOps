import axios from "axios";

const api = axios.create({
    baseURL: "http://localhost:5000",
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("token") || sessionStorage.getItem("token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

const apiCall = async (method, url, data = null) => {
    const response = await api[method](url, data);
    return response.data;
};

export const getMeetings = (userEmail) => apiCall('get', `/meetings?userEmail=${userEmail}`);
export const createMeeting = (meetingData) => apiCall('post', '/meetings', meetingData);
export const updateMeeting = (meetingId, data) => apiCall('put', `/meetings/${meetingId}`, data);
export const deleteMeeting = (meetingId) => apiCall('delete', `/meetings/${meetingId}`);
export const checkAttendeeAvailability = (attendees, startTime, endTime, excludeMeetingId = null) =>
    apiCall('post', '/meetings/check-availability', { attendees, startTime, endTime, excludeMeetingId });
export const disconnectIntegration = (platform) => apiCall('post', '/integrations/disconnect', { platform });

export default api;
