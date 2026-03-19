const KEY = "soul-treehole:v1";

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function loadState() {
  const raw = localStorage.getItem(KEY);
  const state = raw ? safeParse(raw, null) : null;
  if (!state || typeof state !== "object") {
    return {
      messages: [],
      checkins: [],
      journal: [],
      prefs: { anonymous: true },
    };
  }
  return {
    messages: Array.isArray(state.messages) ? state.messages : [],
    checkins: Array.isArray(state.checkins) ? state.checkins : [],
    journal: Array.isArray(state.journal) ? state.journal : [],
    prefs: state.prefs && typeof state.prefs === "object" ? state.prefs : { anonymous: true },
  };
}

export function saveState(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

