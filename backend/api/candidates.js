import express from "express";
import { supabase } from "../server/supabaseClient.js";

const router = express.Router();

/* ---------- CREATE CANDIDATE ---------- */
router.post("/", async (req, res) => {
  try {
    const payload = { ...req.body };

    // IMPORTANT: let DB generate UUID
    delete payload.candidate_uuid;

    const { data, error } = await supabase
      .from("candidate_data")
      .insert([payload])
      .select("id, candidate_uuid, candidate_name, created_at")
      .single();

    if (error) {
      console.error("Supabase INSERT ERROR:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("CREATE CANDIDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------- LIST CANDIDATES ---------- */
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("candidate_data")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase SELECT ERROR:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("LIST CANDIDATES ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------- UPDATE CANDIDATE ---------- */
router.patch("/", async (req, res) => {
  try {
    const candidate_uuid = req.body?.candidate_uuid;
    const updates = { ...(req.body?.updates || {}) };

    if (!candidate_uuid) {
      return res.status(400).json({ error: "candidate_uuid is required" });
    }

    delete updates.candidate_uuid;
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from("candidate_data")
      .update(updates)
      .eq("candidate_uuid", candidate_uuid)
      .select("*")
      .single();

    if (error) {
      console.error("Supabase UPDATE ERROR:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("UPDATE CANDIDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
