import { createClient } from "@supabase/supabase-js";

const DEFAULT_LOGIN_ID = "admin";
const DEFAULT_LOGIN_PASSWORD = "Admin@12345";

function toLoginEmail(loginId) {
  const raw = String(loginId || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  return `${raw}@hcpayroll.local`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST") {
    try {
      const action = String(req.body?.action || "").trim();
      if (action !== "ensure-default-auth-user") {
        return res.status(400).json({ error: "Unsupported action" });
      }

      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
      if (!url || !key) {
        return res.status(500).json({ error: "Missing Supabase auth env" });
      }

      const loginId = String(process.env.DEFAULT_LOGIN_ID || DEFAULT_LOGIN_ID).trim();
      const loginPassword = String(
        process.env.DEFAULT_LOGIN_PASSWORD || DEFAULT_LOGIN_PASSWORD
      ).trim();
      const email = toLoginEmail(loginId);

      const supabase = createClient(url, key);
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
      return res.status(500).json({ error: error.message || "Failed to prepare login" });
    }
  }

  return res.status(200).json({
    status: "ok",
    message: "HC Payroll API is running on Vercel",
  });
}
