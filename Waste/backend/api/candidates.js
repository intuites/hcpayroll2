import express from "express";
import { supabase } from "../server/supabaseClient.js";

const router = express.Router();

/* ---------- CREATE CANDIDATE ---------- */
router.post("/", async (req, res) => {
  const { data, error } = await supabase
    .from("candidate_data")
    .insert([req.body])
    .select()
    .single();

  if (error) {
    console.error("Supabase ERROR:", error);
    return res.status(400).json(error);
  }

  res.json(data);
});

/* ---------- LIST CANDIDATES ---------- */
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("candidate_data")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase ERROR:", error);
    return res.status(400).json(error);
  }

  res.json(data);
});

export default router;