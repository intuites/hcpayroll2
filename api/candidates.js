import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {                  
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY;

    if (!url || !key) {
      return res.status(500).json({
        error: "Missing Supabase env",
        SUPABASE_URL: !!url,
        SUPABASE_KEY: !!key
      });
    }

    const supabase = createClient(url, key);

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("candidate_data")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({
          supabaseError: error.message
        });
      }

      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const payload = { ...(req.body || {}) };
      delete payload.candidate_uuid;

      const { data, error } = await supabase
        .from("candidate_data")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json(data);
    }

    if (req.method === "PATCH") {
      const candidate_uuid = req.body?.candidate_uuid;
      const updates = req.body?.updates || {};

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
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (e) {
    return res.status(500).json({
      crash: e.message
    });
  }
}
