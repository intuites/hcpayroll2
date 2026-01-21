// // import express from "express";
// // import { google } from "googleapis";
// // import fs from "fs";
// // import path from "path";
// // import { pipeline } from "stream/promises";
// // import { supabase } from "../server/supabaseClient.js";

// // const router = express.Router();

// // /* ================= CONFIG ================= */
// // const SHEET_ID = process.env.GSHEET_ID;
// // const SHEET_NAME = "Payroll";
// // const VMS_RATE = 0.06;

// // /* ================= SAFETY ================= */
// // if (!SHEET_ID) throw new Error("GSHEET_ID missing");

// // const KEY_PATH = path.join(process.cwd(), "google-service-account.json");
// // if (!fs.existsSync(KEY_PATH)) {
// //   throw new Error("google-service-account.json missing");
// // }

// // /* ================= GOOGLE AUTH ================= */
// // const auth = new google.auth.GoogleAuth({
// //   keyFile: KEY_PATH,
// //   scopes: [
// //     "https://www.googleapis.com/auth/spreadsheets",
// //     "https://www.googleapis.com/auth/drive"
// //   ]
// // });

// // const sheetsApi = google.sheets({ version: "v4", auth });
// // const driveApi = google.drive({ version: "v3", auth });

// // /* ================= HELPERS ================= */
// // const round = n =>
// //   n === null || n === undefined ? null : Number(Number(n).toFixed(2));

// // /* ================= CALCULATION CORE ================= */
// // function calculatePayroll(c, h) {
// //   const reg = h.reg_hours ?? 0;
// //   const ot = h.ot_hours ?? 0;
// //   const hol = h.holiday_hours ?? 0;
// //   const total_candidate_expense =
// //     Object.prototype.hasOwnProperty.call(h, "total_candidate_expense")
// //       ? h.total_candidate_expense
// //       : null;
// //   const total_hours = reg + ot + hol;

// //   /* ---------- Rates ---------- */
// //   const w2 = h.w2_rate !== undefined ? h.w2_rate : c.w2_rate ?? null;
// //   const stipend = h.stipend_rate !== undefined ? h.stipend_rate : c.stipend_rate ?? null;
// //   const ot_rate = h.ot_rate !== undefined ? h.ot_rate : c.ot_rate ?? null;
// //   const hol_rate = h.holiday_rate !== undefined ? h.holiday_rate : c.holiday_rate ?? null;
// //   const sign_bonus = h.sign_bonus !== undefined ? h.sign_bonus : c.sign_bonus ?? null;

// //   /* ---------- Candidate Pay ---------- */
// //   const standard_w2_amount = w2 !== null ? round(reg * w2) : null;
// //   const ot_amount = ot_rate !== null ? round(ot * ot_rate) : null;
// //   const holiday_amount = hol_rate !== null ? round(hol * hol_rate) : null;

// //   const overall_bonus =
// //     sign_bonus === null && ot_amount === null && holiday_amount === null
// //       ? null
// //       : round((sign_bonus ?? 0) + (ot_amount ?? 0) + (holiday_amount ?? 0));

// //   const guaranteed = w2 !== null ? round(w2 * ot) : null;
// //   const standard_stipend_amount = stipend !== null ? round(reg * stipend) : null;

// //   /* ===== TOTAL PAYABLE (CRITICAL FIX) ===== */
// //   const total_payable =
// //     standard_w2_amount === null &&
// //     standard_stipend_amount === null &&
// //     overall_bonus === null
// //       ? null
// //       : round(
// //           (standard_w2_amount ?? 0) +
// //           (standard_stipend_amount ?? 0) +
// //           (overall_bonus ?? 0)
// //         );

// //   /* ---------- Client Billing ---------- */
// //   const client_std_rate =
// //     h.client_standard_bill_rate !== undefined
// //       ? h.client_standard_bill_rate
// //       : c.client_standard_bill_rate ?? null;

// //   const client_ot_rate =
// //     h.client_ot_bill_rate !== undefined
// //       ? h.client_ot_bill_rate
// //       : c.client_ot_bill_rate ?? null;

// //   const client_hol_rate =
// //     h.client_holiday_bill_rate !== undefined
// //       ? h.client_holiday_bill_rate
// //       : c.client_holiday_bill_rate ?? null;

// //   const client_standard_amount =
// //     client_std_rate !== null ? round(total_hours * client_std_rate) : null;

// //   const client_ot_holiday_amount =
// //     client_ot_rate === null && client_hol_rate === null
// //       ? null
// //       : round(
// //           ((ot * (client_ot_rate ?? 0)) +
// //            (hol * (client_hol_rate ?? 0))) *
// //           (1 - VMS_RATE)
// //         );

