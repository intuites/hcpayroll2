import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const rows = req.body;

      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "Expected array of payroll rows" });
      }

      const { error } = await supabase
        .from("payroll")
        .insert(rows);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("payroll")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return res.status(200).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
