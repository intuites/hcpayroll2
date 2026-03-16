import { createClient } from "@supabase/supabase-js";

function isIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function pad2(v) {
  return String(v).padStart(2, "0");
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCommaName(value) {
  const raw = String(value || "");
  if (!raw.includes(",")) return normalizeName(raw);
  const parts = raw.split(",");
  const last = (parts[0] || "").trim();
  const first = (parts[1] || "").trim();
  return normalizeName(`${first} ${last}`);
}

function buildNameKeys(value) {
  const keys = new Set();
  const normalized = normalizeName(value);
  if (normalized) keys.add(normalized);

  const commaNormalized = normalizeCommaName(value);
  if (commaNormalized) keys.add(commaNormalized);

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    keys.add(`${parts.slice(1).join(" ")} ${parts[0]}`.trim());
    keys.add(`${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`.trim());
  }

  return Array.from(keys).filter(Boolean);
}

function round2(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.round((n + Number.EPSILON) * 100) / 100
    : 0;
}

function buildCandidateLookup(candidates) {
  const byUuid = new Map();
  const byNormalized = new Map();

  (candidates || []).forEach((c) => {
    if (c?.candidate_uuid) byUuid.set(c.candidate_uuid, c);

    buildNameKeys(c?.candidate_name).forEach((key) => {
      byNormalized.set(key, c);
    });
  });

  return { byUuid, byNormalized };
}

function findCandidateBase(lookup, parsedRow) {
  const rowUuid = String(parsedRow?.candidate_uuid || "").trim();
  if (rowUuid && lookup.byUuid.has(rowUuid)) return lookup.byUuid.get(rowUuid);

  for (const key of buildNameKeys(parsedRow?.candidate_name)) {
    if (lookup.byNormalized.has(key)) return lookup.byNormalized.get(key);
  }
  return null;
}

function calcNetProfit(base, row) {
  const n = (v) => {
    const x = Number(v);
    return Number.isNaN(x) ? 0 : x;
  };
  const VMS_RATE = 0.06;

  const reg = n(row?.reg_hours);
  const ot = n(row?.ot_hours);
  const hol = n(row?.holiday_hours);

  const w2 = n(base?.w2_rate);
  const stipend = n(base?.stipend_rate);
  const otPayRate = n(base?.ot_rate);
  const holidayPayRate = n(base?.holiday_rate || base?.ot_rate);

  const standardW2Amount = reg * w2;
  const otAmount = ot * otPayRate;
  const standardStipendAmount = reg * stipend;

  const clientStdRate = n(base?.client_standard_bill_rate ?? row?.reg_rate);
  const clientOtRate = n(base?.client_ot_bill_rate ?? row?.ot_rate);
  const clientHolRate = n(base?.client_holiday_bill_rate ?? row?.holiday_rate);

  const clientStandardAmount = reg * clientStdRate * (1 - VMS_RATE);
  const clientOtHolidayAmount =
    ot * (clientOtRate - VMS_RATE * clientOtRate) +
    hol * (clientHolRate - VMS_RATE * clientHolRate);
  const totalReceived = clientStandardAmount + clientOtHolidayAmount;

  const totalCandidateExpense =
    (standardW2Amount + otAmount) * 1.2 + standardStipendAmount;
  return round2(totalReceived - totalCandidateExpense);
}

export function createSupabaseFromEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env");
  }
  return createClient(url, key);
}

export async function getNetProfitReport({
  supabase = createSupabaseFromEnv(),
  mode = "range",
  fromDate = "",
  toDate = "",
  month,
  year,
} = {}) {
  let periodLabel = "";

  if (mode === "monthly") {
    const monthNum = Number(month);
    const yearNum = Number(year);
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new Error("month must be 1-12");
    }
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new Error("year must be between 2000 and 2100");
    }

    const from = new Date(Date.UTC(yearNum, monthNum - 1, 1));
    const to = new Date(Date.UTC(yearNum, monthNum, 0));
    fromDate = `${from.getUTCFullYear()}-${pad2(from.getUTCMonth() + 1)}-${pad2(
      from.getUTCDate()
    )}`;
    toDate = `${to.getUTCFullYear()}-${pad2(to.getUTCMonth() + 1)}-${pad2(
      to.getUTCDate()
    )}`;
    periodLabel = `${yearNum}-${pad2(monthNum)}`;
  } else if (mode === "range") {
    fromDate = String(fromDate || "");
    toDate = String(toDate || "");
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
      throw new Error("from_date and to_date are required in YYYY-MM-DD format");
    }
    if (fromDate > toDate) {
      throw new Error("from_date cannot be after to_date");
    }
    periodLabel = `${fromDate} to ${toDate}`;
  } else {
    throw new Error("mode must be either 'range' or 'monthly'");
  }

  const { data: rows, error } = await supabase
    .from("parsed_timesheet_rows")
    .select("*")
    .gte("end_date", fromDate)
    .lte("end_date", toDate)
    .order("end_date", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: candidates, error: cErr } = await supabase
    .from("candidate_data")
    .select(
      "candidate_uuid,candidate_name,w2_rate,stipend_rate,ot_rate,holiday_rate,sign_bonus,client_standard_bill_rate,client_ot_bill_rate,client_holiday_bill_rate"
    );
  if (cErr) throw new Error(cErr.message);

  const lookup = buildCandidateLookup(candidates || []);
  const byCandidate = new Map();

  (rows || []).forEach((row) => {
    const base = findCandidateBase(lookup, row);
    const candidateUuid = base?.candidate_uuid || row?.candidate_uuid || null;
    const candidateName =
      base?.candidate_name || String(row?.candidate_name || "").trim();
    const keyName = candidateUuid || `name:${normalizeName(candidateName)}`;
    const profit = calcNetProfit(base || {}, row);

    const prev = byCandidate.get(keyName) || {
      candidate_uuid: candidateUuid,
      candidate_name: candidateName,
      net_profit: 0,
    };
    prev.net_profit += Number(profit || 0);
    byCandidate.set(keyName, prev);
  });

  const reportRows = Array.from(byCandidate.values())
    .map((r) => ({
      ...r,
      net_profit: round2(r.net_profit),
    }))
    .sort((a, b) => String(a.candidate_name).localeCompare(String(b.candidate_name)));

  const totalNetProfit = round2(
    reportRows.reduce((sum, r) => sum + Number(r.net_profit || 0), 0)
  );

  return {
    report: mode === "monthly" ? "monthly_net_profit" : "period_net_profit",
    mode,
    from_date: fromDate,
    to_date: toDate,
    period_label: periodLabel,
    candidate_count: reportRows.length,
    rows: reportRows,
    total_net_profit: totalNetProfit,
  };
}
