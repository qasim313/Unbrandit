"use client";

import { create } from "zustand";

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: typeof window !== "undefined" ? window.localStorage.getItem("token") : null,
  setToken: (token) => {
    if (typeof window !== "undefined") {
      if (token) {
        window.localStorage.setItem("token", token);
        setCookie("token", token, 7);
      } else {
        window.localStorage.removeItem("token");
        deleteCookie("token");
      }
    }
    set({ token });
  }
}));
