// // // import express from "express";
// // // import crypto from "crypto";
// // // import { google } from "googleapis";
// // // import fs from "fs";
// // // import path from "path";
// // // import { pipeline } from "stream/promises";
// // // import { supabase } from "../server/supabaseClient.js";

// // // const router = express.Router();

// // // /* ================= CONFIG ================= */
// // // const SHEET_ID = process.env.GSHEET_ID;
// // // const SHEET_NAME = "'Payroll'";
// // // const START_ROW = 12;
// // // const OUTPUT_DIR = path.join(process.cwd(), "outputs");
// // // const VMS_RATE = 0.06;

// // // /* ================= SAFETY ================= */
// // // if (!SHEET_ID) throw new Error("GSHEET_ID missing");

// // // const KEY_PATH = path.join(process.cwd(), "google-service-account.json");
// // // if (!fs.existsSync(KEY_PATH)) {
// // //   throw new Error("google-service-account.json missing");
// // // }

// // // /* ================= GOOGLE AUTH ================= */
// // // const auth = new google.auth.GoogleAuth({
// // //   keyFile: KEY_PATH,
// // //   scopes: [
// // //     "https://www.googleapis.com/auth/spreadsheets",
// // //     "https://www.googleapis.com/auth/drive"
// // //   ]
// // // });

// // // const sheetsApi = google.sheets({ version: "v4", auth });
// // // const driveApi = google.drive({ version: "v3", auth });

// // // /* ================= CALCULATION CORE ================= */
// // // function calculatePayroll(c, h) {
// // //   const reg = h.reg_hours || 0;
// // //   const ot = h.ot_hours || 0;
// // //   const hol = h.holiday_hours || 0;

// // //   const total_hours = reg + ot + hol;

// // //   const w2 = c.w2_rate || 0;
// // //   const stipend = c.stipend_rate || 0;
// // //   const ot_rate = c.ot_rate || 0;
// // //   const hol_rate = c.holiday_rate || 0;

// // //   const standard_w2_amount = reg * w2;
// // //   const ot_amount = ot * ot_rate;
// // //   const holiday_amount = hol * hol_rate;

// // //   const sign_bonus = c.sign_bonus || 0;
// // //   const overall_bonus = sign_bonus + ot_amount + holiday_amount;
// // //   const guaranteed = w2 * ot;

// // //   const standard_stipend_amount = reg * stipend;
// // //   const total_payable =
// // //     standard_w2_amount + standard_stipend_amount + overall_bonus;

// // //   const client_std_rate = c.client_standard_bill_rate || 0;
// // //   const client_ot_rate = c.client_ot_bill_rate || 0;
// // //   const client_hol_rate = c.client_holiday_bill_rate || 0;

// // //   const client_standard_amount =
// // //     reg * client_std_rate * (1 - VMS_RATE);

// // //   const client_ot_holiday_amount =
// // //     (ot * client_ot_rate + hol * client_hol_rate) *
// // //     (1 - VMS_RATE);

// // //   const total_received =
// // //     client_standard_amount + client_ot_holiday_amount;

// // //   const net_profit = total_received - total_payable;

// // //   return {
// // //     reg, ot, hol, total_hours,

// // //     w2, stipend, ot_rate, hol_rate,

// // //     guaranteed,

// // //     standard_w2_amount,
// // //     ot_amount,
// // //     holiday_amount,

// // //     sign_bonus,
// // //     overall_bonus,

// // //     standard_stipend_amount,
// // //     total_payable,

// // //     client_std_rate,
// // //     client_ot_rate,
// // //     client_hol_rate,

// // //     client_standard_amount,
// // //     client_ot_holiday_amount,

// // //     total_received,
// // //     net_profit
// // //   };
// // // }

// // // /* ================= PREVIEW ================= */
// // // router.post("/preview", async (req, res) => {
// // //   try {
// // //     const { candidates } = req.body;
// // //     if (!Array.isArray(candidates)) {
// // //       return res.status(400).json({ error: "Invalid payload" });
// // //     }

// // //     const rows = [];

// // //     for (const h of candidates) {
// // //       const { data: c } = await supabase
// // //         .from("candidate_data")
// // //         .select("*")
// // //         .eq("id", h.id)
// // //         .single();

// // //       if (!c) continue;

// // //       const calc = calculatePayroll(c, h);

// // //       rows.push({
// // //         candidate_id: c.id,
// // //         candidate_name: c.candidate_name,

// // //         reg_hours: calc.reg,
// // //         ot_hours: calc.ot,
// // //         holiday_hours: calc.hol,
// // //         total_hours: calc.total_hours,

// // //         w2_rate: calc.w2,
// // //         stipend_rate: calc.stipend,
// // //         ot_rate: calc.ot_rate,
// // //         holiday_rate: calc.hol_rate,

// // //         guaranteed: calc.guaranteed,

// // //         standard_w2_amount: calc.standard_w2_amount,
// // //         ot_amount: calc.ot_amount,
// // //         holiday_amount: calc.holiday_amount,

// // //         sign_bonus: calc.sign_bonus,
// // //         overall_bonus: calc.overall_bonus,

// // //         standard_stipend_amount: calc.standard_stipend_amount,
// // //         total_payable: calc.total_payable,

// // //         client_standard_bill_rate: calc.client_std_rate,
// // //         vms_charges: VMS_RATE,
// // //         client_standard_amount: calc.client_standard_amount,

// // //         client_ot_bill_rate: calc.client_ot_rate,
// // //         client_holiday_bill_rate: calc.client_hol_rate,
// // //         client_ot_holiday_amount: calc.client_ot_holiday_amount,

// // //         total_amount_received_from_client: calc.total_received,
// // //         net_profit: calc.net_profit,
// // //         total_candidate_expense: calc.total_payable
// // //       });
// // //     }

// // //     res.json({ rows });
// // //   } catch (err) {
// // //     console.error("PREVIEW ERROR:", err);
// // //     res.status(500).json({ error: err.message });
// // //   }
// // // });

// // // /* ================= SAVE ================= */
// // // router.post("/save", async (req, res) => {
// // //   try {
// // //     const { from_date, to_date, payroll_name, rows } = req.body;

// // //     const { data: run, error } = await supabase
// // //       .from("payroll_runs")
// // //       .insert({
// // //         period_start: from_date,
// // //         period_end: to_date,
// // //         notes: payroll_name
// // //       })
// // //       .select()
// // //       .single();

// // //     if (error) throw error;

// // //     for (const r of rows) {
// // //       await supabase.from("payroll_items").insert({
// // //         payroll_run_id: run.id,
// // //         candidate_id: r.candidate_id,
// // //         candidate_name: r.candidate_name,

// // //         regular_hours: r.reg_hours,
// // //         ot_hours: r.ot_hours,
// // //         holiday_hours: r.holiday_hours,

// // //         standard_w2_amount: r.standard_w2_amount,
// // //         ot_amount: r.ot_amount,
// // //         holiday_amount: r.holiday_amount,

// // //         standard_stipend_amount: r.standard_stipend_amount,
// // //         total_candidate_expense: r.total_candidate_expense,

// // //         client_standard_amount: r.client_standard_amount,
// // //         client_ot_holiday_amount: r.client_ot_holiday_amount,
// // //         total_amount_received_from_client:
// // //           r.total_amount_received_from_client,

