import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  try {
    const { candidates } = req.body;

    const { data, error } = await supabase
      .rpc("generate_payroll", { candidates });

    if (error) throw error;

    res.status(200).json({ rows: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
