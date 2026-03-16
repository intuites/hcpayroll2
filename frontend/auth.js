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
  return isLocalHost()
    ? "http://localhost:5000/api"
    : "https://hcpayrollmai.vercel.app/api";
}

function toLoginEmail(loginId) {
  const raw = String(loginId || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  return `${raw}@hcpayroll.local`;
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

export async function signIn(loginId, password) {
  await ensureDefaultAuthUser();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: toLoginEmail(loginId),
    password: String(password || ""),
  });

  if (error) throw error;

  localStorage.setItem(STORAGE_KEY, "1");
  return data;
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
