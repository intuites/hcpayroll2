import Busboy from "busboy";

export const config = {
  api: {
    bodyParser: false,
  },
};

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

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function chooseMostFrequent(values) {
  if (!values.length) return 0;
  const counts = new Map();
  for (const v of values) {
    const key = round2(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let bestValue = values[values.length - 1];
  let bestCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestValue = value;
    }
  }
  return Number(bestValue) || 0;
}

function parseRowsFromRawText(rawText) {
  const text = String(rawText || "");
  if (!text.trim()) return [];

  const weekEndingMatch = text.match(/Week Ending\s*=\s*(\d{2}\/\d{2}\/\d{4})/i);
  const documentWeekEnding = weekEndingMatch?.[1] || "";
  const rows = [];
  const totalsRegex =
    /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Totals for \(Registrant\):\s*([A-Za-z][A-Za-z.'\- ]*,\s*[A-Za-z][A-Za-z.'\- ]*?)(?=\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?)/g;

  let totalsMatch;
  let previousTotalsEnd = 0;
  while ((totalsMatch = totalsRegex.exec(text)) !== null) {
    const regHours = toNumber(totalsMatch[1]);
    const otHours = toNumber(totalsMatch[2]);
    const name = String(totalsMatch[4] || "").trim();
    if (!name) continue;

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

    const w2Rate = chooseMostFrequent(regularRates);
    const otRate = chooseMostFrequent(otRates);
    const holidayRate = chooseMostFrequent(holidayRates) || otRate;

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

    let adjustedRegHours = round2(regHours);
    let adjustedHolidayHours = 0;
    let adjustedW2Rate = round2(w2Rate);
    let adjustedHolidayRate = round2(holidayRate);

    if (detailRows.length) {
      const baseRegRate = Math.min(...detailRows.map((r) => r.reg_rate));
      const premiumRows = detailRows.filter((r) => r.reg_rate > baseRegRate + 0.0001);
      const premiumHours = round2(
        premiumRows.reduce((sum, r) => sum + Number(r.reg_hours || 0), 0)
      );

      adjustedW2Rate = round2(baseRegRate || w2Rate);

      if (premiumHours > 0) {
        const premiumRates = premiumRows.map((r) => r.reg_rate);
        adjustedHolidayRate = round2(chooseMostFrequent(premiumRates) || holidayRate);
        adjustedHolidayHours = round2(Math.min(regHours, premiumHours));
        adjustedRegHours = round2(Math.max(0, Number(regHours || 0) - adjustedHolidayHours));
      }
    }

    rows.push({
      name,
      area,
      week_ending: documentWeekEnding,
      reg_hours: adjustedRegHours,
      w2_rate: adjustedW2Rate,
      ot_hours: round2(otHours),
      ot_rate: round2(otRate),
      holiday_rate: adjustedHolidayRate,
      holiday_hours: adjustedHolidayHours,
    });
  }

  return rows;
}

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

function normalizeRows(parsed) {
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  return entries
    .map((entry) => {
      const name = String(entry?.name || "").trim();
      if (!name) return null;

      const regHours = toNumber(entry?.reg_hours);
      const w2Rate = toNumber(entry?.reg_rate ?? entry?.w2_rate);
      const otHours = toNumber(entry?.ot_hours);
      const otRate = toNumber(entry?.ot_rate);
      const holidayRate = toNumber(entry?.holiday_rate);

      return {
        name,
        area: String(entry?.area || "").trim(),
        week_ending: String(entry?.week_ending || parsed?.week_ending || "").trim(),
        reg_hours: round2(regHours),
        w2_rate: round2(w2Rate),
        ot_hours: round2(otHours),
        ot_rate: round2(otRate),
        holiday_rate: round2(holidayRate || otRate),
        holiday_hours: 0,
      };
    })
    .filter(Boolean);
}

function isLowQualityExtraction(rows) {
  if (!Array.isArray(rows) || !rows.length) return true;
  let weak = 0;
  for (const r of rows) {
    const noHours = Number(r?.reg_hours || 0) === 0 && Number(r?.ot_hours || 0) === 0;
    const noRates =
      Number(r?.w2_rate || 0) === 0 &&
      Number(r?.ot_rate || 0) === 0 &&
      Number(r?.holiday_rate || 0) === 0;
    const noArea = !String(r?.area || "").trim();
    if (noHours || noRates || noArea) weak += 1;
  }
  return weak / rows.length >= 0.4;
}