// // //         net_profit: r.net_profit
// // //       });
// // //     }

// // //     res.json({ payroll_run_id: run.id });
// // //   } catch (err) {
// // //     console.error("SAVE ERROR:", err);
// // //     res.status(500).json({ error: err.message });
// // //   }
// // // });

// // // /* ================= DOWNLOAD XLSX ================= */
// // // router.post("/download", async (req, res) => {
// // //   try {
// // //     if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// // //     const filePath = path.join(
// // //       OUTPUT_DIR,
// // //       `payroll_${Date.now()}.xlsx`
// // //     );

// // //     const exportStream = await driveApi.files.export(
// // //       {
// // //         fileId: SHEET_ID,
// // //         mimeType:
// // //           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
// // //       },
// // //       { responseType: "stream" }
// // //     );

// // //     await pipeline(exportStream.data, fs.createWriteStream(filePath));
// // //     res.download(filePath, () => fs.unlinkSync(filePath));
// // //   } catch (err) {
// // //     console.error("DOWNLOAD ERROR:", err);
// // //     res.status(500).json({ error: err.message });
// // //   }
// // // });

// // // export default router;



// // // import express from "express";
// // // import crypto from "crypto";
// // // import { google } from "googleapis";
// // // import fs from "fs";
// // // import path from "path";
// // // import { pipeline } from "stream/promises";
// // // import { supabase } from "../server/supabaseClient.js";

// // // const router = express.Router();

// // // /* ================= CONFIG ================= */
// // // const SHEET_ID = process.env.GSHEET_ID;
// // // const OUTPUT_DIR = path.join(process.cwd(), "outputs");
// // // const VMS_RATE = 0.06;

// // // /* ================= SAFETY ================= */
// // // if (!SHEET_ID) throw new Error("GSHEET_ID missing");

// // // const KEY_PATH = path.join(process.cwd(), "google-service-account.json");
// // // if (!fs.existsSync(KEY_PATH)) {
// // //   throw new Error("google-service-account.json missing");
// // // }

// // // /* ================= GOOGLE AUTH ================= */
// // // const auth = new google.auth.GoogleAuth({
// // //   keyFile: KEY_PATH,
// // //   scopes: [
// // //     "https://www.googleapis.com/auth/spreadsheets",
// // //     "https://www.googleapis.com/auth/drive"
// // //   ]
// // // });

// // // const driveApi = google.drive({ version: "v3", auth });

// // // /* ================= HELPERS ================= */
// // // const round = n => Number(Number(n).toFixed(2));

// // // /* ================= CALCULATION CORE ================= */
// // // function calculatePayroll(c, h) {
// // //   const reg = h.reg_hours ?? 0;
// // //   const ot = h.ot_hours ?? 0;
// // //   const hol = h.holiday_hours ?? 0;

// // //   const total_hours = reg + ot + hol;

// // //   const w2 = h.w2_rate ?? c.w2_rate ?? 0;
// // //   const stipend = h.stipend_rate ?? c.stipend_rate ?? 0;
// // //   const ot_rate = h.ot_rate ?? c.ot_rate ?? 0;
// // //   const hol_rate = h.holiday_rate ?? c.holiday_rate ?? 0;
// // //   const sign_bonus = h.sign_bonus ?? c.sign_bonus ?? 0;

// // //   const standard_w2_amount = round(reg * w2);
// // //   const ot_amount = round(ot * ot_rate);
// // //   const holiday_amount = round(hol * hol_rate);

// // //   const overall_bonus = round(sign_bonus + ot_amount + holiday_amount);
// // //   const guaranteed = round(w2 * ot);

// // //   const standard_stipend_amount = round(reg * stipend);
// // //   const total_payable = round(
// // //     standard_w2_amount +
// // //     standard_stipend_amount +
// // //     overall_bonus
// // //   );

// // //   const client_std_rate =
// // //     h.client_standard_bill_rate ?? c.client_standard_bill_rate ?? 0;
// // //   const client_ot_rate =
// // //     h.client_ot_bill_rate ?? c.client_ot_bill_rate ?? 0;
// // //   const client_hol_rate =
// // //     h.client_holiday_bill_rate ?? c.client_holiday_bill_rate ?? 0;

// // //   const client_standard_amount = round(
// // //     reg * client_std_rate * (1 - VMS_RATE)
// // //   );

// // //   const client_ot_holiday_amount = round(
// // //     (ot * client_ot_rate + hol * client_hol_rate) * (1 - VMS_RATE)
// // //   );

// // //   const total_received = round(
// // //     client_standard_amount + client_ot_holiday_amount
// // //   );

// // //   const net_profit = round(total_received - total_payable);

// // //   return {
// // //     reg, ot, hol, total_hours,
// // //     w2, stipend, ot_rate, hol_rate,
// // //     guaranteed,
// // //     standard_w2_amount,
// // //     ot_amount,
// // //     holiday_amount,
// // //     sign_bonus,
// // //     overall_bonus,
// // //     standard_stipend_amount,
// // //     total_payable,
// // //     client_std_rate,
// // //     client_ot_rate,
// // //     client_hol_rate,
// // //     client_standard_amount,
// // //     client_ot_holiday_amount,
// // //     total_received,
// // //     net_profit
// // //   };
// // // }

// // // /* ================= PREVIEW ================= */
// // // router.post("/preview", async (req, res) => {
// // //   try {
// // //     const { candidates } = req.body;
// // //     if (!Array.isArray(candidates))
// // //       return res.status(400).json({ error: "Invalid payload" });

// // //     const rows = [];

// // //     for (const h of candidates) {
// // //       const { data: c } = await supabase
// // //         .from("candidate_data")
// // //         .select("*")
// // //         .eq("id", h.id)
// // //         .single();

// // //       if (!c) continue;

// // //       const calc = calculatePayroll(c, h);

// // //       rows.push({
// // //         candidate_id: c.id,
// // //         candidate_name: c.candidate_name,
// // //         reg_hours: calc.reg,
// // //         ot_hours: calc.ot,
// // //         holiday_hours: calc.hol,
// // //         total_hours: calc.total_hours,
// // //         w2_rate: calc.w2,
// // //         stipend_rate: calc.stipend,
// // //         ot_rate: calc.ot_rate,
// // //         holiday_rate: calc.hol_rate,
// // //         guaranteed: calc.guaranteed,
// // //         standard_w2_amount: calc.standard_w2_amount,
// // //         ot_amount: calc.ot_amount,
// // //         holiday_amount: calc.holiday_amount,
// // //         sign_bonus: calc.sign_bonus,
// // //         overall_bonus: calc.overall_bonus,
// // //         standard_stipend_amount: calc.standard_stipend_amount,
// // //         total_payable: calc.total_payable,
// // //         client_standard_bill_rate: calc.client_std_rate,
// // //         vms_charges: VMS_RATE,
// // //         client_standard_amount: calc.client_standard_amount,
// // //         client_ot_bill_rate: calc.client_ot_rate,
// // //         client_holiday_bill_rate: calc.client_hol_rate,
// // //         client_ot_holiday_amount: calc.client_ot_holiday_amount,
// // //         total_amount_received_from_client: calc.total_received,
// // //         net_profit: calc.net_profit,
// // //         total_candidate_expense: calc.total_payable
// // //       });
// // //     }

