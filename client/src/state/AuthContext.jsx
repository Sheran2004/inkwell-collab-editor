import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

const API_URL = (
  import.meta.env.VITE_API_URL ||
  "https://inkwell-collab-editor-api-fsfx.onrender.com"
).replace(/\/+$/, "");

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 204) return null;

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return body;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    request("/api/auth/me")
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = {
    user,
    loading,

    login: async (data) => {
      const result = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });

      setUser(result.user);
      return result.user;
    },

    signup: async (data) => {
      const result = await request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(data),
      });

      setUser(result.user);
      return result.user;
    },

    logout: async () => {
      await request("/api/auth/logout", {
        method: "POST",
      });

      setUser(null);
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function apiRequest(path, options = {}) {
  return request(path, options);
}