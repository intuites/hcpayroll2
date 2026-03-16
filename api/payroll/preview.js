import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const DEFAULT_VMS_RATE = 0.06;

const n = (v) => {
  const x = Number(v);
  return Number.isNaN(x) ? 0 : x;
};

const round = (v) =>
  v === null || v === undefined
    ? null
    : Math.round((Number(v) + Number.EPSILON) * 100) / 100;

function calculatePayroll(base, input) {
  const vms_charges = n(input.vms_charges ?? base.vms_charges ?? DEFAULT_VMS_RATE);
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
  const total_payable = standard_w2_amount + standard_stipend_amount + overall_bonus;

  const client_std_rate = n(
    input.client_standard_bill_rate ?? base.client_standard_bill_rate
  );
  const client_ot_rate = n(input.client_ot_bill_rate ?? base.client_ot_bill_rate);
  const client_hol_rate = n(
    input.client_holiday_bill_rate ?? base.client_holiday_bill_rate
  );

  const client_standard_amount = reg * client_std_rate * (1 - vms_charges);
  const client_ot_holiday_amount =
    ot * (client_ot_rate - vms_charges * client_ot_rate) +
    hol * (client_hol_rate - vms_charges * client_hol_rate);

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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const candidates = req.body?.candidates;
    if (!Array.isArray(candidates) || !candidates.length) {
      return res.status(400).json({ error: "candidates array is required" });
    }

    const ids = candidates.map((c) => c.id).filter(Boolean);
    if (!ids.length) return res.status(200).json({ rows: [] });

    const { data, error } = await supabase
      .from("candidate_data")
      .select("*")
      .in("candidate_uuid", ids);

    if (error) throw error;

    const byId = new Map((data || []).map((row) => [row.candidate_uuid, row]));
    const rows = candidates
      .map((c) => {
        const base = byId.get(c.id);
        return base ? calculatePayroll(base, c) : null;
      })
      .filter(Boolean);

    return res.status(200).json({ rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
