import api from './api';

export const getIntegrationStatus = async () => {
    const response = await api.get('/api/integrations/status');
    return response.data;
};

export const connectGoogle = async () => {
    const response = await api.get('/api/integrations/google/connect');
    return response.data; // { url }
};

export const connectZoom = async () => {
    const response = await api.get('/api/integrations/zoom/connect');
    return response.data; // { url }
};
