import express from "express";
import multer from "multer";
import { createRequire } from "module";
import { supabase } from "../server/supabaseClient.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per file
});

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = "anthropic/claude-3.5-haiku";

const CSV_HEADERS = [
  "name",
  "area",
  "week_ending",                      
  "reg_hours",                                                                                           
  "w2_rate",
  "ot_hours",
  "ot_rate",
  "holiday_rate",
  "holiday_hours",
];

function extractFirstJsonObject(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function isIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function pad2(v) {
  return String(v).padStart(2, "0");
}

function round2Nullable(value) {
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
  const round = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
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
  const holidayAmount = hol * holidayPayRate;
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
  const netProfit = totalReceived - totalCandidateExpense;

  return round(netProfit);
}

async function buildParsedNetProfitSummary(rows) {
  const { data: candidates, error: candidatesError } = await supabase
    .from("candidate_data")
    .select(
      "candidate_uuid,candidate_name,w2_rate,stipend_rate,ot_rate,holiday_rate,sign_bonus,client_standard_bill_rate,client_ot_bill_rate,client_holiday_bill_rate"
    );
  if (candidatesError) {
    throw new Error(candidatesError.message);
  }

  const lookup = buildCandidateLookup(candidates || []);
  const byCandidate = new Map();

  (rows || []).forEach((row) => {
    const base = findCandidateBase(lookup, row);
    const candidateUuid = base?.candidate_uuid || row?.candidate_uuid || null;
    const candidateName =
      base?.candidate_name || String(row?.candidate_name || "").trim();
    const key = candidateUuid || `name:${normalizeName(candidateName)}`;
    const profit = calcNetProfit(base || {}, row);

    const prev = byCandidate.get(key) || {
      candidate_uuid: candidateUuid,
      candidate_name: candidateName,
      net_profit: 0,
    };
    prev.net_profit += Number(profit || 0);
    byCandidate.set(key, prev);
  });

  const reportRows = Array.from(byCandidate.values())
    .map((r) => ({
      ...r,
      net_profit: round2Nullable(r.net_profit),
    }))
    .sort((a, b) =>
      String(a.candidate_name).localeCompare(String(b.candidate_name))
    );

  const totalNetProfit = round2Nullable(
    reportRows.reduce((sum, r) => sum + Number(r.net_profit || 0), 0)
  );

  return {
    rows: reportRows,
    candidate_count: reportRows.length,
    total_net_profit: totalNetProfit,
  };
}

function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(rows) {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((header) => escapeCsvCell(row[header])).join(","));
  }
  return lines.join("\n");
}