// // //     res.json({ rows });
// // //   } catch (err) {
// // //     console.error("PREVIEW ERROR:", err);
// // //     res.status(500).json({ error: err.message });
// // //   }
// // // });

// // // /* ================= DRAFT UPSERT (AUTO-SAVE ON EDIT) ================= */
// // // router.post("/draft-upsert", async (req, res) => {
// // //   try {
// // //     const { rows } = req.body;

// // //     for (const r of rows) {
// // //       await supabase.from("payroll_items").upsert(
// // //         {
// // //           payroll_run_id: null, // draft
// // //           candidate_id: r.candidate_id,
// // //           candidate_name: r.candidate_name,
// // //           regular_hours: r.reg_hours,
// // //           ot_hours: r.ot_hours,
// // //           holiday_hours: r.holiday_hours,
// // //           standard_w2_amount: r.standard_w2_amount,
// // //           ot_amount: r.ot_amount,
// // //           holiday_amount: r.holiday_amount,
// // //           standard_stipend_amount: r.standard_stipend_amount,
// // //           total_candidate_expense: r.total_candidate_expense,
// // //           client_standard_amount: r.client_standard_amount,
// // //           client_ot_holiday_amount: r.client_ot_holiday_amount,
// // //           total_amount_received_from_client:
// // //             r.total_amount_received_from_client,
// // //           net_profit: r.net_profit,
// // //           updated_at: new Date()
// // //         },
// // //         { onConflict: "candidate_id" }
// // //       );
// // //     }

// // //     res.json({ success: true });
// // //   } catch (err) {
// // //     console.error("DRAFT UPSERT ERROR:", err);
// // //     res.status(500).json({ error: err.message });
// // //   }
// // // });

// // // /* ================= SAVE (FINALIZE) ================= */
// // // router.post("/save", async (req, res) => {
// // //   try {
// // //     const { from_date, to_date, payroll_name, rows } = req.body;

// // //     const { data: run } = await supabase
// // //       .from("payroll_runs")
// // //       .insert({
// // //         period_start: from_date,
// // //         period_end: to_date,
// // //         notes: payroll_name
// // //       })
// // //       .select()
// // //       .single();

// // //     for (const r of rows) {
// // //       await supabase.from("payroll_items").insert({
// // //         payroll_run_id: run.id,
// // //         candidate_id: r.candidate_id,
// // //         candidate_name: r.candidate_name,
// // //         regular_hours: r.reg_hours,
// // //         ot_hours: r.ot_hours,
// // //         holiday_hours: r.holiday_hours,
// // //         standard_w2_amount: r.standard_w2_amount,
// // //         ot_amount: r.ot_amount,
// // //         holiday_amount: r.holiday_amount,
// // //         standard_stipend_amount: r.standard_stipend_amount,
// // //         total_candidate_expense: r.total_candidate_expense,
// // //         client_standard_amount: r.client_standard_amount,
// // //         client_ot_holiday_amount: r.client_ot_holiday_amount,
// // //         total_amount_received_from_client:
// // //           r.total_amount_received_from_client,
// // //         net_profit: r.net_profit
// // //       });
// // //     }

// // //     res.json({ payroll_run_id: run.id });
// // //   } catch (err) {
// // //     console.error("SAVE ERROR:", err);
// // //     res.status(500).json({ error: err.message });
// // //   }
// // // });

// // // /* ================= DOWNLOAD XLSX ================= */
// // // router.post("/download", async (req, res) => {
// // //   try {
// // //     if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// // //     const filePath = path.join(
// // //       OUTPUT_DIR,
// // //       `payroll_${Date.now()}.xlsx`
// // //     );

// // //     const exportStream = await driveApi.files.export(
// // //       {
// // //         fileId: SHEET_ID,
// // //         mimeType:
// // //           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
// // //       },
// // //       { responseType: "stream" }
// // //     );

// // //     await pipeline(exportStream.data, fs.createWriteStream(filePath));
// // //     res.download(filePath, () => fs.unlinkSync(filePath));
// // //   } catch (err) {
// // //     console.error("DOWNLOAD ERROR:", err);
// // //     res.status(500).json({ error: err.message });
// // //   }
// // // });

// // // export default router;






// // //edit is ok
// // // import express from "express";
// // // import { google } from "googleapis";
// // // import fs from "fs";
// // // import path from "path";
// // // import { pipeline } from "stream/promises";
// // // import { supabase } from "../server/supabaseClient.js";

// // // const router = express.Router();

// // // /* ================= CONFIG ================= */
// // // const SHEET_ID = process.env.GSHEET_ID;
// // // const OUTPUT_DIR = path.join(process.cwd(), "outputs");
// // // const VMS_RATE = 0.06;
// // // const SHEET_NAME = "Payroll";

// // // /* ================= SAFETY ================= */
// // // if (!SHEET_ID) throw new Error("GSHEET_ID missing");

// // // const KEY_PATH = path.join(process.cwd(), "google-service-account.json");
// // // if (!fs.existsSync(KEY_PATH)) {
// // //   throw new Error("google-service-account.json missing");
// // // }

// // // /* ================= GOOGLE AUTH ================= */
// // // const auth = new google.auth.GoogleAuth({
// // //   keyFile: KEY_PATH,
// // //   scopes: [
// // //     "https://www.googleapis.com/auth/spreadsheets",
// // //     "https://www.googleapis.com/auth/drive"
// // //   ]
// // // });

// // // const sheetsApi = google.sheets({ version: "v4", auth });
// // // const driveApi = google.drive({ version: "v3", auth });
// // // router.get("/_debug", (req, res) => {
// // //   res.json({ message: "CORRECT payroll.js loaded" });
// // // });

// // // /* ================= HELPERS ================= */
// // // const round = n => Number(Number(n).toFixed(2));

// // // /* ================= CALCULATION CORE ================= */
// // // function calculatePayroll(c, h) {
// // //   const reg = h.reg_hours ?? 0;
// // //   const ot = h.ot_hours ?? 0;
// // //   const hol = h.holiday_hours ?? 0;

// // //   const total_hours = reg + ot + hol;

// // //   const w2 = h.w2_rate ?? c.w2_rate ?? 0;
// // //   const stipend = h.stipend_rate ?? c.stipend_rate ?? 0;
// // //   const ot_rate = h.ot_rate ?? c.ot_rate ?? 0;
// // //   const hol_rate = h.holiday_rate ?? c.holiday_rate ?? 0;
// // //   const sign_bonus = h.sign_bonus ?? c.sign_bonus ?? 0;

// // //   const standard_w2_amount = round(reg * w2);
// // //   const ot_amount = round(ot * ot_rate);
// // //   const holiday_amount = round(hol * hol_rate);

// // //   const overall_bonus = round(sign_bonus + ot_amount + holiday_amount);
// // //   const guaranteed = round(w2 * ot);

// // //   const standard_stipend_amount = round(reg * stipend);
// // //   const total_payable = round(
// // //     standard_w2_amount +
// // //     standard_stipend_amount +
// // //     overall_bonus
// // //   );

