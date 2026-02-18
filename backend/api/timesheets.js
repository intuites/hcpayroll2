import express from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse";

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
    /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\r?\nTotals for \(Registrant\):\s*([^\n\r]+)/g;

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
    const detailRegex =
      /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Rate:\s*([\d.]+)\s+OT:\s*(-?\d+(?:\.\d+)?)\s+Rate:\s*([\d.]+)\s+DBL:\s*(-?\d+(?:\.\d+)?)\s+Rate:\s*([\d.]+)/g;
    const detailRows = [];
    let detailMatch;
    while ((detailMatch = detailRegex.exec(block)) !== null) {
      const rowRegHours = toNumber(detailMatch[2]);
      const rowRegRate = toNumber(detailMatch[3]);
      if (rowRegHours > 0 && rowRegRate > 0) {
        detailRows.push({ reg_hours: rowRegHours, reg_rate: rowRegRate });
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

export default router;
