const STORAGE_KEY = "agent_jury_session";

export function getSession() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function setSession(partial) {
  if (typeof window === "undefined") return;
  const next = { ...getSession(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