// // //   const client_std_rate =
// // //     h.client_standard_bill_rate ?? c.client_standard_bill_rate ?? 0;
// // //   const client_ot_rate =
// // //     h.client_ot_bill_rate ?? c.client_ot_bill_rate ?? 0;
// // //   const client_hol_rate =
// // //     h.client_holiday_bill_rate ?? c.client_holiday_bill_rate ?? 0;

// // //   const client_standard_amount = round(
// // //     reg * client_std_rate * (1 - VMS_RATE)
// // //   );

// // //   const client_ot_holiday_amount = round(
// // //     (ot * client_ot_rate + hol * client_hol_rate) * (1 - VMS_RATE)
// // //   );

// // //   const total_received = round(
// // //     client_standard_amount + client_ot_holiday_amount
// // //   );

// // //   const net_profit = round(total_received - total_payable);

// // //   return {
// // //     reg, ot, hol, total_hours,
// // //     w2, stipend, ot_rate, hol_rate,
// // //     guaranteed,
// // //     standard_w2_amount,
// // //     ot_amount,
// // //     holiday_amount,
// // //     sign_bonus,
// // //     overall_bonus,
// // //     standard_stipend_amount,
// // //     total_payable,
// // //     client_std_rate,
// // //     client_ot_rate,
// // //     client_hol_rate,
// // //     client_standard_amount,
// // //     client_ot_holiday_amount,
// // //     total_received,
// // //     net_profit
// // //   };
// // // }

// // // /* ================= PREVIEW ================= */
// // // router.post("/preview", async (req, res) => {
// // //   try {
// // //     const { candidates } = req.body;
// // //     if (!Array.isArray(candidates))
// // //       return res.status(400).json({ error: "Invalid payload" });

// // //     const rows = [];

// // //     for (const h of candidates) {
// // //       const { data: c } = await supabase
// // //         .from("candidate_data")
// // //         .select("*")
// // //         .eq("id", h.id)
// // //         .single();

// // //       if (!c) continue;

// // //       const calc = calculatePayroll(c, h);

// // //       rows.push({
// // //         candidate_id: c.id,
// // //         candidate_name: c.candidate_name,
// // //         reg_hours: calc.reg,
// // //         ot_hours: calc.ot,
// // //         holiday_hours: calc.hol,
// // //         total_hours: calc.total_hours,
// // //         w2_rate: calc.w2,
// // //         stipend_rate: calc.stipend,
// // //         ot_rate: calc.ot_rate,
// // //         holiday_rate: calc.hol_rate,
// // //         guaranteed: calc.guaranteed,
// // //         standard_w2_amount: calc.standard_w2_amount,
// // //         ot_amount: calc.ot_amount,
// // //         holiday_amount: calc.holiday_amount,
// // //         sign_bonus: calc.sign_bonus,
// // //         overall_bonus: calc.overall_bonus,
// // //         standard_stipend_amount: calc.standard_stipend_amount,
// // //         total_payable: calc.total_payable,
// // //         client_standard_bill_rate: calc.client_std_rate,
// // //         vms_charges: VMS_RATE,
// // //         client_standard_amount: calc.client_standard_amount,
// // //         client_ot_bill_rate: calc.client_ot_rate,
// // //         client_holiday_bill_rate: calc.client_hol_rate,
// // //         client_ot_holiday_amount: calc.client_ot_holiday_amount,
// // //         total_amount_received_from_client: calc.total_received,
// // //         net_profit: calc.net_profit,
// // //         total_candidate_expense: calc.total_payable
// // //       });
// // //     }

// // //     res.json({ rows });
// // //   } catch (err) {
// // //     console.error("PREVIEW ERROR:", err);
// // //     res.status(500).json({ error: err.message });
// // //   }
// // // });

// // // /* ================= SHEET HELPERS ================= */
// // // async function clearPayrollSheet() {
// // //   await sheetsApi.spreadsheets.values.clear({
// // //     spreadsheetId: SHEET_ID,
// // //     range: `${SHEET_NAME}!A12:Z1000`
// // //   });
// // // }

// // // async function writePayrollToSheet(rows) {
// // //   const values = rows.map(r => [
// // //     r.candidate_name,
// // //     r.total_hours,
// // //     r.reg_hours,
// // //     r.ot_hours,
// // //     r.holiday_hours,
// // //     r.w2_rate,
// // //     r.stipend_rate,
// // //     r.ot_rate,
// // //     r.holiday_rate,
// // //     r.guaranteed,
// // //     r.standard_w2_amount,
// // //     r.ot_amount,
// // //     r.holiday_amount,
// // //     r.sign_bonus,
// // //     r.overall_bonus,
// // //     r.standard_stipend_amount,
// // //     r.total_payable,
// // //     r.client_standard_bill_rate,
// // //     r.vms_charges,
// // //     r.client_standard_amount,
// // //     r.client_ot_bill_rate,
// // //     r.client_holiday_bill_rate,
// // //     r.client_ot_holiday_amount,
// // //     r.total_amount_received_from_client,
// // //     r.net_profit,
// // //     r.total_candidate_expense
// // //   ]);

// // //   await sheetsApi.spreadsheets.values.update({
// // //     spreadsheetId: SHEET_ID,
// // //     range: `${SHEET_NAME}!A12`,
// // //     valueInputOption: "USER_ENTERED",
// // //     requestBody: { values }
// // //   });
// // // }

// // // /* ================= DOWNLOAD XLSX ================= */
// // // router.post("/download", async (req, res) => {
// // //   try {
// // //     const { rows } = req.body;
// // //     if (!Array.isArray(rows))
// // //       return res.status(400).json({ error: "Rows missing" });

// // //     if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// // //     // 1️⃣ Clear old template values
// // //     await clearPayrollSheet();

// // //     // 2️⃣ Write latest payroll snapshot
// // //     await writePayrollToSheet(rows);

// // //     // 3️⃣ Export XLSX
// // //     const filePath = path.join(
// // //       OUTPUT_DIR,
// // //       `payroll_${Date.now()}.xlsx`
// // //     );

// // //     const exportStream = await driveApi.files.export(
// // //       {
// // //         fileId: SHEET_ID,
// // //         mimeType:
// // //           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
// // //       },
// // //       { responseType: "stream" }
// // //     );

// // //     await pipeline(exportStream.data, fs.createWriteStream(filePath));

// // //     // 4️⃣ Reset template again
// // //     await clearPayrollSheet();

// // //     res.download(filePath, () => fs.unlinkSync(filePath));
// // //   } catch (err) {
// // //     console.error("DOWNLOAD ERROR:", err);
// // //     res.status(500).json({ error: err.message });
// // //   }
// // // });

// // // export default router;

// // import express from "express";
// // import { google } from "googleapis";
// // import fs from "fs";
// // import path from "path";
// // import { pipeline } from "stream/promises";
// // import { supabase } from "../server/supabaseClient.js";

// // const router = express.Router();

// // /* ================= CONFIG ================= */
// // const SHEET_ID = process.env.GSHEET_ID;
// // const OUTPUT_DIR = path.join(process.cwd(), "outputs");
// // const VMS_RATE = 0.06;
// // const SHEET_NAME = "Payroll";

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

// // /* ================= DEBUG ================= */
// // router.get("/_debug", (req, res) => {
// //   res.json({ message: "CORRECT payroll.js loaded" });
// // });