// //   const total_received =
// //     client_standard_amount === null && client_ot_holiday_amount === null
// //       ? null
// //       : round((client_standard_amount ?? 0) + (client_ot_holiday_amount ?? 0));

// //   const net_profit =
// //     total_received === null || total_candidate_expense === null
// //       ? null
// //       : round(total_received - total_candidate_expense);

// //   return {
// //     reg,
// //     ot,
// //     hol,
// //     total_hours,

// //     w2,
// //     stipend,
// //     ot_rate,
// //     hol_rate,

// //     guaranteed,
// //     standard_w2_amount,
// //     ot_amount,
// //     holiday_amount,

// //     sign_bonus,
// //     overall_bonus,

// //     standard_stipend_amount,
// //     total_payable,
// //     total_candidate_expense,

// //     client_std_rate,
// //     client_ot_rate,
// //     client_hol_rate,

// //     client_standard_amount,
// //     client_ot_holiday_amount,
// //     total_received,
// //     net_profit
// //   };
// // }

// // /* ================= PREVIEW ================= */
// // router.post("/preview", async (req, res) => {
// //   try {
// //     const { candidates } = req.body;
// //     if (!Array.isArray(candidates))
// //       return res.status(400).json({ error: "Invalid payload" });

// //     const rows = [];

// //     for (const h of candidates) {
// //       const { data: c } = await supabase
// //         .from("candidate_data")
// //         .select("*")
// //         .eq("id", h.id)
// //         .single();

// //       if (!c) continue;
// //       const calc = calculatePayroll(c, h);

// // rows.push({
// //   candidate_id: c.id,
// //   candidate_name: c.candidate_name,

// //   reg_hours: calc.reg,
// //   ot_hours: calc.ot,
// //   holiday_hours: calc.hol,
// //   total_hours: calc.total_hours,

// //   w2_rate: calc.w2,
// //   stipend_rate: calc.stipend,
// //   ot_rate: calc.ot_rate,
// //   holiday_rate: calc.hol_rate,

// //   guaranteed: calc.guaranteed,

// //   standard_w2_amount: calc.standard_w2_amount,
// //   ot_amount: calc.ot_amount,
// //   holiday_amount: calc.holiday_amount,

// //   sign_bonus: calc.sign_bonus,
// //   overall_bonus: calc.overall_bonus,

// //   standard_stipend_amount: calc.standard_stipend_amount,
// //   total_payable: calc.total_payable,
// //   total_candidate_expense: calc.total_candidate_expense,

// //   client_standard_bill_rate: calc.client_std_rate,
// //   vms_charges: VMS_RATE,
// //   client_standard_amount: calc.client_standard_amount,

// //   client_ot_bill_rate: calc.client_ot_rate,
// //   client_holiday_bill_rate: calc.client_hol_rate,
// //   client_ot_holiday_amount: calc.client_ot_holiday_amount,

// //   total_amount_received_from_client: calc.total_received,
// //   net_profit: calc.net_profit
// // });

// //     }

// //     res.json({ rows });
// //   } catch (err) {
// //     console.error("PREVIEW ERROR:", err);
// //     res.status(500).json({ error: err.message });
// //   }
// // });

// // /* ================= SHEET HELPERS ================= */
// // async function clearPayrollSheet() {
// //   await sheetsApi.spreadsheets.values.clear({
// //     spreadsheetId: SHEET_ID,
// //     range: `${SHEET_NAME}!A12:Z1000`
// //   });
// // }

// // async function writePayrollToSheet(rows) {
// //   const values = rows.map(r => {
// //     const gusto_pay =
// //       r.standard_w2_amount !== null || r.overall_bonus !== null
// //         ? (r.standard_w2_amount ?? 0) + (r.overall_bonus ?? 0)
// //         : null;

// //     return [
// //       // Candidate info
// //       r.candidate_name,
// //       r.total_hours,
// //       r.reg_hours,
// //       r.ot_hours,
// //       r.holiday_hours,

// //       // Rates
// //       r.w2_rate,
// //       r.stipend_rate,
// //       r.ot_rate,
// //       r.holiday_rate,

// //       // Guaranteed
// //       r.guaranteed,

// //       // W2 + Bonus
// //       r.standard_w2_amount,
// //       r.ot_amount,
// //       r.holiday_amount,
// //       r.sign_bonus,
// //       r.overall_bonus,
// //       gusto_pay,

// //       // Stipend + totals
// //       r.standard_stipend_amount,
// //       r.total_payable,
// //       r.total_candidate_expense,

// //       // Client billing
// //       r.client_standard_bill_rate,
// //       r.vms_charges,
// //       r.client_standard_amount,
// //       r.client_ot_bill_rate,
// //       r.client_holiday_bill_rate,
// //       r.client_ot_holiday_amount,
// //       r.total_amount_received_from_client,

// //       // Profit
// //       r.net_profit
// //     ];
// //   });