function normalizeRows(parsed) {
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  return entries
    .map((entry) => {
      const name = String(entry?.name || "").trim();
      if (!name) return null;

      const reg_hours = toNumber(entry?.reg_hours);
      const w2_rate = toNumber(entry?.reg_rate ?? entry?.w2_rate);
      const ot_hours = toNumber(entry?.ot_hours);
      const ot_rate = toNumber(entry?.ot_rate);
      const holiday_rate = toNumber(entry?.holiday_rate);

      return {
        name,
        area: String(entry?.area || "").trim(),
        week_ending: String(
          entry?.week_ending || parsed?.week_ending || ""
        ).trim(),
        reg_hours: round2(reg_hours),
        w2_rate: round2(w2_rate),
        ot_hours: round2(ot_hours),
        ot_rate: round2(ot_rate),
        holiday_rate: round2(holiday_rate || ot_rate),
        holiday_hours: 0,
      };
    })
    .filter(Boolean);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRowsFromRawText(rawText) {
  const text = String(rawText || "");
  if (!text.trim()) return [];

  const weekEndingMatch = text.match(/Week Ending\s*=\s*(\d{2}\/\d{2}\/\d{4})/i);
  const documentWeekEnding = weekEndingMatch?.[1] || "";
  const rows = [];
  // Stable anchor across page breaks: totals line always carries final reg/ot per registrant.
  const totalsRegex =
    /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Totals for \(Registrant\):\s*([A-Za-z][A-Za-z.'\- ]*,\s*[A-Za-z][A-Za-z.'\- ]*?)(?=\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?)/g;

  let totalsMatch;
  let previousTotalsEnd = 0;
  while ((totalsMatch = totalsRegex.exec(text)) !== null) {
    const reg_hours = toNumber(totalsMatch[1]);
    const ot_hours = toNumber(totalsMatch[2]);
    const name = String(totalsMatch[4] || "").trim();
    if (!name) continue;

    // Parse only this registrant segment: from previous totals section to this totals section.
    const block = text.slice(previousTotalsEnd, totalsMatch.index);
    previousTotalsEnd = totalsMatch.index + totalsMatch[0].length;

    let area = "";
    const areaPattern = new RegExp(
      `${escapeRegex(name)}\\s+([^\\t\\n\\r]+?)\\s+\\d{2}\\/\\d{2}-\\d{2}\\/\\d{2}`,
      "g"
    );
    let areaMatch;
    while ((areaMatch = areaPattern.exec(block)) !== null) {
      area = String(areaMatch[1] || "").trim();
    }

    // Gather all rate lines in lookback block and choose best non-zero regular rate.
    const rateRegex =
      /Rate:\s*([\d.]+)\s+OT:\s*[\d.]+\s+Rate:\s*([\d.]+)\s+DBL:\s*[\d.]+\s+Rate:\s*([\d.]+)/g;
    const regularRates = [];
    const otRates = [];
    const holidayRates = [];
    let rateMatch;
    while ((rateMatch = rateRegex.exec(block)) !== null) {
      const reg = toNumber(rateMatch[1]);
      const ot = toNumber(rateMatch[2]);
      const hol = toNumber(rateMatch[3]);
      if (reg > 0) regularRates.push(reg);
      if (ot > 0) otRates.push(ot);
      if (hol > 0) holidayRates.push(hol);
    }

    const chooseMostFrequent = (arr) => {
      if (!arr.length) return 0;
      const counts = new Map();
      for (const v of arr) {
        const key = round2(v);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      let bestValue = arr[arr.length - 1];
      let bestCount = -1;
      for (const [value, count] of counts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestValue = value;
        }
      }
      return Number(bestValue) || 0;
    }; 

    const w2_rate = chooseMostFrequent(regularRates);
    const ot_rate = chooseMostFrequent(otRates);
    const holiday_rate = chooseMostFrequent(holidayRates) || ot_rate;

    // If some shifts are paid at a higher REG rate (e.g. holiday premium),
    // split those hours into holiday_hours and keep base rate as w2_rate.
    const detailRows = [];
    const regRatePairRegex = /Reg:\s*(-?\d+(?:\.\d+)?)\s+Rate:\s*([\d.]+)/g;
    let detailMatch;
    while ((detailMatch = regRatePairRegex.exec(block)) !== null) {
      const rowRegHours = toNumber(detailMatch[1]);
      const rowRegRate = toNumber(detailMatch[2]);
      if (rowRegHours > 0 && rowRegRate > 0) {
        detailRows.push({ reg_hours: rowRegHours, reg_rate: rowRegRate });
      }
    }
    if (!detailRows.length) {
      const fallbackDetailRegex =
        /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Rate:\s*([\d.]+)\s+OT:\s*(-?\d+(?:\.\d+)?)\s+Rate:\s*([\d.]+)\s+DBL:\s*(-?\d+(?:\.\d+)?)\s+Rate:\s*([\d.]+)/g;
      while ((detailMatch = fallbackDetailRegex.exec(block)) !== null) {
        const rowRegHours = toNumber(detailMatch[2]);
        const rowRegRate = toNumber(detailMatch[3]);
        if (rowRegHours > 0 && rowRegRate > 0) {
          detailRows.push({ reg_hours: rowRegHours, reg_rate: rowRegRate });
        }
      }
    }

    let adjustedRegHours = round2(reg_hours);
    let adjustedHolidayHours = 0;
    let adjustedW2Rate = round2(w2_rate);
    let adjustedHolidayRate = round2(holiday_rate);

    if (detailRows.length) {
      const baseRegRate = Math.min(...detailRows.map((r) => r.reg_rate));
      const premiumRows = detailRows.filter((r) => r.reg_rate > baseRegRate + 0.0001);
      const premiumHours = round2(
        premiumRows.reduce((sum, r) => sum + Number(r.reg_hours || 0), 0)
      );

      adjustedW2Rate = round2(baseRegRate || w2_rate);

      if (premiumHours > 0) {
        const premiumRates = premiumRows.map((r) => r.reg_rate);
        adjustedHolidayRate = round2(
          chooseMostFrequent(premiumRates) || holiday_rate
        );
        adjustedHolidayHours = round2(Math.min(reg_hours, premiumHours));
        adjustedRegHours = round2(
          Math.max(0, Number(reg_hours || 0) - adjustedHolidayHours)
        );
      }
    }

    rows.push({
      name,
      area,
      week_ending: documentWeekEnding,
      reg_hours: adjustedRegHours,
      w2_rate: adjustedW2Rate,
      ot_hours: round2(ot_hours),
      ot_rate: round2(ot_rate),
      holiday_rate: adjustedHolidayRate,
      holiday_hours: adjustedHolidayHours,
    });
  }

  return rows;
}

async function parseWithOpenRouter(rawText) {
  if (!rawText || !rawText.trim()) {
    return { rows: [], reason: "No extractable text found in PDF" };
  }

  if (!OPENROUTER_API_KEY) {
    return { rows: [], reason: "OPENROUTER_API_KEY is missing" };
  }

  const promptText = rawText.slice(0, 12000);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`, 
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Extract timesheet rows. Return JSON only.",
        },
        {
          role: "user",
          content: `Extract only these fields from the timesheet text:
- week_ending (single date for the document if present)
- entries: array of rows with name, area, reg_hours, w2_rate, ot_hours, ot_rate, holiday_rate

Rules:
- Return valid JSON only (no markdown, no prose).
- If a value is missing, use empty string for text and 0 for numbers.
- Keep numbers numeric, not strings.
- Do not include raw OCR text.

Output format:
{
  "week_ending": "MM/DD/YYYY or YYYY-MM-DD or empty",
  "entries": [
    {
      "name": "string",
      "area": "string",
      "reg_hours": 0,
      "w2_rate": 0,
      "ot_hours": 0,
      "ot_rate": 0,
      "holiday_rate": 0,
      "week_ending": "optional row-level date"
    }
  ]
}

Timesheet text:
${promptText}`,
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? null;
  const jsonText = extractFirstJsonObject(content);

  if (!jsonText) {
    return { rows: [], reason: "Parser returned invalid JSON format" };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { rows: [], reason: "Parser JSON could not be parsed" };
  }

  const rows = normalizeRows(parsed);
  return { rows, reason: null };
}

router.post("/parse", upload.array("files", 10), async (req, res) => {
  try {
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({ error: "No files were uploaded" });
    }

    const results = [];

    for (const file of files) {
      if (file.mimetype !== "application/pdf") {
        results.push({
          filename: file.originalname,
          error: "Only PDF files are supported for text parsing",
        });
        continue;
      }

      try {
        const parser = new PDFParse({ data: file.buffer });
        const parsed = await parser.getText();
        await parser.destroy();

        const rawText = (parsed?.text || "").trim();
        let rows = parseRowsFromRawText(rawText);
        let parserNote = null;

        if (!rows.length) {
          const ai = await parseWithOpenRouter(rawText);
          rows = ai.rows;
          parserNote = ai.reason;
        }

        results.push({
          filename: file.originalname,
          pages: parsed?.total ?? null,
          rows,
          csv: buildCsv(rows),
          parser_note: parserNote,
        });
      } catch (err) {
        results.push({
          filename: file.originalname,
          error: err.message,
        });
      }
    }

    return res.json({ files: results });
  } catch (err) {
    console.error("TIMESHEET PARSE ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.post("/save-parsed", async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ error: "rows are required" });
    }

    const tableName = String(req.body?.table_name || "parsed_timesheet_rows").trim();

    const { data: candidates, error: candidatesError } = await supabase
      .from("candidate_data")
      .select("candidate_uuid, candidate_name");
    if (candidatesError) {
      return res.status(500).json({ error: candidatesError.message });
    }

    const candidateLookup = new Map();
    (candidates || []).forEach((c) => {
      const key = normalizeName(c?.candidate_name);
      if (key) candidateLookup.set(key, c.candidate_uuid);
    });

    const payload = rows
      .map((row) => {
        const name = String(row?.name || "").trim();
        const endDate = toIsoDate(row?.end_date || row?.week_ending);
        const startDate = toIsoDate(row?.start_date) || (endDate ? addDaysIso(endDate, -6) : "");
        const candidateUuid = candidateLookup.get(normalizeName(name)) || null;

        if (!name || !startDate || !endDate) return null;

        return {
          candidate_uuid: candidateUuid,
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
      .select("candidate_name,start_date,end_date")
      .in("start_date", uniqueStartDates)
      .in("end_date", uniqueEndDates);

    if (existingError) {
      return res.status(400).json({ error: existingError.message });
    }

    const existingKeys = new Set(
      (existingRows || []).map((r) =>
        buildRowKey(r?.candidate_name, r?.start_date, r?.end_date)
      )
    );

    const rowsToInsert = dedupedPayload.filter(
      (r) => !existingKeys.has(buildRowKey(r.candidate_name, r.start_date, r.end_date))
    );

    if (!rowsToInsert.length) {
      return res.json({
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
            "RLS blocked insert on parsed_timesheet_rows. Fix SUPABASE_SERVICE_ROLE_KEY or add an INSERT policy.",
        });
      }
      return res.status(400).json({ error: msg });
    }

    return res.json({
      success: true,
      inserted_count: data?.length || rowsToInsert.length,
      skipped_duplicates: payload.length - rowsToInsert.length,
      table: tableName,
    });
  } catch (err) {
    console.error("SAVE PARSED ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/reports/weekly-net-profit", async (req, res) => {
  try {
    const weekEnding = String(req.query?.week_ending || "").trim();
    if (!isIsoDate(weekEnding)) {
      return res
        .status(400)
        .json({ error: "week_ending is required in YYYY-MM-DD format" });
    }

    const { data: rows, error } = await supabase
      .from("parsed_timesheet_rows")
      .select("*")
      .eq("end_date", weekEnding);

    if (error) return res.status(500).json({ error: error.message });

    const summary = await buildParsedNetProfitSummary(rows || []);

    return res.json({
      report: "weekly_net_profit",
      week_ending: weekEnding,
      candidate_count: summary.candidate_count,
      rows: summary.rows,
      total_net_profit: summary.total_net_profit,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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

    const { data: rows, error } = await supabase
      .from("parsed_timesheet_rows")
      .select("*")
      .gte("end_date", fromDate)
      .lte("end_date", toDate)
      .order("end_date", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const summary = await buildParsedNetProfitSummary(rows || []);

    return res.json({
      report: mode === "monthly" ? "monthly_net_profit" : "period_net_profit",
      mode,
      from_date: fromDate,
      to_date: toDate,
      period_label: periodLabel,
      candidate_count: summary.candidate_count,
      rows: summary.rows,
      total_net_profit: summary.total_net_profit,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;