// // /* ================= HELPERS ================= */
// // const round = n => Number(Number(n || 0).toFixed(2));

// // /* ================= CALCULATION CORE ================= */
// // function calculatePayroll(c, h) {
// //   const reg = h.reg_hours ?? 0;
// //   const ot = h.ot_hours ?? 0;
// //   const hol = h.holiday_hours ?? 0;

// //   const total_hours = reg + ot + hol;

// //   const w2 = h.w2_rate ?? c.w2_rate ?? 0;
// //   const stipend = h.stipend_rate ?? c.stipend_rate ?? 0;
// //   const ot_rate = h.ot_rate ?? c.ot_rate ?? 0;
// //   const hol_rate = h.holiday_rate ?? c.holiday_rate ?? 0;
// //   const sign_bonus = h.sign_bonus ?? c.sign_bonus ?? 0;

// //   const standard_w2_amount = round(reg * w2);
// //   const ot_amount = round(ot * ot_rate);
// //   const holiday_amount = round(hol * hol_rate);

// //   const overall_bonus = round(sign_bonus + ot_amount + holiday_amount);
// //   const guaranteed = round(w2 * ot);

// //   const standard_stipend_amount = round(reg * stipend);
// //   const total_payable = round(
// //     standard_w2_amount +
// //     standard_stipend_amount +
// //     overall_bonus
// //   );

// //   const client_std_rate =
// //     h.client_standard_bill_rate ?? c.client_standard_bill_rate ?? 0;
// //   const client_ot_rate =
// //     h.client_ot_bill_rate ?? c.client_ot_bill_rate ?? 0;
// //   const client_hol_rate =
// //     h.client_holiday_bill_rate ?? c.client_holiday_bill_rate ?? 0;

// //   const client_standard_amount = round(
// //     total_hours * client_std_rate
// //   );

// //   const client_ot_holiday_amount = round(
// //     // (ot * client_ot_rate + hol * client_hol_rate) * (1 - VMS_RATE)
// //     (ot_hours * client_ot_bill_rate ) + ((holiday_hours * client_holiday_bill_rate) - (vms_charges * (client_ot_bill_rate + client_holiday_bill_rate)))
// //   );

// //   const total_received = round(
// //     client_standard_amount + client_ot_holiday_amount
// //   );

// //   const net_profit = round(total_received - total_candidate_expense);

// //   return {
// //     reg, ot, hol, total_hours,
// //     w2, stipend, ot_rate, hol_rate,
// //     guaranteed,
// //     standard_w2_amount,
// //     ot_amount,
// //     holiday_amount,
// //     sign_bonus,
// //     overall_bonus,
// //     standard_stipend_amount,
// //     total_payable,
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

// //       rows.push({
// //         candidate_id: c.id,
// //         candidate_name: c.candidate_name,

// //         reg_hours: calc.reg,
// //         ot_hours: calc.ot,
// //         holiday_hours: calc.hol,
// //         total_hours: calc.total_hours,

// //         w2_rate: calc.w2,
// //         stipend_rate: calc.stipend,
// //         ot_rate: calc.ot_rate,
// //         holiday_rate: calc.hol_rate,

// //         guaranteed: calc.guaranteed,

// //         standard_w2_amount: calc.standard_w2_amount,
// //         ot_amount: calc.ot_amount,
// //         holiday_amount: calc.holiday_amount,

// //         sign_bonus: calc.sign_bonus,
// //         overall_bonus: calc.overall_bonus,

// //         standard_stipend_amount: calc.standard_stipend_amount,
// //         total_payable: calc.total_payable,

// //         client_standard_bill_rate: calc.client_std_rate,
// //         vms_charges: VMS_RATE,
// //         client_standard_amount: calc.client_standard_amount,

// //         client_ot_bill_rate: calc.client_ot_rate,
// //         client_holiday_bill_rate: calc.client_hol_rate,
// //         client_ot_holiday_amount: calc.client_ot_holiday_amount,

// //         total_amount_received_from_client: calc.total_received,
// //         net_profit: calc.net_profit,
// //         total_candidate_expense: calc.total_payable
// //       });
// //     }

// //     res.json({ rows });
// //   } catch (err) {
// //     console.error("PREVIEW ERROR:", err);
// //     res.status(500).json({ error: err.message });
// //   }
// // });

// // /* ================= DRAFT UPSERT (AUTOSAVE) ================= */
// // router.post("/draft-upsert", async (req, res) => {
// //   try {
// //     const { rows } = req.body;

// //     for (const r of rows) {
// //       await supabase.from("payroll_items").upsert(
// //         {
// //           payroll_run_id: null,
// //           candidate_id: r.candidate_id,
// //           candidate_name: r.candidate_name,

// //           regular_hours: r.reg_hours,
// //           ot_hours: r.ot_hours,
// //           holiday_hours: r.holiday_hours,

// //           standard_w2_amount: r.standard_w2_amount,
// //           ot_amount: r.ot_amount,
// //           holiday_amount: r.holiday_amount,

// //           standard_stipend_amount: r.standard_stipend_amount,
// //           total_candidate_expense: r.total_candidate_expense,

// //           client_standard_amount: r.client_standard_amount,
// //           client_ot_holiday_amount: r.client_ot_holiday_amount,
// //           total_amount_received_from_client:
// //             r.total_amount_received_from_client,

// //           net_profit: r.net_profit,
// //           updated_at: new Date()
// //         },
// //         { onConflict: "candidate_id" }
// //       );
// //     }

// //     res.json({ success: true });
// //   } catch (err) {
// //     console.error("DRAFT UPSERT ERROR:", err);
// //     res.status(500).json({ error: err.message });
// //   }
// // });

// // /* ================= SAVE (FINALIZE) ================= */
// // router.post("/save", async (req, res) => {
// //   try {
// //     const { from_date, to_date, payroll_name, rows } = req.body;

// //     const { data: run } = await supabase
// //       .from("payroll_runs")
// //       .insert({
// //         period_start: from_date,
// //         period_end: to_date,
// //         notes: payroll_name
// //       })
// //       .select()
// //       .single();

// //     for (const r of rows) {
// //       await supabase.from("payroll_items").insert({
// //         payroll_run_id: run.id,
// //         candidate_id: r.candidate_id,
// //         candidate_name: r.candidate_name,

// //         regular_hours: r.reg_hours,
// //         ot_hours: r.ot_hours,
// //         holiday_hours: r.holiday_hours,

// //         standard_w2_amount: r.standard_w2_amount,
// //         ot_amount: r.ot_amount,
// //         holiday_amount: r.holiday_amount,

// //         standard_stipend_amount: r.standard_stipend_amount,
// //         total_candidate_expense: r.total_candidate_expense,

// //         client_standard_amount: r.client_standard_amount,
// //         client_ot_holiday_amount: r.client_ot_holiday_amount,
// //         total_amount_received_from_client:
// //           r.total_amount_received_from_client,

// //         net_profit: r.net_profit
// //       });
// //     }