// //   await sheetsApi.spreadsheets.values.update({
// //     spreadsheetId: SHEET_ID,
// //     range: `${SHEET_NAME}!A12`,
// //     valueInputOption: "USER_ENTERED",
// //     requestBody: { values }
// //   });
// // }

// // /* ================= DOWNLOAD XLSX ================= */
// // router.post("/download", async (req, res) => {
// //   try {
// //     const { rows } = req.body;
// //     if (!Array.isArray(rows))
// //       return res.status(400).json({ error: "Rows missing" });

// //     await clearPayrollSheet();
// //     await writePayrollToSheet(rows);

// //     res.setHeader(
// //       "Content-Type",
// //       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
// //     );
// //     res.setHeader(
// //       "Content-Disposition",
// //       "attachment; filename=payroll.xlsx"
// //     );

// //     const exportStream = await driveApi.files.export(
// //       {
// //         fileId: SHEET_ID,
// //         mimeType:
// //           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
// //       },
// //       { responseType: "stream" }
// //     );

// //     await pipeline(exportStream.data, res);
// //     await clearPayrollSheet();
// //   } catch (err) {
// //     console.error("DOWNLOAD ERROR:", err);
// //     if (!res.headersSent) {
// //       res.status(500).json({ error: err.message });
// //     }
// //   }
// // });

// // /* ================= SAVE (FINALIZE PAYROLL) ================= */
// // router.post("/save", async (req, res) => {
// //   res.json({ message: "SAVE ROUTE REACHED (GET)" });
// //   try {
// //     const { from_date, to_date, payroll_name, rows } = req.body;

// //     if (!Array.isArray(rows) || rows.length === 0) {
// //       return res.status(400).json({ error: "Rows missing" });
// //     }

// //     /* ---- create payroll run ---- */
// //     const { data: run, error: runErr } = await supabase
// //       .from("payroll_runs")
// //       .insert({
// //         period_start: from_date,
// //         period_end: to_date,
// //         notes: payroll_name
// //       })
// //       .select()
// //       .single();

// //     if (runErr) throw runErr;

// //     /* ---- insert payroll items ---- */
// //     for (const r of rows) {
// //       const { error: itemErr } = await supabase
// //         .from("payroll_items")
// //         .insert({
// //           payroll_run_id: run.id,
// //           candidate_id: r.candidate_id,
// //           candidate_name: r.candidate_name,

// //           regular_hours: r.reg_hours,
// //           ot_hours: r.ot_hours,
// //           holiday_hours: r.holiday_hours,

// //           w2_rate: r.w2_rate,
// //           stipend_rate: r.stipend_rate,
// //           ot_rate: r.ot_rate,
// //           holiday_rate: r.holiday_rate,

// //           standard_w2_amount: r.standard_w2_amount,
// //           ot_amount: r.ot_amount,
// //           holiday_amount: r.holiday_amount,

// //           sign_bonus: r.sign_bonus,
// //           overall_bonus: r.overall_bonus,

// //           standard_stipend_amount: r.standard_stipend_amount,
// //           total_payable: r.total_payable,
// //           total_candidate_expense: r.total_candidate_expense,

// //           client_standard_bill_rate: r.client_standard_bill_rate,
// //           client_standard_amount: r.client_standard_amount,

// //           client_ot_bill_rate: r.client_ot_bill_rate,
// //           client_ot_holiday_amount: r.client_ot_holiday_amount,

// //           total_amount_received_from_client:
// //             r.total_amount_received_from_client,

// //           net_profit: r.net_profit
// //         });

// //       if (itemErr){
// //         console.error("SUPABASE INSERT ERROR:", itemErr);
// //         throw itemErr;
// //       }
// //     }

// //     res.json({ payroll_run_id: run.id });
// //   } catch (err) {
// //     console.error("SAVE ERROR:", err);
// //     res.status(500).json({ error: err.message });
// //   }
// // });

// // export default router;

// import express from "express";
// import { supabase } from "../server/supabaseClient.js";

// const router = express.Router();
// const VMS_RATE = 0.06;

// /* ================= UTIL ================= */
// function n(v) {
//   const x = Number(v);
//   return Number.isNaN(x) ? 0 : x;
// }

// function round(v) {
//   return Math.round((n(v) + Number.EPSILON) * 100) / 100;
// }

// /* ================= CORE PAYROLL LOGIC ================= */
// function calculatePayroll(base, input) {
//   /* HOURS */
//   const reg = n(input.reg_hours ?? base.reg_hours);
//   const ot = n(input.ot_hours ?? base.ot_hours);
//   const hol = n(input.holiday_hours ?? base.holiday_hours);

//   const total_hours = reg + ot + hol;

