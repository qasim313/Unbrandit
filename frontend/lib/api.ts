"use client";

import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL
});

api.interceptors.request.use((config: any) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("token");
    if (token) {
      // eslint-disable-next-line no-param-reassign
      config.headers = (config.headers || {}) as any;
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export default api;

