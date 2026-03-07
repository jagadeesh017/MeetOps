import api from "./api";

export const getMySettings = async () => {
  const { data } = await api.get("/api/settings/me");
  return data;
};

export const updateMySettings = async (payload) => {
  const { data } = await api.patch("/api/settings/me", payload);
  return data;
};