//   /* RATES */
//   const w2 = n(input.w2_rate ?? base.w2_rate);
//   const stipend = n(input.stipend_rate ?? base.stipend_rate);
//   const ot_rate = n(input.ot_rate ?? base.ot_rate);
//   const holiday_rate = n(input.holiday_rate ?? base.holiday_rate);
//   const sign_bonus = n(input.sign_bonus ?? base.sign_bonus);

//   /* BASE AMOUNTS (OLD LOGIC PRESERVED) */
//   let standard_w2_amount = reg * w2;
//   let ot_amount = ot * ot_rate;
//   let holiday_amount = hol * holiday_rate;
//   let standard_stipend_amount = reg * stipend;

//   /* ================= NEW MISSED PAYMENT LOGIC ================= */
//   const missed_amt = n(input.missed_payment_amount);
//   const missed_type = input.missed_payment_type;

//   if (missed_amt > 0 && missed_type) {
//     switch (missed_type) {
//       case "regular":
//         standard_w2_amount += missed_amt;
//         break;
//       case "ot":
//         ot_amount += missed_amt;
//         break;
//       case "stipend":
//         standard_stipend_amount += missed_amt;
//         break;
//       case "holiday":
//         holiday_amount += missed_amt;
//         break;
//     }
//   }

//   /* GUARANTEED (OLD FORMULA) */
//   const guaranteed = w2 * ot;

//   /* OVERALL BONUS (OLD LOGIC) */
//   const overall_bonus =
//     sign_bonus + ot_amount + holiday_amount;

//   /* TOTAL PAYABLE */
//   const total_payable =
//     standard_w2_amount +
//     standard_stipend_amount +
//     overall_bonus;

//   /* ================= CLIENT BILLING ================= */
//   const client_std_rate =
//     n(input.client_standard_bill_rate ?? base.client_standard_bill_rate);

//   const client_ot_rate =
//     n(input.client_ot_bill_rate ?? base.client_ot_bill_rate);

//   const client_holiday_rate =
//     n(input.client_holiday_bill_rate ?? base.client_holiday_bill_rate);

//   const client_standard_amount =
//     reg * client_std_rate;

//   const client_ot_holiday_amount =
//     (ot + hol) *
//     (
//       (client_ot_rate + client_holiday_rate) -
//       VMS_RATE * (client_ot_rate + client_holiday_rate)
//     );

//   const vms_charges =
//     client_standard_amount * VMS_RATE;

//   const total_amount_received_from_client =
//     client_standard_amount +
//     client_ot_holiday_amount -
//     vms_charges;

//   /* MANUAL OVERRIDE SUPPORT */
//   const total_candidate_expense =
//   input.total_candidate_expense != null
//     ? n(input.total_candidate_expense)
//     : null;

// const net_profit =
//   total_candidate_expense != null
//     ? round(
//         total_amount_received_from_client -
//         total_candidate_expense
//       )
//     : null;
//   /* ================= FINAL PAYLOAD ================= */

//   return {
//   /* 🔑 IDENTITY (UUID ONLY) */
//   candidate_uuid: base.candidate_uuid,
//   candidate_name: base.candidate_name,

//   /* HOURS */
//   reg_hours: reg,
//   ot_hours: ot,
//   holiday_hours: hol,
//   total_hours: round(total_hours),

//   /* RATES */
//   w2_rate: w2,
//   stipend_rate: stipend,
//   ot_rate,
//   holiday_rate,

//   /* GUARANTEED */
//   guaranteed: round(guaranteed),

//   /* PAY AMOUNTS */
//   standard_w2_amount: round(standard_w2_amount),
//   ot_amount: round(ot_amount),
//   holiday_amount: round(holiday_amount),
//   standard_stipend_amount: round(standard_stipend_amount),

//   /* BONUSES */
//   sign_bonus: round(sign_bonus),
//   overall_bonus: round(overall_bonus),

//   /* TOTALS */
//   total_payable: round(total_payable),
//   total_candidate_expense:
//   total_candidate_expense != null
//     ? round(total_candidate_expense)
//     : null,

// net_profit:
//   net_profit != null
//     ? round(net_profit)
//     : null,

//   /* CLIENT BILLING */
//   client_standard_bill_rate: client_std_rate,
//   client_ot_bill_rate: client_ot_rate,
//   client_holiday_bill_rate: client_holiday_rate,

//   client_standard_amount: round(client_standard_amount),
//   client_ot_holiday_amount: round(client_ot_holiday_amount),
//   vms_charges: round(vms_charges),

//   total_amount_received_from_client:
//     round(total_amount_received_from_client),

//   /* MISSED PAYMENT */
//   missed_payment_amount: missed_amt || null,
//   missed_payment_type: missed_type || null
// };

// }
// router.post("/preview", async (req, res) => {
//   try {
//     const { candidates } = req.body;

