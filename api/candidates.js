import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    if (!url || !key) {
      return res.status(500).json({
        error: "Missing Supabase env",
        SUPABASE_URL: !!url,
        SUPABASE_KEY: !!key
      });
    }

    const supabase = createClient(url, key);

    const { data, error } = await supabase
      .from("candidate_data")
      .select("*");

    if (error) {
      return res.status(500).json({
        supabaseError: error.message
      });
    }

    return res.status(200).json(data);

  } catch (e) {
    return res.status(500).json({
      crash: e.message
    });
  }
}
