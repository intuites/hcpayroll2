import express from "express";
import { google } from "googleapis";
import fs from "fs";
import path from "path";

const router = express.Router();

/* ================= CONFIG ================= */
const SHEET_ID = process.env.GSHEET_ID;
const SHEET_NAME = "Payroll";
const START_ROW = 12;

const KEY_PATH = path.join(process.cwd(), "google-service-account.json");
if (!fs.existsSync(KEY_PATH)) {
  throw new Error("google-service-account.json missing");
}

/* ================= AUTH ================= */
const auth = new google.auth.GoogleAuth({
  keyFile: KEY_PATH,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

/* ================= PUSH TO GSHEET ================= */
router.post("/push-to-gsheet", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No payroll rows provided" });
    }

    const values = rows.map(r => ([
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
      r.total_candidate_expense,

      r.client_standard_bill_rate,
      r.vms_charges,
      r.client_standard_amount,

      r.client_ot_bill_rate,
      r.client_holiday_bill_rate,
      r.client_ot_holiday_amount,

      r.total_amount_received_from_client,
      r.net_profit,

      r.total_candidate_expense // Amount Paid to Consultant
    ]));

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${START_ROW}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values }
    });

    res.json({ success: true, rowsInserted: values.length });
  } catch (err) {
    console.error("GSHEET PUSH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
