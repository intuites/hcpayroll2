import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const RESET_TOKEN_TTL_MINUTES = 60;

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env");
  }

  return createClient(url, key);
}

function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.toString();
  } catch {
    return "";
  }
}

function createResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function addMinutesToIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function sendResetEmail(email, resetUrl) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESET_FROM_EMAIL;

  if (!resendApiKey || !fromEmail) {
    throw new Error("Missing reset email env");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: "Reset your Intuites Healthcare Staffing password",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
          <h2 style="margin-bottom: 12px;">Reset your password</h2>
          <p>We received a request to reset your password.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
              Reset Password
            </a>
          </p>
          <p>This link will expire in ${RESET_TOKEN_TTL_MINUTES} minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: `Reset your password: ${resetUrl}\n\nThis link will expire in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send reset email: ${text}`);
  }
}

export async function requestPasswordReset(loginOrEmail, redirectUrl) {
  const lookup = normalizeLogin(loginOrEmail);
  const safeRedirectUrl = normalizeUrl(redirectUrl);
  if (!lookup) {
    throw new Error("Login ID or email is required");
  }
  if (!safeRedirectUrl) {
    throw new Error("Valid reset redirect URL is required");
  }

  const supabase = getSupabaseAdminClient();
  const { data: users, error } = await supabase
    .from("app_login_users")
    .select("id, login_id, email, is_active")
    .or(`login_id.ilike.${lookup},email.ilike.${lookup}`)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const user = Array.isArray(users) ? users[0] : null;
  if (!user || user.is_active === false || !user.email) {
    return {
      ok: true,
      email: null,
      message: "If that account exists, a reset link has been sent to the email.",
    };
  }

  const token = createResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = addMinutesToIso(RESET_TOKEN_TTL_MINUTES);

  await supabase
    .from("app_password_reset_tokens")
    .delete()
    .eq("user_id", user.id)
    .is("used_at", null);

  const { error: insertError } = await supabase
    .from("app_password_reset_tokens")
    .insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const resetUrl = new URL(safeRedirectUrl);
  resetUrl.searchParams.set("token", token);
  resetUrl.searchParams.set("email", user.email);

  await sendResetEmail(user.email, resetUrl.toString());

  return {
    ok: true,
    email: user.email,
    message: "If that account exists, a reset link has been sent to the email.",
  };
}

export async function confirmPasswordReset(token, password) {
  const rawToken = String(token || "").trim();
  const rawPassword = String(password || "");

  if (!rawToken) {
    throw new Error("Reset token is required");
  }
  if (rawPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const supabase = getSupabaseAdminClient();
  const tokenHash = hashResetToken(rawToken);

  const { data: tokens, error: tokenError } = await supabase
    .from("app_password_reset_tokens")
    .select("token_hash, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .limit(1);

  if (tokenError) {
    throw new Error(tokenError.message);
  }

  const resetRow = Array.isArray(tokens) ? tokens[0] : null;
  if (!resetRow) {
    throw new Error("Invalid or expired reset link");
  }
  if (resetRow.used_at) {
    throw new Error("This reset link was already used");
  }
  if (new Date(resetRow.expires_at).getTime() < Date.now()) {
    throw new Error("This reset link has expired");
  }

  const { error: rpcError } = await supabase.rpc("set_app_login_password", {
    p_user_id: resetRow.user_id,
    p_new_password: rawPassword,
  });

  if (rpcError) {
    throw new Error(rpcError.message);
  }

  const { error: updateError } = await supabase
    .from("app_password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    ok: true,
    message: "Password reset successfully. You can log in now.",
  };
}
