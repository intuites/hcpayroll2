import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;

      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const body = req.body;

      const { data, error } = await supabase
        .from("candidates")
        .insert(body);

      if (error) throw error;

      return res.status(200).json({ success: true, data });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
