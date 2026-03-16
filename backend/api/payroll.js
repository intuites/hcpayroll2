import express from "express";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { supabase } from "../server/supabaseClient.js";

const router = express.Router();

/* ================= CONFIG ================= */
const SHEET_ID = process.env.GSHEET_ID;
const SHEET_NAME = "Payroll";
const DEFAULT_VMS_RATE = 0.06;
 
if (!SHEET_ID) throw new Error("GSHEET_ID missing");

const KEY_PATH = path.join(process.cwd(), "google-service-account.json");                                           
if (!fs.existsSync(KEY_PATH)) {
  throw new Error("google-service-account.json missing");
}

/* ================= GOOGLE AUTH ================= */
const auth = new google.auth.GoogleAuth({
  keyFile: KEY_PATH,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

const sheetsApi = google.sheets({ version: "v4", auth });
const driveApi = google.drive({ version: "v3", auth });

/* ================= UTIL ================= */
const n = (v) => {
  const x = Number(v);
  return Number.isNaN(x) ? 0 : x;
};
const round = (v) =>
  v === null || v === undefined
    ? null
    : Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const pad2 = (v) => String(v).padStart(2, "0");

/* ================= CORE PAYROLL ================= */
function calculatePayroll(base, input) {
  const vms_charges = n(
    input.vms_charges ?? base.vms_charges ?? DEFAULT_VMS_RATE
  );
  const reg = n(input.reg_hours ?? base.reg_hours);
  const ot = n(input.ot_hours ?? base.ot_hours);
  const hol = n(input.holiday_hours ?? base.holiday_hours);

  const w2 = n(input.w2_rate ?? base.w2_rate);
  const stipend = n(input.stipend_rate ?? base.stipend_rate);
  const ot_rate = n(input.ot_rate ?? base.ot_rate);
  const holiday_rate = n(input.holiday_rate ?? base.holiday_rate);
  const sign_bonus = n(input.sign_bonus ?? base.sign_bonus);

  let standard_w2_amount = reg * w2;
  let ot_amount = ot * ot_rate;
  let holiday_amount = hol * holiday_rate;
  let standard_stipend_amount = reg * stipend;
 
  /* MISSED PAYMENT */
  const missed_amt = n(input.missed_payment_amount);
  const missed_type = input.missed_payment_type;
  if (missed_amt > 0 && missed_type) {
    if (missed_type === "regular") standard_w2_amount += missed_amt;
    if (missed_type === "ot") ot_amount += missed_amt;
    if (missed_type === "holiday") holiday_amount += missed_amt;
    if (missed_type === "stipend") standard_stipend_amount += missed_amt;
  }

  const guaranteed = w2 * ot;
  const overall_bonus = sign_bonus + ot_amount + holiday_amount;
  const total_pay = standard_w2_amount + overall_bonus;

  /* 🔒 TOTAL PAYABLE (LOCKED FORMULA) */
  const total_payable =
    standard_w2_amount + standard_stipend_amount + overall_bonus;
  /* CLIENT */
  const client_std_rate = n(
    input.client_standard_bill_rate ?? base.client_standard_bill_rate
  );
  const client_ot_rate = n(
    input.client_ot_bill_rate ?? base.client_ot_bill_rate
  );
  const client_hol_rate = n(
    input.client_holiday_bill_rate ?? base.client_holiday_bill_rate
  );

  // const client_standard_amount = (reg * client_std_rate) / 1.06;
  const client_standard_amount = reg * client_std_rate * (1 - vms_charges);
  const client_ot_holiday_amount =
    ot * (client_ot_rate - vms_charges * client_ot_rate) +
    hol * (client_hol_rate - vms_charges * client_hol_rate);
 
  //const vms_charges = 0.06;
  const total_received = client_standard_amount + client_ot_holiday_amount;
  let total_candidate_expense =
    (standard_w2_amount + ot_amount) * 1.2 + standard_stipend_amount;

  // Keep formula-driven expense unless caller explicitly asks to override.
  if (
    input.use_manual_total_candidate_expense === true &&
    input.total_candidate_expense !== undefined &&
    input.total_candidate_expense !== null &&
    input.total_candidate_expense !== ""
  ) {
    total_candidate_expense = n(input.total_candidate_expense);
  }

  const net_profit = round(total_received - total_candidate_expense);

  return {
    candidate_uuid: base.candidate_uuid,
    candidate_name: base.candidate_name,

    reg_hours: reg,
    ot_hours: ot,
    holiday_hours: hol,
    total_hours: reg + ot + hol,

    w2_rate: w2,
    stipend_rate: stipend,
    ot_rate,
    holiday_rate,

    guaranteed: round(guaranteed),

    standard_w2_amount: round(standard_w2_amount),
    ot_amount: round(ot_amount),
    holiday_amount: round(holiday_amount),

    sign_bonus: round(sign_bonus),
    overall_bonus: round(overall_bonus),
    total_pay: round(total_pay),

    standard_stipend_amount: round(standard_stipend_amount),
    total_payable: round(total_payable),

    total_candidate_expense: round(total_candidate_expense),

    client_standard_bill_rate: client_std_rate,
    vms_charges: round(vms_charges),
    client_standard_amount: round(client_standard_amount),

    client_ot_bill_rate: client_ot_rate,
    client_holiday_bill_rate: client_hol_rate,
    client_ot_holiday_amount: round(client_ot_holiday_amount),

    total_amount_received_from_client: round(total_received),
    net_profit,

    missed_payment_amount: missed_amt || null,
    missed_payment_type: missed_type || null,
  };
}

/* ================= PREVIEW ================= */
router.post("/preview", async (req, res) => {
  try {
    const ids = req.body.candidates.map((c) => c.id);
    const { data } = await supabase
      .from("candidate_data")
      .select("*")
      .in("candidate_uuid", ids);

    const rows = req.body.candidates
      .map((c) => {
        const base = data.find((b) => b.candidate_uuid === c.id);
        return base ? calculatePayroll(base, c) : null;
      })
      .filter(Boolean);

    res.json({ rows });
  } catch (err) {
    console.error("PREVIEW ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= GSHEET WRITE ================= */
async function clearSheet() {
  await sheetsApi.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A12:AB2000`,
  });
}

async function writeToSheet(rows) {
  const values = rows.map((r) => [
    r.candidate_name,
    r.total_hours,
    r.reg_hours,
    r.ot_hours,
    r.holiday_hours,
    r.w2_rate,
    r.stipend_rate,
    r.ot_rate,
    r.holiday_rate,
    r.guaranteed,
    r.standard_w2_amount,
    r.ot_amount,
    r.holiday_amount,
    r.sign_bonus,
    r.overall_bonus,
    r.total_pay,
    r.standard_stipend_amount,
    r.total_payable,
    r.total_candidate_expense ?? "",
    r.client_standard_bill_rate,
    r.vms_charges,
    r.client_standard_amount,
    r.client_ot_bill_rate,
    r.client_holiday_bill_rate,
    r.client_ot_holiday_amount,
    r.total_amount_received_from_client,
    r.net_profit ?? "",
    r.total_candidate_expense ?? "",
  ]);

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A12`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/* ================= PUSH TO GSHEET ================= */
router.post("/push-to-gsheet", async (req, res) => {
  try {
    await clearSheet();
    await writeToSheet(req.body.rows);
    res.json({ success: true });
  } catch (err) {
    console.error("GSHEET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

async function updatePayrollPeriod(from_date, to_date) {
  if (!from_date || !to_date) return;

  const from = formatDateMMDDYYYY(from_date);
  const to = formatDateMMDDYYYY(to_date);

  const headerText = `Payroll Period - ${from} to ${to}`;

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!B1`, // change ONLY if your template uses another cell
    valueInputOption: "RAW",
    requestBody: {
      values: [[headerText]],
    },
  });
}

// Gross Total Update
function calculateGrossReportTotals(rows) {
  const sum = (key) => rows.reduce((t, r) => t + Number(r[key] || 0), 0);

  const totals = {
    total_bonus: round(sum("overall_bonus")),
    gusto_total_gross_pay: round(sum("total_pay")),
    gusto_total_reimbursement: round(sum("standard_stipend_amount")),
  };

  totals.total_earnings = round(
    totals.gusto_total_gross_pay + totals.gusto_total_reimbursement
  );

  return totals;
}

router.post("/download", async (req, res) => {
  try {
    const { rows, from_date, to_date } = req.body;

    const filename = `payroll_${from_date}_${to_date}.xlsx`;

    // 1️⃣ Clear sheet
    await sheetsApi.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A12:Z2000`,
    });

    // 2️⃣ Write data
    await writeToSheet(rows);

    // 3️⃣ Headers (no local file)
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    // 4️⃣ Stream Google Sheet → browser
    const exportStream = await driveApi.files.export(
      {
        fileId: SHEET_ID,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { responseType: "stream" }
    );

    await pipeline(exportStream.data, res);

    // 5️⃣ Clear sheet after download
    await sheetsApi.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A12:Z2000`,
    });
  } catch (err) {
    console.error("DOWNLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/save", async (req, res, next) => {
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

    if (existingError) {
      console.error("PAYROLL RUN CHECK ERROR:", existingError);
      return res.status(500).json({
        error: "Failed to check existing payroll run",
        details: existingError.message,
      });
    }

    req.existingPayrollRunId = existingRuns?.[0]?.id || null;

    return next();
  } catch (err) {
    console.error("SAVE VALIDATION ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.post("/save", async (req, res) => {
  try {
    const { from_date, to_date, payroll_name, rows } = req.body;

    /* 1️⃣ Create payroll run */
    let payrollRunId = req.existingPayrollRunId || null;
    let updated = false;

    if (payrollRunId) {
      const { error: runUpdateError } = await supabase
        .from("payroll_runs")
        .update({
          payroll_name,
          from_date,
          to_date,
        })
        .eq("id", payrollRunId);

      if (runUpdateError) {
        console.error("PAYROLL RUN UPDATE ERROR:", runUpdateError);
        return res.status(500).json({
          error: "Failed to update payroll run",
          details: runUpdateError.message,
        });
      }

      const { error: deleteItemsError } = await supabase
        .from("payroll_items")
        .delete()
        .eq("payroll_run_id", payrollRunId);

      if (deleteItemsError) {
        console.error("PAYROLL ITEMS DELETE ERROR:", deleteItemsError);
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
        .select()
        .single();

      if (runError || !run) {
        console.error("PAYROLL RUN INSERT ERROR:", runError);
        return res.status(500).json({
          error: "Failed to create payroll run",
          details: runError?.message,
        });
      }

      payrollRunId = run.id;
    }

    /* 2️⃣ Insert payroll items */
    const items = rows
      .filter(Boolean) // 🛡️ remove null rows
      .map((r) => ({
        ...r,
        payroll_run_id: payrollRunId,
      }));

    const { error: itemsError } = await supabase
      .from("payroll_items")
      .insert(items);

    if (itemsError) {
      console.error("PAYROLL ITEMS INSERT ERROR:", itemsError);
      return res.status(500).json({
        error: "Failed to save payroll items",
        details: itemsError.message,
      });
    }

    res.json({ payroll_run_id: payrollRunId, updated });
  } catch (err) {
    console.error("SAVE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= REPORTS ================= */
router.get("/reports/weekly-net-profit", async (req, res) => {
  try {
    let weekEnding = req.query?.week_ending ? String(req.query.week_ending) : "";

    if (weekEnding && !isIsoDate(weekEnding)) {
      return res
        .status(400)
        .json({ error: "week_ending must be in YYYY-MM-DD format" });
    }

    if (!weekEnding) {
      const { data: latestRun, error: latestError } = await supabase
        .from("payroll_runs")
        .select("to_date")
        .order("to_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        return res.status(500).json({ error: latestError.message });
      }
      if (!latestRun?.to_date) {
        return res.status(404).json({ error: "No payroll runs found" });
      }

      weekEnding = latestRun.to_date;
    }

    const { data: runs, error: runsError } = await supabase
      .from("payroll_runs")
      .select("id")
      .eq("to_date", weekEnding);

    if (runsError) {
      return res.status(500).json({ error: runsError.message });
    }
    if (!runs?.length) {
      return res
        .status(404)
        .json({ error: `No payroll runs found for week_ending ${weekEnding}` });
    }

    const runIds = runs.map((r) => r.id);
    const { data: items, error: itemsError } = await supabase
      .from("payroll_items")
      .select("candidate_uuid, candidate_name, net_profit")
      .in("payroll_run_id", runIds);

    if (itemsError) {
      return res.status(500).json({ error: itemsError.message });
    }

    const byCandidate = new Map();
    for (const item of items || []) {
      const key =
        item.candidate_uuid || `name:${String(item.candidate_name || "").trim()}`;
      const prev = byCandidate.get(key) || {
        candidate_uuid: item.candidate_uuid || null,
        candidate_name: item.candidate_name || "",
        net_profit: 0,
      };
      prev.net_profit += Number(item.net_profit || 0);
      byCandidate.set(key, prev);
    }

    const rows = Array.from(byCandidate.values())
      .map((r) => ({
        ...r,
        net_profit: round(r.net_profit) ?? 0,
      }))
      .sort((a, b) => a.candidate_name.localeCompare(b.candidate_name));

    const totalNetProfit = round(
      rows.reduce((sum, r) => sum + Number(r.net_profit || 0), 0)
    );

    return res.json({
      report: "weekly_net_profit",
      week_ending: weekEnding,
      candidate_count: rows.length,
      rows,
      total_net_profit: totalNetProfit ?? 0,
    });
  } catch (err) {
    console.error("WEEKLY NET PROFIT REPORT ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

async function buildNetProfitReportFromRunIds(runIds) {
  const { data: items, error: itemsError } = await supabase
    .from("payroll_items")
    .select("candidate_uuid, candidate_name, net_profit")
    .in("payroll_run_id", runIds);

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const byCandidate = new Map();
  for (const item of items || []) {
    const key =
      item.candidate_uuid || `name:${String(item.candidate_name || "").trim()}`;
    const prev = byCandidate.get(key) || {
      candidate_uuid: item.candidate_uuid || null,
      candidate_name: item.candidate_name || "",
      net_profit: 0,
    };
    prev.net_profit += Number(item.net_profit || 0);
    byCandidate.set(key, prev);
  }

  const rows = Array.from(byCandidate.values())
    .map((r) => ({
      ...r,
      net_profit: round(r.net_profit) ?? 0,
    }))
    .sort((a, b) => a.candidate_name.localeCompare(b.candidate_name));

  const totalNetProfit = round(
    rows.reduce((sum, r) => sum + Number(r.net_profit || 0), 0)
  );

  return {
    rows,
    candidate_count: rows.length,
    total_net_profit: totalNetProfit ?? 0,
  };
}

router.get("/reports/net-profit", async (req, res) => {
  try {
    const mode = String(req.query?.mode || "range").toLowerCase();
    let fromDate = "";
    let toDate = "";
    let periodLabel = "";

    if (mode === "monthly") {
      const month = Number(req.query?.month);
      const year = Number(req.query?.year);

      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "month must be 1-12" });
      }
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: "year must be between 2000 and 2100" });
      }

      const from = new Date(Date.UTC(year, month - 1, 1));
      const to = new Date(Date.UTC(year, month, 0));
      fromDate = `${from.getUTCFullYear()}-${pad2(from.getUTCMonth() + 1)}-${pad2(
        from.getUTCDate()
      )}`;
      toDate = `${to.getUTCFullYear()}-${pad2(to.getUTCMonth() + 1)}-${pad2(
        to.getUTCDate()
      )}`;
      periodLabel = `${year}-${pad2(month)}`;
    } else if (mode === "range") {
      fromDate = String(req.query?.from_date || "");
      toDate = String(req.query?.to_date || "");

      if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
        return res.status(400).json({
          error: "from_date and to_date are required in YYYY-MM-DD format",
        });
      }
      if (fromDate > toDate) {
        return res.status(400).json({ error: "from_date cannot be after to_date" });
      }
      periodLabel = `${fromDate} to ${toDate}`;
    } else {
      return res.status(400).json({ error: "mode must be either 'range' or 'monthly'" });
    }

    const { data: runs, error: runsError } = await supabase
      .from("payroll_runs")
      .select("id, from_date, to_date")
      .gte("to_date", fromDate)
      .lte("to_date", toDate)
      .order("to_date", { ascending: true });

    if (runsError) {
      return res.status(500).json({ error: runsError.message });
    }
    if (!runs?.length) {
      return res.status(404).json({
        error: `No payroll runs found for selected ${mode} period`,
      });
    }

    const runIds = runs.map((r) => r.id);
    const summary = await buildNetProfitReportFromRunIds(runIds);

    return res.json({
      report: mode === "monthly" ? "monthly_net_profit" : "period_net_profit",
      mode,
      from_date: fromDate,
      to_date: toDate,
      period_label: periodLabel,
      payroll_run_count: runs.length,
      ...summary,
    });
  } catch (err) {
    console.error("NET PROFIT REPORT ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
