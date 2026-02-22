import axios from "axios";

// Create axios instance with base URL
const api = axios.create({
    baseURL: "http://localhost:5000",
});

// Add request interceptor to attach JWT token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("token") || sessionStorage.getItem("token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// API functions
export const getMeetings = async (userEmail) => {
    const response = await api.get(`/meetings?userEmail=${userEmail}`);
    return response.data;
};

export const createMeeting = async (meetingData) => {
    const response = await api.post("/meetings", meetingData);
    return response.data;
};

export const checkAttendeeAvailability = async (attendees, startTime, endTime) => {
    const response = await api.post("/meetings/check-availability", {
        attendees,
        startTime,
        endTime,
    });
    return response.data;
};

export const disconnectIntegration = async (platform) => {
    const response = await api.post("/integrations/disconnect", { platform });
    return response.data;
};

export default api;