//     // IDs sent from frontend = UUIDs
//     const ids = candidates.map(c => c.id);

//     // 🔑 FILTER BY candidate_uuid (NOT id)
//     const { data: baseCandidates, error } = await supabase
//       .from("candidate_data")
//       .select("*")
//       .in("candidate_uuid", ids);

//     if (error) throw error;
//     const rows = candidates.map(input => {
//   const base = baseCandidates.find(
//     b => b.candidate_uuid === input.id
//   );

//   if (!base) return null; // ONLY VALID REJECTION

//   return calculatePayroll(base, input);
// }).filter(r => r !== null);

//     res.json({ rows });
//   } catch (err) {
//     console.error("PREVIEW ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// /* ================= SAVE ================= */
// router.post("/save", async (req, res) => {
//   try {
//     const { from_date, to_date, payroll_name, rows } = req.body;
//     if (!from_date || !to_date || !Array.isArray(rows))
//       return res.status(400).json({ error: "Invalid payload" });

//     const { data: run, error: runErr } = await supabase
//       .from("payroll_runs")
//       .insert({ payroll_name, from_date, to_date })
//       .select()
//       .single();

//     if (runErr) throw runErr;

//     const items = rows.map(r => ({
//       payroll_run_id: run.id,

//       candidate_uuid: r.candidate_uuid,
//       candidate_name: r.candidate_name,

//       reg_hours: r.reg_hours,
//       ot_hours: r.ot_hours,
//       holiday_hours: r.holiday_hours,
//       total_hours: r.total_hours,

//       w2_rate: r.w2_rate,
//       stipend_rate: r.stipend_rate,
//       ot_rate: r.ot_rate,
//       holiday_rate: r.holiday_rate,

//       guaranteed: r.guaranteed,

//       standard_w2_amount: r.standard_w2_amount,
//       ot_amount: r.ot_amount,
//       holiday_amount: r.holiday_amount,
//       standard_stipend_amount: r.standard_stipend_amount,

//       sign_bonus: r.sign_bonus,
//       overall_bonus: r.overall_bonus,
//       total_payable: r.total_payable,

//       client_standard_bill_rate: r.client_standard_bill_rate,
//       client_ot_bill_rate: r.client_ot_bill_rate,
//       client_holiday_bill_rate: r.client_holiday_bill_rate,

//       client_standard_amount: r.client_standard_amount,
//       client_ot_holiday_amount: r.client_ot_holiday_amount,
//       vms_charges: r.vms_charges,

//       total_amount_received_from_client:
//         r.total_amount_received_from_client,

//       total_candidate_expense: r.total_candidate_expense,
//       net_profit: r.net_profit,

//       missed_payment_amount: r.missed_payment_amount,
//       missed_payment_type: r.missed_payment_type
//     }));

//     const { error: itemErr } = await supabase
//       .from("payroll_items")
//       .insert(items);

//     if (itemErr) throw itemErr;

//     res.json({ payroll_run_id: run.id });
//   } catch (err) {
//     console.error("SAVE ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// export default router;

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
const VMS_RATE = 0.06;

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