// //     res.json({ payroll_run_id: run.id });
// //   } catch (err) {
// //     console.error("SAVE ERROR:", err);
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
// //   const values = rows.map(r => [
// //     r.candidate_name,
// //     r.total_hours,
// //     r.reg_hours,
// //     r.ot_hours,
// //     r.holiday_hours,
// //     r.w2_rate,
// //     r.stipend_rate,
// //     r.ot_rate,
// //     r.holiday_rate,
// //     r.guaranteed,
// //     r.standard_w2_amount,
// //     r.ot_amount,
// //     r.holiday_amount,
// //     r.sign_bonus,
// //     r.overall_bonus,
// //     r.standard_stipend_amount,
// //     r.total_payable,
// //     r.total_candidate_expense,
// //     r.client_standard_bill_rate,
// //     r.vms_charges,
// //     r.client_standard_amount,
// //     r.client_ot_bill_rate,
// //     r.client_holiday_bill_rate,
// //     r.client_ot_holiday_amount,
// //     r.total_amount_received_from_client,
// //     r.net_profit,
// //     r.total_candidate_expense
// //   ]);

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
// //     if (!Array.isArray(rows)) {
// //       return res.status(400).json({ error: "Rows missing" });
// //     }

// //     // 1️⃣ Clear template
// //     await clearPayrollSheet();

// //     // 2️⃣ Write fresh values
// //     await writePayrollToSheet(rows);

// //     // 3️⃣ Set response headers FIRST
// //     res.setHeader(
// //       "Content-Type",
// //       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
// //     );
// //     res.setHeader(
// //       "Content-Disposition",
// //       "attachment; filename=payroll.xlsx"
// //     );

// //     // 4️⃣ Stream Google export DIRECTLY to browser
// //     const exportStream = await driveApi.files.export(
// //       {
// //         fileId: SHEET_ID,
// //         mimeType:
// //           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
// //       },
// //       { responseType: "stream" }
// //     );

// //     await pipeline(exportStream.data, res);

// //     // 5️⃣ Reset template AFTER streaming
// //     await clearPayrollSheet();
// //   } catch (err) {
// //     console.error("DOWNLOAD ERROR:", err);
// //     if (!res.headersSent) {
// //       res.status(500).json({ error: err.message });
// //     }
// //   }
// // });

// // export default router;

// import express from "express";
// import { google } from "googleapis";
// import fs from "fs";
// import path from "path";
// import { pipeline } from "stream/promises";
// import { supabase } from "../server/supabaseClient.js";

// const router = express.Router();

// /* ================= CONFIG ================= */
// const SHEET_ID = process.env.GSHEET_ID;
// const OUTPUT_DIR = path.join(process.cwd(), "outputs");
// const VMS_RATE = 0.06;
// const SHEET_NAME = "Payroll";

// /* ================= SAFETY ================= */
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

// /* ================= DEBUG ================= */
// router.get("/_debug", (req, res) => {
//   res.json({ message: "CORRECT payroll.js loaded" });
// });

// /* ================= HELPERS ================= */
// const round = n =>
//   n === null || n === undefined
//     ? null
//     : Number(Number(n).toFixed(2));

// /* ================= CALCULATION CORE ================= */
// function calculatePayroll(c, h) {
//   const reg = h.reg_hours ?? 0;
//   const ot = h.ot_hours ?? 0;
//   const hol = h.holiday_hours ?? 0;

//   const total_hours = reg + ot + hol;

//   /* ---------- Rates (NULL SAFE) ---------- */
//   const w2 =
//     h.w2_rate !== undefined ? h.w2_rate : c.w2_rate ?? null;

//   const stipend =
//     h.stipend_rate !== undefined
//       ? h.stipend_rate
//       : c.stipend_rate ?? null;

//   const ot_rate =
//     h.ot_rate !== undefined ? h.ot_rate : c.ot_rate ?? null;

//   const hol_rate =
//     h.holiday_rate !== undefined
//       ? h.holiday_rate
//       : c.holiday_rate ?? null;

//   const sign_bonus =
//     h.sign_bonus !== undefined
//       ? h.sign_bonus
//       : c.sign_bonus ?? null;

//   /* ---------- Candidate Pay ---------- */
//   const standard_w2_amount =
//     w2 !== null ? round(reg * w2) : null;

//   const ot_amount =
//     ot_rate !== null ? round(ot * ot_rate) : null;

//   const holiday_amount =
//     hol_rate !== null ? round(hol * hol_rate) : null;

//   const overall_bonus =
//     sign_bonus === null &&
//     ot_amount === null &&
//     holiday_amount === null
//       ? null
//       : round(
//           (sign_bonus ?? 0) +
//           (ot_amount ?? 0) +
//           (holiday_amount ?? 0)
//         );

//   const guaranteed =
//     w2 !== null ? round(w2 * ot) : null;

//   const standard_stipend_amount =
//     stipend !== null ? round(reg * stipend) : null;

//   const total_payable =
//     standard_w2_amount === null &&
//     standard_stipend_amount === null &&
//     overall_bonus === null
//       ? null
//       : round(
//           (standard_w2_amount ?? 0) +
//           (standard_stipend_amount ?? 0) +
//           (overall_bonus ?? 0)
//         );

//   /* ---------- Client Billing ---------- */
//   const client_std_rate =
//     h.client_standard_bill_rate !== undefined
//       ? h.client_standard_bill_rate
//       : c.client_standard_bill_rate ?? null;

//   const client_ot_rate =
//     h.client_ot_bill_rate !== undefined
//       ? h.client_ot_bill_rate
//       : c.client_ot_bill_rate ?? null;

//   const client_hol_rate =
//     h.client_holiday_bill_rate !== undefined
//       ? h.client_holiday_bill_rate
//       : c.client_holiday_bill_rate ?? null;

//   const client_standard_amount =
//     client_std_rate !== null
//       ? round(total_hours * client_std_rate)
//       : null;

//   const client_ot_holiday_amount =
//     client_ot_rate === null && client_hol_rate === null
//       ? null
//       : round(
//           (
//             (ot * (client_ot_rate ?? 0)) +
//             (hol * (client_hol_rate ?? 0))
//           ) * (1 - VMS_RATE)
//         );

//   const total_received =
//     client_standard_amount === null &&
//     client_ot_holiday_amount === null
//       ? null
//       : round(
//           (client_standard_amount ?? 0) +
//           (client_ot_holiday_amount ?? 0)
//         );
//   const net_profit =
//   total_received === null ||
//   total_candidate_expense === null
//     ? null
//     : round(total_received - total_candidate_expense);


//   return {
//     reg,
//     ot,
//     hol,
//     total_hours,

//     w2,
//     stipend,
//     ot_rate,
//     hol_rate,

//     guaranteed,
//     standard_w2_amount,
//     ot_amount,
//     holiday_amount,

//     sign_bonus,
//     overall_bonus,

//     standard_stipend_amount,
//     total_payable,
//     total_candidate_expense,

//     client_std_rate,
//     client_ot_rate,
//     client_hol_rate,

//     client_standard_amount,
//     client_ot_holiday_amount,
//     total_received,
//     net_profit
//   };
// }

// /* ================= PREVIEW ================= */
// router.post("/preview", async (req, res) => {
//   try {
//     const { candidates } = req.body;
//     if (!Array.isArray(candidates))
//       return res.status(400).json({ error: "Invalid payload" });

//     const rows = [];

//     for (const h of candidates) {
//       const { data: c } = await supabase
//         .from("candidate_data")
//         .select("*")
//         .eq("id", h.id)
//         .single();

//       if (!c) continue;

