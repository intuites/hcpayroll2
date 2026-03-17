import { createClient } from "@supabase/supabase-js";

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
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

function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1]}-${slash[2]}`;
  return "";
}

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildRowKey(name, startDate, endDate) {
  return `${normalizeName(name)}|${startDate}|${endDate}`;
}

function buildRowFingerprint(row) {
  return [
    buildRowKey(row?.candidate_name, row?.start_date, row?.end_date),
    toNumber(row?.reg_hours),
    toNumber(row?.ot_hours),
    toNumber(row?.holiday_hours),
    toNumber(row?.reg_rate),
    toNumber(row?.ot_rate),
    toNumber(row?.holiday_rate),
  ].join("|");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) return res.status(500).json({ error: "Missing Supabase env" });
    const supabase = createClient(url, key);

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: "rows are required" });

    const tableName = String(req.body?.table_name || "parsed_timesheet_rows").trim();

    const { data: candidates, error: candidatesError } = await supabase
      .from("candidate_data")
      .select("candidate_uuid, candidate_name");
    if (candidatesError) return res.status(500).json({ error: candidatesError.message });

    const candidateLookup = new Map();
    (candidates || []).forEach((c) => {
      buildNameKeys(c?.candidate_name).forEach((keyName) => {
        candidateLookup.set(keyName, c.candidate_uuid);
      });
    });

    const payload = rows
      .map((row) => {
        const name = String(row?.name || "").trim();
        const endDate = toIsoDate(row?.end_date || row?.week_ending);
        const startDate = toIsoDate(row?.start_date) || (endDate ? addDaysIso(endDate, -6) : "");
        if (!name || !startDate || !endDate) return null;

        return {
          candidate_uuid:
            buildNameKeys(name)
              .map((key) => candidateLookup.get(key))
              .find(Boolean) || null,
          candidate_name: name,
          start_date: startDate,
          end_date: endDate,
          reg_hours: toNumber(row?.reg_hours),
          ot_hours: toNumber(row?.ot_hours),
          holiday_hours: toNumber(row?.holiday_hours),
          reg_rate: toNumber(row?.w2_rate ?? row?.reg_rate),
          ot_rate: toNumber(row?.ot_rate),
          holiday_rate: toNumber(row?.holiday_rate),
        };
      })
      .filter(Boolean);

    if (!payload.length) {
      return res.status(400).json({
        error: "No valid rows to save. Ensure each row has name, start_date, end_date",
      });
    }

    // Deduplicate within request first
    const dedupedMap = new Map();
    payload.forEach((row) => {
      dedupedMap.set(
        buildRowKey(row.candidate_name, row.start_date, row.end_date),
        row
      );
    });
    const dedupedPayload = Array.from(dedupedMap.values());
    const uniqueStartDates = [...new Set(dedupedPayload.map((r) => r.start_date))];
    const uniqueEndDates = [...new Set(dedupedPayload.map((r) => r.end_date))];

    // Skip rows that already exist in DB
    const { data: existingRows, error: existingError } = await supabase
      .from(tableName)
      .select(
        "candidate_name,start_date,end_date,reg_hours,ot_hours,holiday_hours,reg_rate,ot_rate,holiday_rate"
      )
      .in("start_date", uniqueStartDates)
      .in("end_date", uniqueEndDates);

    if (existingError) {
      return res.status(400).json({ error: existingError.message });
    }

    const existingKeys = new Set((existingRows || []).map((r) => buildRowKey(r?.candidate_name, r?.start_date, r?.end_date)));
    const existingFingerprints = new Set(
      (existingRows || []).map((r) => buildRowFingerprint(r))
    );

    const rowsToInsert = dedupedPayload.filter(
      (r) =>
        !existingKeys.has(buildRowKey(r.candidate_name, r.start_date, r.end_date)) &&
        !existingFingerprints.has(buildRowFingerprint(r))
    );

    if (!rowsToInsert.length) {
      return res.status(200).json({
        success: true,
        inserted_count: 0,
        skipped_duplicates: payload.length,
        table: tableName,
      });
    }

    const { data, error } = await supabase
      .from(tableName)
      .insert(rowsToInsert)
      .select("id");

    if (error) {
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("row-level security")) {
        return res.status(400).json({
          error:
            "RLS blocked insert on parsed_timesheet_rows. Use SUPABASE_SERVICE_ROLE_KEY in API env or add an INSERT policy for your role.",
        });
      }
      return res.status(400).json({ error: msg });
    }

    return res.status(200).json({
      success: true,
      inserted_count: data?.length || rowsToInsert.length,
      skipped_duplicates: payload.length - rowsToInsert.length,
      table: tableName,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to save parsed rows" });
  }
}


