import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { from_date, to_date, payroll_name, rows } = req.body || {};

    if (!from_date || !to_date || !payroll_name) {
      return res.status(400).json({
        error: "from_date, to_date, and payroll_name are required",
      });
    }

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: "rows must be a non-empty array" });
    }

    const { data: existingRuns, error: existingError } = await supabase
      .from("payroll_runs")
      .select("id")
      .eq("from_date", from_date)
      .eq("to_date", to_date)
      .limit(1);

    if (existingError) throw existingError;

    let runId = existingRuns?.[0]?.id || null;
    let updated = false;

    if (runId) {
      const { error: runUpdateError } = await supabase
        .from("payroll_runs")
        .update({
          payroll_name,
          from_date,
          to_date,
        })
        .eq("id", runId);

      if (runUpdateError) {
        return res.status(500).json({
          error: "Failed to update payroll run",
          details: runUpdateError.message,
        });
      }

      const { error: deleteItemsError } = await supabase
        .from("payroll_items")
        .delete()
        .eq("payroll_run_id", runId);

      if (deleteItemsError) {
        return res.status(500).json({
          error: "Failed to replace payroll items",
          details: deleteItemsError.message,
        });
      }

      updated = true;
    } else {
      const { data: run, error: runError } = await supabase
        .from("payroll_runs")
        .insert({
          payroll_name,
          from_date,
          to_date,
        })
        .select("id")
        .single();

      if (runError || !run) {
        return res.status(500).json({
          error: "Failed to create payroll run",
          details: runError?.message,
        });
      }

      runId = run.id;
    }

    const items = rows.filter(Boolean).map((row) => ({
      ...row,
      payroll_run_id: runId,
    }));

    const { error: itemsError } = await supabase
      .from("payroll_items")
      .insert(items);

    if (itemsError) {
      return res.status(500).json({
        error: "Failed to save payroll items",
        details: itemsError.message,
      });
    }

    return res.status(200).json({ payroll_run_id: runId, updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
