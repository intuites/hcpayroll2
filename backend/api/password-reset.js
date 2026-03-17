import express from "express";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../../lib/password-reset-service.js";

const router = express.Router();

router.options("/request", (_req, res) => res.status(200).end());
router.options("/confirm", (_req, res) => res.status(200).end());

router.post("/request", async (req, res) => {
  try {
    const data = await requestPasswordReset(
      req.body?.login_or_email,
      req.body?.redirect_url
    );
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to request password reset" });
  }
});

router.post("/confirm", async (req, res) => {
  try {
    const data = await confirmPasswordReset(req.body?.token, req.body?.password);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to reset password" });
  }
});

export default router;
