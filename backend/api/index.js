import express from "express";
import { supabase } from "../server/supabaseClient.js";

const router = express.Router();
const DEFAULT_LOGIN_ID = "admin";
const DEFAULT_LOGIN_PASSWORD = "Admin@12345";

function toLoginEmail(loginId) {
  const raw = String(loginId || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  return `${raw}@hcpayroll.local`;
}

router.options("/", (_req, res) => res.status(200).end());

router.post("/", async (req, res) => {
  try {
    const action = String(req.body?.action || "").trim();
    if (action !== "ensure-default-auth-user") {
      return res.status(400).json({ error: "Unsupported action" });
    }

    const loginId = String(process.env.DEFAULT_LOGIN_ID || DEFAULT_LOGIN_ID).trim();
    const loginPassword = String(
      process.env.DEFAULT_LOGIN_PASSWORD || DEFAULT_LOGIN_PASSWORD
    ).trim();
    const email = toLoginEmail(loginId);

    const { data: usersData, error: listError } =
      await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });

    if (listError) {
      return res.status(500).json({ error: listError.message });
    }

    const existingUser = (usersData?.users || []).find(
      (user) => String(user.email || "").toLowerCase() === email
    );

    if (!existingUser) {
      const { error: createError } = await supabase.auth.admin.createUser({
        email,
        password: loginPassword,
        email_confirm: true,
        user_metadata: {
          login_id: loginId,
          role: "admin",
        },
      });

      if (createError) {
        return res.status(500).json({ error: createError.message });
      }
    }

    return res.status(200).json({
      ok: true,
      default_login_id: loginId,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to prepare default login",
    });
  }
});

router.get("/", (_req, res) => {
  return res.status(200).json({
    status: "ok",
    message: "Healthcare Payroll API is running",
  });
});

export default router;
