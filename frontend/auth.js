import { supabase } from "./supabase.js";

const STORAGE_KEY = "hc_logged_in";
const USER_STORAGE_KEY = "hc_login_user";
const DEFAULT_LOGIN_ID = "admin";

export async function signIn(loginId, password) {
  const rawLogin = String(loginId || "").trim();
  const rawPassword = String(password || "");
  if (!rawLogin || !rawPassword) {
    throw new Error("Enter login ID and password");
  }

  const { data, error } = await supabase.rpc("verify_app_login", {
    p_login: rawLogin,
    p_password: rawPassword,
  });

  if (error) {
    throw new Error(error.message || "Failed to verify login");
  }

  const user = Array.isArray(data) ? data[0] : null;
  if (!user || user.is_valid !== true) {
    throw new Error("Invalid login ID or password");
  }

  localStorage.setItem(STORAGE_KEY, "1");
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  return user;
}

export async function signOut() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  window.location.href = "login.html";
}

export async function protectPage() {
  const isLoggedIn = localStorage.getItem(STORAGE_KEY) === "1";
  const rawUser = localStorage.getItem(USER_STORAGE_KEY);
  if (!isLoggedIn || !rawUser) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    window.location.href = "login.html";
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    window.location.href = "login.html";
    return null;
  }
}

export async function redirectIfLoggedIn() {
  if (localStorage.getItem(STORAGE_KEY) === "1") {
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
