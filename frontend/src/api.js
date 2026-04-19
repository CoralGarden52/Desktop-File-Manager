const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `request failed: ${response.status}`);
  }

  return response.json();
}

export function listMessages(limit = 80) {
  return request(`/messages?limit=${limit}`);
}

export function createMessage(payload) {
  return request("/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteMessage(messageId) {
  return request(`/messages/${messageId}`, {
    method: "DELETE",
  });
}

export function searchMessages(payload) {
  return request("/search", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function askAgent(question) {
  return request("/agent/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}
