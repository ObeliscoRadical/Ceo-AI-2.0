import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || (typeof window !== "undefined" && window.location.origin.startsWith("http") ? window.location.origin : "http://localhost:8001");
export const API = `${BACKEND_URL.replace(/\/$/, '')}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function formatApiError(detail) {
  if (detail == null) return "Algo correu mal. Tente novamente.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

// Stream chat via fetch + SSE reader
export async function streamChat({ message, session_id, attachment_ids }, onDelta, onDone) {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API}/chat`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ message, session_id, attachment_ids }),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        const data = JSON.parse(line.slice(5).trim());
        if (data.delta) onDelta(data.delta);
        if (data.done) onDone && onDone(data.session_id);
      } catch (e) {}
    }
  }
}