async function parseWithOpenRouter(rawText) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { rows: [], reason: "OPENROUTER_API_KEY missing" };
  if (!rawText || !rawText.trim()) return { rows: [], reason: "No text extracted from PDF" };

  const promptText = rawText.slice(0, 12000);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-3.5-haiku",
      messages: [
        {
          role: "system",
          content: "Extract timesheet rows and return JSON only.",
        },
        {
          role: "user",
          content: `Extract fields: week_ending and entries[name, area, reg_hours, w2_rate, ot_hours, ot_rate, holiday_rate]. Return valid JSON only.
Timesheet text:
${promptText}`,
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { rows: [], reason: `OpenRouter failed: ${response.status} ${errText.slice(0, 120)}` };
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const jsonText = extractFirstJsonObject(content);
  if (!jsonText) return { rows: [], reason: "OpenRouter response had no valid JSON object" };

  try {
    const parsed = JSON.parse(jsonText);
    return { rows: normalizeRows(parsed), reason: null };
  } catch {
    return { rows: [], reason: "OpenRouter returned invalid JSON" };
  }
}

async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const files = [];
    const bb = Busboy({ headers: req.headers });

    bb.on("file", (_name, file, info) => {
      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        files.push({
          filename: info?.filename || "file.pdf",
          mimeType: info?.mimeType || "",
          buffer: Buffer.concat(chunks),
        });
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve(files));
    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const files = await parseMultipart(req);
    if (!files.length) {
      return res.status(400).json({ error: "No files were uploaded" });
    }

    if (typeof globalThis.DOMMatrix === "undefined") {
      try {
        const canvas = await import("@napi-rs/canvas");
        if (typeof canvas?.DOMMatrix === "function") globalThis.DOMMatrix = canvas.DOMMatrix;
        if (typeof canvas?.ImageData === "function" && typeof globalThis.ImageData === "undefined") {
          globalThis.ImageData = canvas.ImageData;
        }
        if (typeof canvas?.Path2D === "function" && typeof globalThis.Path2D === "undefined") {
          globalThis.Path2D = canvas.Path2D;
        }
      } catch {
        // If polyfill load fails, parser import may still work depending on runtime.
      }
    }

    let parserEngine = "pdfjs-dist-no-worker";
    const parsePdfBuffer = async (buffer) => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // Force bundlers to include the worker module in serverless output.
      await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      const task = pdfjs.getDocument({
        data: new Uint8Array(buffer),
      });
      const doc = await task.promise;
      let text = "";
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
        const page = await doc.getPage(pageNum);
        const tc = await page.getTextContent();
        const pageText = tc.items
          .map((i) => (Object.prototype.hasOwnProperty.call(i, "str") ? i.str : ""))
          .join(" ");
        text += `${pageText}\n`;
      }
      return {
        text,
        numpages: doc.numPages,
      };
    };

    const results = [];
    for (const file of files) {
      if (file.mimeType !== "application/pdf") {
        results.push({
          filename: file.filename,
          error: "Only PDF files are supported for text parsing",
        });
        continue;
      }

      try {
        if (!file.buffer || !file.buffer.length) {
          throw new Error("Uploaded PDF is empty");
        }
        const parsed = await parsePdfBuffer(file.buffer);
        const rawText = (parsed?.text || "").trim();
        let rows = parseRowsFromRawText(rawText);
        let parserNote = null;
        if (!rows.length) {
          const ai = await parseWithOpenRouter(rawText);
          if (ai.rows.length) {
            rows = ai.rows;
            parserNote = "Switched to AI extraction for better coverage.";
          } else {
            parserNote = ai.reason;
          }
        }

        results.push({
          filename: file.filename,
          pages: parsed?.numpages ?? null,
          rows,
          csv: buildCsv(rows),
          parser_note: parserNote ? `${parserNote} (${parserEngine})` : parserEngine,
        });
      } catch (err) {
        results.push({
          filename: file.filename,
          error: err?.message || "PDF parse failed",
        });
      }
    }

    return res.status(200).json({ files: results });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to parse timesheets" });
  }
}
