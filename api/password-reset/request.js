import { requestPasswordReset } from "../../lib/password-reset-service.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = await requestPasswordReset(
      req.body?.login_or_email,
      req.body?.redirect_url
    );
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to request password reset" });
  }
}