//       const calc = calculatePayroll(c, h);

//       rows.push({
//         candidate_id: c.id,
//         candidate_name: c.candidate_name,

//         reg_hours: calc.reg,
//         ot_hours: calc.ot,
//         holiday_hours: calc.hol,
//         total_hours: calc.total_hours,

//         w2_rate: calc.w2,
//         stipend_rate: calc.stipend,
//         ot_rate: calc.ot_rate,
//         holiday_rate: calc.hol_rate,

//         guaranteed: calc.guaranteed,

//         standard_w2_amount: calc.standard_w2_amount,
//         ot_amount: calc.ot_amount,
//         holiday_amount: calc.holiday_amount,

//         sign_bonus: calc.sign_bonus,
//         overall_bonus: calc.overall_bonus,

//         standard_stipend_amount: calc.standard_stipend_amount,
//         total_candidate_expense: calc.total_candidate_expense,

//         client_standard_bill_rate: calc.client_std_rate,
//         vms_charges: VMS_RATE,
//         client_standard_amount: calc.client_standard_amount,

//         client_ot_bill_rate: calc.client_ot_rate,
//         client_holiday_bill_rate: calc.client_hol_rate,
//         client_ot_holiday_amount: calc.client_ot_holiday_amount,

//         total_amount_received_from_client: calc.total_received,
//         net_profit: calc.net_profit
//       });
//     }

//     res.json({ rows });
//   } catch (err) {
//     console.error("PREVIEW ERROR:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// /* ================= SHEET HELPERS ================= */
// async function clearPayrollSheet() {
//   await sheetsApi.spreadsheets.values.clear({
//     spreadsheetId: SHEET_ID,
//     range: `${SHEET_NAME}!A12:Z1000`
//   });
// }

// async function writePayrollToSheet(rows) {
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
//     r.standard_stipend_amount,
//     r.total_payable,
//     r.total_candidate_expense,
//     r.client_standard_bill_rate,
//     r.vms_charges,
//     r.client_standard_amount,
//     r.client_ot_bill_rate,
//     r.client_holiday_bill_rate,
//     r.client_ot_holiday_amount,
//     r.total_amount_received_from_client,
//     r.net_profit
//   ]);

//   await sheetsApi.spreadsheets.values.update({
//     spreadsheetId: SHEET_ID,
//     range: `${SHEET_NAME}!A12`,
//     valueInputOption: "USER_ENTERED",
//     requestBody: { values }
//   });
// }

// /* ================= DOWNLOAD XLSX ================= */
// router.post("/download", async (req, res) => {
//   try {
//     const { rows } = req.body;
//     if (!Array.isArray(rows)) {
//       return res.status(400).json({ error: "Rows missing" });
//     }

//     await clearPayrollSheet();
//     await writePayrollToSheet(rows);

//     res.setHeader(
//       "Content-Type",
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     );
//     res.setHeader(
//       "Content-Disposition",
//       "attachment; filename=payroll.xlsx"
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
//     await clearPayrollSheet();
//   } catch (err) {
//     console.error("DOWNLOAD ERROR:", err);
//     if (!res.headersSent) {
//       res.status(500).json({ error: err.message });
//     }
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

/* ================= SAFETY ================= */
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
    "https://www.googleapis.com/auth/drive"
  ]
});

const sheetsApi = google.sheets({ version: "v4", auth });
const driveApi = google.drive({ version: "v3", auth });

/* ================= HELPERS ================= */
const round = n =>
  n === null || n === undefined ? null : Number(Number(n).toFixed(2));

/* ================= CALCULATION CORE ================= */
function calculatePayroll(c, h) {
  const reg = h.reg_hours ?? 0;
  const ot = h.ot_hours ?? 0;
  const hol = h.holiday_hours ?? 0;
  const total_candidate_expense =
    Object.prototype.hasOwnProperty.call(h, "total_candidate_expense")
      ? h.total_candidate_expense
      : null;
  const total_hours = reg + ot + hol;

  /* ---------- Rates ---------- */
  const w2 = h.w2_rate !== undefined ? h.w2_rate : c.w2_rate ?? null;
  const stipend = h.stipend_rate !== undefined ? h.stipend_rate : c.stipend_rate ?? null;
  const ot_rate = h.ot_rate !== undefined ? h.ot_rate : c.ot_rate ?? null;
  const hol_rate = h.holiday_rate !== undefined ? h.holiday_rate : c.holiday_rate ?? null;
  const sign_bonus = h.sign_bonus !== undefined ? h.sign_bonus : c.sign_bonus ?? null;

  /* ---------- Candidate Pay ---------- */
  const standard_w2_amount = w2 !== null ? round(reg * w2) : null;
  const ot_amount = ot_rate !== null ? round(ot * ot_rate) : null;
  const holiday_amount = hol_rate !== null ? round(hol * hol_rate) : null;

  const overall_bonus =
    sign_bonus === null && ot_amount === null && holiday_amount === null
      ? null
      : round((sign_bonus ?? 0) + (ot_amount ?? 0) + (holiday_amount ?? 0));

  const guaranteed = w2 !== null ? round(w2 * ot) : null;
  const standard_stipend_amount = stipend !== null ? round(reg * stipend) : null;

  /* ===== TOTAL PAYABLE (CRITICAL FIX) ===== */
  const total_payable =
    standard_w2_amount === null &&
    standard_stipend_amount === null &&
    overall_bonus === null
      ? null
      : round(
          (standard_w2_amount ?? 0) +
          (standard_stipend_amount ?? 0) +
          (overall_bonus ?? 0)
        );

  /* ---------- Client Billing ---------- */
  const client_std_rate =
    h.client_standard_bill_rate !== undefined
      ? h.client_standard_bill_rate
      : c.client_standard_bill_rate ?? null;

  const client_ot_rate =
    h.client_ot_bill_rate !== undefined
      ? h.client_ot_bill_rate
      : c.client_ot_bill_rate ?? null;

  const client_hol_rate =
    h.client_holiday_bill_rate !== undefined
      ? h.client_holiday_bill_rate
      : c.client_holiday_bill_rate ?? null;

  const client_standard_amount =
    client_std_rate !== null ? round(total_hours * client_std_rate) : null;

  const client_ot_holiday_amount =
    client_ot_rate === null && client_hol_rate === null
      ? null
      : round(
          ((ot * (client_ot_rate ?? 0)) +
           (hol * (client_hol_rate ?? 0))) *
          (1 - VMS_RATE)
        );

  const total_received =
    client_standard_amount === null && client_ot_holiday_amount === null
      ? null
      : round((client_standard_amount ?? 0) + (client_ot_holiday_amount ?? 0));

  const net_profit =
    total_received === null || total_candidate_expense === null
      ? null
      : round(total_received - total_candidate_expense);

  return {
    reg,
    ot,
    hol,
    total_hours,

    w2,
    stipend,
    ot_rate,
    hol_rate,

    guaranteed,
    standard_w2_amount,
    ot_amount,
    holiday_amount,

    sign_bonus,
    overall_bonus,

    standard_stipend_amount,
    total_payable,
    total_candidate_expense,

    client_std_rate,
    client_ot_rate,
    client_hol_rate,

    client_standard_amount,
    client_ot_holiday_amount,
    total_received,
    net_profit
  };
}