/* ================= CORE PAYROLL ================= */
/* ================= CORE PAYROLL ================= */
function calculatePayroll(base, input) {
  const vms_charges = VMS_RATE;
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
  const client_standard_amount = reg * client_std_rate * (1 - 0.06);
  const client_ot_holiday_amount =
    ot * (client_ot_rate - vms_charges * client_ot_rate) +
    hol * (client_hol_rate - vms_charges * client_hol_rate);

  //const vms_charges = 0.06;
  const total_received = client_standard_amount + client_ot_holiday_amount;
  let total_candidate_expense = null;

  if (
    input.total_candidate_expense !== undefined &&
    input.total_candidate_expense !== null &&
    input.total_candidate_expense !== ""
  ) {
    total_candidate_expense = n(input.total_candidate_expense);
  }

  const net_profit =
    total_candidate_expense !== null
      ? round(total_received - total_candidate_expense)
      : null;
  // function calculatePayroll(base, input) {
  //   const reg = n(input.reg_hours ?? base.reg_hours);
  //   const ot = n(input.ot_hours ?? base.ot_hours);
  //   const hol = n(input.holiday_hours ?? base.holiday_hours);

  //   const w2 = n(input.w2_rate ?? base.w2_rate);
  //   const stipend = n(input.stipend_rate ?? base.stipend_rate);
  //   const ot_rate = n(input.ot_rate ?? base.ot_rate);
  //   const holiday_rate = n(input.holiday_rate ?? base.holiday_rate);
  //   const sign_bonus = n(input.sign_bonus ?? base.sign_bonus);

  //   let standard_w2_amount = reg * w2;
  //   let ot_amount = ot * ot_rate;
  //   let holiday_amount = hol * holiday_rate;
  //   let standard_stipend_amount = reg * stipend;

  //   /* MISSED PAYMENT */
  //   const missed_amt = n(input.missed_payment_amount);
  //   const missed_type = input.missed_payment_type;
  //   if (missed_amt > 0 && missed_type) {
  //     if (missed_type === "regular") standard_w2_amount += missed_amt;
  //     if (missed_type === "ot") ot_amount += missed_amt;
  //     if (missed_type === "holiday") holiday_amount += missed_amt;
  //     if (missed_type === "stipend") standard_stipend_amount += missed_amt;
  //   }

  //   const guaranteed = w2 * ot;
  //   const overall_bonus = sign_bonus + ot_amount + holiday_amount;
  //   const total_pay = standard_w2_amount + overall_bonus;

  //   /* 🔒 TOTAL PAYABLE (LOCKED FORMULA) */
  //   const total_payable =
  //     standard_w2_amount + standard_stipend_amount + overall_bonus;

  //   /* CLIENT */
  //   const client_std_rate = n(
  //     input.client_standard_bill_rate ?? base.client_standard_bill_rate
  //   );
  //   const client_ot_rate = n(
  //     input.client_ot_bill_rate ?? base.client_ot_bill_rate
  //   );
  //   const client_hol_rate = n(
  //     input.client_holiday_bill_rate ?? base.client_holiday_bill_rate
  //   );

  //   // const client_standard_amount = (reg * client_std_rate) / 1.06;
  //   const client_standard_amount = reg * client_std_rate * (1 - 0.06);
  //   const client_ot_holiday_amount =
  //     (ot + hol) *
  //     (client_ot_rate +
  //       client_hol_rate -
  //       VMS_RATE * (client_ot_rate + client_hol_rate));

  //   const vms_charges = 0.06;
  //   const total_received =
  //     client_standard_amount + client_ot_holiday_amount - vms_charges;

  //   // const total_candidate_expense =
  //   //   input.total_candidate_expense !== undefined
  //   //     ? n(input.total_candidate_expense)
  //   //     : null;

  //   let total_candidate_expense = null;

  //   if (
  //     input.total_candidate_expense !== undefined &&
  //     input.total_candidate_expense !== null &&
  //     input.total_candidate_expense !== ""
  //   ) {
  //     total_candidate_expense = n(input.total_candidate_expense);
  //   }

  //   const net_profit =
  //     total_candidate_expense !== null
  //       ? round(total_received - total_candidate_expense)
  //       : null;

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

    total_candidate_expense:
      total_candidate_expense !== null ? round(total_candidate_expense) : null,

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

/* ================= DOWNLOAD XLSX ================= */
// router.post("/download", async (req, res) => {
//   try {
//     const { rows, from_date, to_date } = req.body;

//     if (!rows || !rows.length) {
//       return res.status(400).json({ error: "No rows to download" });
//     }

//     const safeFrom = from_date || "from";
//     const safeTo = to_date || "to";

//     const filename = `payroll_${safeFrom}_${safeTo}.xlsx`;

//     /* 1️⃣ Clear sheet */
//     await sheetsApi.spreadsheets.values.clear({
//       spreadsheetId: SHEET_ID,
//       range: `${SHEET_NAME}!A12:Z2000`
//     });

//     /* 2️⃣ Write rows */
//     await writeToSheet(rows);

//     /* 3️⃣ Set download headers */
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename="${filename}"`
//     );
//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );

//     /* 4️⃣ Export sheet */
//     const exportStream = await driveApi.files.export(
//       {
//         fileId: SHEET_ID,
//         mimeType:
//           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//       },
//       { responseType: "stream" }
//     );

//     await pipeline(exportStream.data, res);

//     /* 5️⃣ Clear sheet AFTER download */
//     await sheetsApi.spreadsheets.values.clear({
//       spreadsheetId: SHEET_ID,
//       range: `${SHEET_NAME}!A12:Z2000`
//     });

//   } catch (err) {
//     console.error("DOWNLOAD ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

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

/* ================= SAVE ================= */
// router.post("/save", async (req, res) => {
//   try {
//     const { from_date, to_date, payroll_name, rows } = req.body;

//     const { data: run } = await supabase
//       .from("payroll_runs")
//       .insert({
//         payroll_name,
//         from_date,
//         to_date,
//       })
//       .select()
//       .single();

//     await supabase.from("payroll_items").insert(
//       rows.map((r) => ({
//         ...r,
//         payroll_run_id: run.id,
//       }))
//     );

//     res.json({ payroll_run_id: run.id });
//   } catch (err) {
//     console.error("SAVE ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

router.post("/save", async (req, res) => {
  try {
    const { from_date, to_date, payroll_name, rows } = req.body;

    /* 1️⃣ Create payroll run */
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

    /* 2️⃣ Insert payroll items */
    const items = rows
      .filter(Boolean) // 🛡️ remove null rows
      .map((r) => ({
        ...r,
        payroll_run_id: run.id,
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

    res.json({ payroll_run_id: run.id });
  } catch (err) {
    console.error("SAVE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

// import express from "express";
// import { google } from "googleapis";
// import fs from "fs";
// import path from "path";
// import { pipeline } from "stream/promises";
// import { supabase } from "../server/supabaseClient.js";

// const router = express.Router();

// /* ================= CONFIG ================= */
// const SHEET_ID = process.env.GSHEET_ID;
// const SHEET_NAME = "Payroll";
// const VMS_RATE = 0.06;

// if (!SHEET_ID) throw new Error("GSHEET_ID missing");

// const KEY_PATH = path.join(process.cwd(), "google-service-account.json");
// if (!fs.existsSync(KEY_PATH)) {
//   throw new Error("google-service-account.json missing");
// }

// /* ================= GOOGLE AUTH ================= */
// const auth = new google.auth.GoogleAuth({
//   keyFile: KEY_PATH,
//   scopes: [
//     "https://www.googleapis.com/auth/spreadsheets",
//     "https://www.googleapis.com/auth/drive"
//   ]
// });

// const sheetsApi = google.sheets({ version: "v4", auth });
// const driveApi = google.drive({ version: "v3", auth });

// /* ================= HELPERS ================= */
// const n = v => {
//   const x = Number(v);
//   return Number.isNaN(x) ? 0 : x;
// };

// const round = v =>
//   v === null || v === undefined
//     ? null
//     : Math.round((Number(v) + Number.EPSILON) * 100) / 100;

// /* ================= CORE PAYROLL ================= */
// function calculatePayroll(base, input) {
//   /* HOURS */
//   const reg = n(input.reg_hours ?? base.reg_hours);
//   const ot = n(input.ot_hours ?? base.ot_hours);
//   const hol = n(input.holiday_hours ?? base.holiday_hours);

//   /* RATES */
//   const w2 = n(input.w2_rate ?? base.w2_rate);
//   const stipend = n(input.stipend_rate ?? base.stipend_rate);
//   const ot_rate = n(input.ot_rate ?? base.ot_rate);
//   const holiday_rate = n(input.holiday_rate ?? base.holiday_rate);
//   const sign_bonus = n(input.sign_bonus ?? base.sign_bonus);

//   /* AMOUNTS */
//   let standard_w2_amount = reg * w2;
//   let ot_amount = ot * ot_rate;
//   let holiday_amount = hol * holiday_rate;
//   let standard_stipend_amount = reg * stipend;

//   /* MISSED PAYMENTS */
//   const missed_amt = n(input.missed_payment_amount);
//   const missed_type = input.missed_payment_type;

//   if (missed_amt > 0 && missed_type) {
//     if (missed_type === "regular") standard_w2_amount += missed_amt;
//     if (missed_type === "ot") ot_amount += missed_amt;
//     if (missed_type === "holiday") holiday_amount += missed_amt;
//     if (missed_type === "stipend") standard_stipend_amount += missed_amt;
//   }

//   /* GUSTO */
//   const guaranteed = w2 * ot;
//   const overall_bonus = sign_bonus + ot_amount + holiday_amount;
//   const total_pay = standard_w2_amount + overall_bonus;

//   /* TOTAL PAYABLE (LOCKED) */
//   const total_payable =
//     standard_w2_amount +
//     overall_bonus +
//     standard_stipend_amount;

//   /* CLIENT BILLING */
//   const client_std_rate = n(input.client_standard_bill_rate ?? base.client_standard_bill_rate);
//   const client_ot_rate = n(input.client_ot_bill_rate ?? base.client_ot_bill_rate);
//   const client_hol_rate = n(input.client_holiday_bill_rate ?? base.client_holiday_bill_rate);

//   const client_standard_amount = reg * client_std_rate;

//   const gross_ot_holiday =
//     (ot + hol) * (client_ot_rate + client_hol_rate);

//   const vms_charges = gross_ot_holiday * VMS_RATE;

//   const client_ot_holiday_amount =
//     gross_ot_holiday - vms_charges;

//   const total_received =
//     client_standard_amount + client_ot_holiday_amount;

//   /* PROFIT */
//   const total_candidate_expense =
//     input.total_candidate_expense !== undefined
//       ? n(input.total_candidate_expense)
//       : null;

//   const net_profit =
//     total_candidate_expense !== null
//       ? round(total_received - total_candidate_expense)
//       : null;

//   /* FINAL ROW */
//   return {
//     candidate_uuid: base.candidate_uuid,
//     candidate_name: base.candidate_name,

//     total_hours: reg + ot + hol,
//     reg_hours: reg,
//     ot_hours: ot,
//     holiday_hours: hol,

//     w2_rate: w2,
//     stipend_rate: stipend,
//     ot_rate,
//     holiday_rate,

//     guaranteed: round(guaranteed),

//     standard_w2_amount: round(standard_w2_amount),
//     ot_amount: round(ot_amount),
//     holiday_amount: round(holiday_amount),

//     sign_bonus: round(sign_bonus),
//     overall_bonus: round(overall_bonus),
//     total_pay: round(total_pay),

//     standard_stipend_amount: round(standard_stipend_amount),
//     total_payable: round(total_payable),

//     total_candidate_expense:
//       total_candidate_expense !== null
//         ? round(total_candidate_expense)
//         : null,

//     client_standard_bill_rate: client_std_rate,
//     vms_charges: round(vms_charges),
//     client_standard_amount: round(client_standard_amount),

//     client_ot_bill_rate: client_ot_rate,
//     client_holiday_bill_rate: client_hol_rate,
//     client_ot_holiday_amount: round(client_ot_holiday_amount),

//     total_amount_received_from_client: round(total_received),
//     net_profit,

//     missed_payment_amount: missed_amt || null,
//     missed_payment_type: missed_type || null
//   };
// }

// /* ================= PREVIEW ================= */
// router.post("/preview", async (req, res) => {
//   try {
//     const ids = req.body.candidates.map(c => c.id);

//     const { data } = await supabase
//       .from("candidate_data")
//       .select("*")
//       .in("candidate_uuid", ids);

//     const rows = req.body.candidates
//       .map(c => {
//         const base = data.find(b => b.candidate_uuid === c.id);
//         return base ? calculatePayroll(base, c) : null;
//       })
//       .filter(Boolean);

//     res.json({ rows });
//   } catch (err) {
//     console.error("PREVIEW ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// /* ================= GSHEET ================= */
// async function clearSheet() {
//   await sheetsApi.spreadsheets.values.clear({
//     spreadsheetId: SHEET_ID,
//     range: `${SHEET_NAME}!A12:Z2000`
//   });
// }

// async function writeToSheet(rows) {
//   const values = rows.map(r => [
//     r.candidate_name,
//     r.total_hours,
//     r.reg_hours,
//     r.ot_hours,
//     r.holiday_hours,
//     r.w2_rate,
//     r.stipend_rate,
//     r.ot_rate,
//     r.holiday_rate,
//     r.guaranteed,
//     r.standard_w2_amount,
//     r.ot_amount,
//     r.holiday_amount,
//     r.sign_bonus,
//     r.overall_bonus,
//     r.total_pay,
//     r.standard_stipend_amount,
//     r.total_payable,
//     r.total_candidate_expense ?? "",
//     r.client_standard_bill_rate,
//     r.vms_charges,
//     r.client_standard_amount,
//     r.client_ot_bill_rate,
//     r.client_holiday_bill_rate,
//     r.client_ot_holiday_amount,
//     r.total_amount_received_from_client,
//     r.net_profit ?? ""
//   ]);

//   await sheetsApi.spreadsheets.values.update({
//     spreadsheetId: SHEET_ID,
//     range: `${SHEET_NAME}!A12`,
//     valueInputOption: "USER_ENTERED",
//     requestBody: { values }
//   });
// }

// /* ================= PUSH ================= */
// router.post("/push-to-gsheet", async (req, res) => {
//   try {
//     await clearSheet();
//     await writeToSheet(req.body.rows);
//     res.json({ success: true });
//   } catch (err) {
//     console.error("GSHEET ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// /* ================= DOWNLOAD ================= */
// router.post("/download", async (req, res) => {
//   try {
//     await clearSheet();
//     await writeToSheet(req.body.rows);

//     res.setHeader(
//       "Content-Disposition",
//       "attachment; filename=payroll.xlsx"
//     );
//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );

//     const exportStream = await driveApi.files.export(
//       {
//         fileId: SHEET_ID,
//         mimeType:
//           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//       },
//       { responseType: "stream" }
//     );

//     await pipeline(exportStream.data, res);
//     await clearSheet();
//   } catch (err) {
//     console.error("DOWNLOAD ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// /* ================= SAVE ================= */
// router.post("/save", async (req, res) => {
//   try {
//     const { from_date, to_date, payroll_name, rows } = req.body;

//     const { data: run } = await supabase
//       .from("payroll_runs")
//       .insert({ payroll_name, from_date, to_date })
//       .select()
//       .single();

//     await supabase.from("payroll_items").insert(
//       rows.map(r => ({
//         ...r,
//         payroll_run_id: run.id
//       }))
//     );

//     res.json({ payroll_run_id: run.id });
//   } catch (err) {
//     console.error("SAVE ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// export default router;
