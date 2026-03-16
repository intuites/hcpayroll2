import { supabase } from "./supabase.js";

const STORAGE_KEY = "hc_logged_in";
const DEFAULT_LOGIN_ID = "admin";

function isLocalHost() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

function getApiUrl() {
  if (isLocalHost()) return "http://localhost:5000/api/";
  if (window.location.hostname.endsWith(".vercel.app")) {
    return `${window.location.origin}/api/`;
  }
  return "https://hcpayrollreports.vercel.app/api/";
}

function toLoginEmail(loginId) {
  const raw = String(loginId || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  return `${raw}@hcpayrolladmin.com`;
}

export async function ensureDefaultAuthUser() {
  const res = await fetch(getApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ensure-default-auth-user" }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Failed to prepare default login");
  }

  return data;
}

function isInvalidCredentialsError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("invalid login credentials") ||
    message.includes("email not confirmed") ||
    message.includes("invalid email or password")
  );
}

export async function signIn(loginId, password) {
  const email = toLoginEmail(loginId);
  const rawPassword = String(password || "");

  const firstAttempt = await supabase.auth.signInWithPassword({
    email,
    password: rawPassword,
  });

  if (!firstAttempt.error) {
    localStorage.setItem(STORAGE_KEY, "1");
    return firstAttempt.data;
  }

  if (!isInvalidCredentialsError(firstAttempt.error)) {
    throw firstAttempt.error;
  }

  await ensureDefaultAuthUser();

  const secondAttempt = await supabase.auth.signInWithPassword({
    email,
    password: rawPassword,
  });

  if (secondAttempt.error) throw secondAttempt.error;

  localStorage.setItem(STORAGE_KEY, "1");
  return secondAttempt.data;
}

export async function signOut() {
  await supabase.auth.signOut();
  localStorage.removeItem(STORAGE_KEY);
  window.location.href = "login.html";
}

export async function protectPage() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = "login.html";
    return null;
  }

  const session = data?.session || null;
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = "login.html";
    return null;
  }

  localStorage.setItem(STORAGE_KEY, "1");
  return session;
}

export async function redirectIfLoggedIn() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    localStorage.setItem(STORAGE_KEY, "1");
    window.location.href = "index.html";
    return true;
  }
  return false;
}

export function setupLogoutButton() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = "Logging out...";
    try {
      await signOut();
    } catch (_error) {
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = "login.html";
    }
  });
}

export function getDefaultLoginId() {
  return DEFAULT_LOGIN_ID;
}