/* ================= PREVIEW ================= */
router.post("/preview", async (req, res) => {
  try {
    const { candidates } = req.body;
    if (!Array.isArray(candidates))
      return res.status(400).json({ error: "Invalid payload" });

    const rows = [];

    for (const h of candidates) {
      const { data: c } = await supabase
        .from("candidate_data")
        .select("*")
        .eq("id", h.id)
        .single();

      if (!c) continue;

      // const calc = calculatePayroll(c, h);

      // rows.push({
      //   candidate_id: c.id,
      //   candidate_name: c.candidate_name,

      //   reg_hours: calc.reg,
      //   ot_hours: calc.ot,
      //   holiday_hours: calc.hol,
      //   total_hours: calc.total_hours,
      

      //   w2_rate: calc.w2,
      //   stipend_rate: calc.stipend,
      //   ot_rate: calc.ot_rate,
      //   holiday_rate: calc.hol_rate,

      //   guaranteed: calc.guaranteed,

      //   standard_w2_amount: calc.standard_w2_amount,
      //   ot_amount: calc.ot_amount,
      //   holiday_amount: calc.holiday_amount,

      //   sign_bonus: calc.sign_bonus,
      //   overall_bonus: calc.overall_bonus,

      //   standard_stipend_amount: calc.standard_stipend_amount,
      //   total_payable: calc.total_payable,
      //   total_candidate_expense: calc.total_candidate_expense,

      //   client_standard_bill_rate: calc.client_std_rate,
      //   vms_charges: VMS_RATE,
      //   client_standard_amount: calc.client_standard_amount,

      //   client_ot_bill_rate: calc.client_ot_rate,
      //   client_holiday_bill_rate: calc.client_hol_rate,
      //   client_ot_holiday_amount: calc.client_ot_holiday_amount,

      //   total_amount_received_from_client: calc.total_received,
      //   net_profit: calc.net_profit
      // });

      const calc = calculatePayroll(c, h);

rows.push({
  candidate_id: c.id,
  candidate_name: c.candidate_name,

  reg_hours: calc.reg,
  ot_hours: calc.ot,
  holiday_hours: calc.hol,
  total_hours: calc.total_hours,

  w2_rate: calc.w2,
  stipend_rate: calc.stipend,
  ot_rate: calc.ot_rate,
  holiday_rate: calc.hol_rate,

  guaranteed: calc.guaranteed,

  standard_w2_amount: calc.standard_w2_amount,
  ot_amount: calc.ot_amount,
  holiday_amount: calc.holiday_amount,

  sign_bonus: calc.sign_bonus,
  overall_bonus: calc.overall_bonus,

  standard_stipend_amount: calc.standard_stipend_amount,
  total_payable: calc.total_payable,
  total_candidate_expense: calc.total_candidate_expense,

  client_standard_bill_rate: calc.client_std_rate,
  vms_charges: VMS_RATE,
  client_standard_amount: calc.client_standard_amount,

  client_ot_bill_rate: calc.client_ot_rate,
  client_holiday_bill_rate: calc.client_hol_rate,
  client_ot_holiday_amount: calc.client_ot_holiday_amount,

  total_amount_received_from_client: calc.total_received,
  net_profit: calc.net_profit
});

    }

    res.json({ rows });
  } catch (err) {
    console.error("PREVIEW ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= SHEET HELPERS ================= */
async function clearPayrollSheet() {
  await sheetsApi.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A12:Z1000`
  });
}

async function writePayrollToSheet(rows) {
  const values = rows.map(r => {
    const gusto_pay =
      r.standard_w2_amount !== null || r.overall_bonus !== null
        ? (r.standard_w2_amount ?? 0) + (r.overall_bonus ?? 0)
        : null;

    return [
      // Candidate info
      r.candidate_name,
      r.total_hours,
      r.reg_hours,
      r.ot_hours,
      r.holiday_hours,

      // Rates
      r.w2_rate,
      r.stipend_rate,
      r.ot_rate,
      r.holiday_rate,

      // Guaranteed
      r.guaranteed,

      // W2 + Bonus
      r.standard_w2_amount,
      r.ot_amount,
      r.holiday_amount,
      r.sign_bonus,
      r.overall_bonus,
      gusto_pay,

      // Stipend + totals
      r.standard_stipend_amount,
      r.total_payable,
      r.total_candidate_expense,

      // Client billing
      r.client_standard_bill_rate,
      r.vms_charges,
      r.client_standard_amount,
      r.client_ot_bill_rate,
      r.client_holiday_bill_rate,
      r.client_ot_holiday_amount,
      r.total_amount_received_from_client,

      // Profit
      r.net_profit
    ];
  });

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A12`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });
}

/* ================= DOWNLOAD XLSX ================= */
router.post("/download", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows))
      return res.status(400).json({ error: "Rows missing" });

    await clearPayrollSheet();
    await writePayrollToSheet(rows);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=payroll.xlsx"
    );

    const exportStream = await driveApi.files.export(
      {
        fileId: SHEET_ID,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      },
      { responseType: "stream" }
    );

    await pipeline(exportStream.data, res);
    await clearPayrollSheet();
  } catch (err) {
    console.error("DOWNLOAD ERROR:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

/* ================= SAVE (FINALIZE PAYROLL) ================= */
router.post("/save", async (req, res) => {
  res.json({ message: "SAVE ROUTE REACHED (GET)" });
  try {
    const { from_date, to_date, payroll_name, rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Rows missing" });
    }

    /* ---- create payroll run ---- */
    const { data: run, error: runErr } = await supabase
      .from("payroll_runs")
      .insert({
        period_start: from_date,
        period_end: to_date,
        notes: payroll_name
      })
      .select()
      .single();

    if (runErr) throw runErr;

    /* ---- insert payroll items ---- */
    for (const r of rows) {
      const { error: itemErr } = await supabase
        .from("payroll_items")
        .insert({
          payroll_run_id: run.id,
          candidate_id: r.candidate_id,
          candidate_name: r.candidate_name,

          regular_hours: r.reg_hours,
          ot_hours: r.ot_hours,
          holiday_hours: r.holiday_hours,

          w2_rate: r.w2_rate,
          stipend_rate: r.stipend_rate,
          ot_rate: r.ot_rate,
          holiday_rate: r.holiday_rate,

          standard_w2_amount: r.standard_w2_amount,
          ot_amount: r.ot_amount,
          holiday_amount: r.holiday_amount,

          sign_bonus: r.sign_bonus,
          overall_bonus: r.overall_bonus,

          standard_stipend_amount: r.standard_stipend_amount,
          total_payable: r.total_payable,
          total_candidate_expense: r.total_candidate_expense,

          client_standard_bill_rate: r.client_standard_bill_rate,
          client_standard_amount: r.client_standard_amount,

          client_ot_bill_rate: r.client_ot_bill_rate,
          client_ot_holiday_amount: r.client_ot_holiday_amount,

          total_amount_received_from_client:
            r.total_amount_received_from_client,

          net_profit: r.net_profit
        });

      if (itemErr){
        console.error("SUPABASE INSERT ERROR:", itemErr);
        throw itemErr;
      } 
    }

    res.json({ payroll_run_id: run.id });
  } catch (err) {
    console.error("SAVE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
