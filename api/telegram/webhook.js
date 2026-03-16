import { getNetProfitReport } from "../../lib/net-profit-service.js";

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function pad2(v) {
  return String(v).padStart(2, "0");
}

function toIsoFromDmy(value) {
  const m = String(value || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const dd = m[1];
  const mm = m[2];
  const yyyy = m[3];
  const iso = `${yyyy}-${mm}-${dd}`;
  return isIsoDate(iso) ? iso : null;
}

function normalizeDateToken(value) {
  const raw = String(value || "").trim();
  if (isIsoDate(raw)) return raw;
  return toIsoFromDmy(raw);
}

function formatDmy(iso) {
  if (!isIsoDate(iso)) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseDateRangeInput(text) {
  const input = String(text || "").trim();
  const commandMatch = input.match(
    /^\/netprofit(?:@\w+)?\s+([0-9-]{10})\s+(?:to\s+)?([0-9-]{10})$/i
  );
  if (commandMatch) {
    const fromDate = normalizeDateToken(commandMatch[1]);
    const toDate = normalizeDateToken(commandMatch[2]);
    if (fromDate && toDate) return { fromDate, toDate };
  }

  const genericMatch = input.match(/([0-9-]{10})\s*(?:to)\s*([0-9-]{10})/i);
  if (genericMatch) {
    const fromDate = normalizeDateToken(genericMatch[1]);
    const toDate = normalizeDateToken(genericMatch[2]);
    if (fromDate && toDate) return { fromDate, toDate };
  }
  return null;
}

function formatCurrency(value) {
  const n = Number(value || 0);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(safe);
}

function getWebhookUrl(req) {
  const proto =
    req.headers["x-forwarded-proto"] ||
    (String(req.headers.host || "").includes("localhost") ? "http" : "https");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}/api/telegram/webhook`;
}

async function telegramApi(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API ${method} failed: ${response.status} ${text}`);
  }
}

async function telegramGet(token, method) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "GET",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.description || `Telegram API ${method} failed: ${response.status}`
    );
  }
  return data?.result;
}

async function sendMessage(token, chatId, text, extra = {}) {
  return telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...extra,
  });
}

async function trySendMessage(token, chatId, text, extra = {}) {
  try {
    await sendMessage(token, chatId, text, extra);
    return { ok: true };
  } catch (error) { 
    console.error("TELEGRAM_SEND_MESSAGE_ERROR", {
      chat_id: chatId,
      text_preview: String(text || "").slice(0, 120),
      error: error?.message || String(error),
    });
    return { ok: false, error: error?.message || "sendMessage failed" };
  }
}

async function fetchNetProfitReport(fromDate, toDate) {
  return getNetProfitReport({
    mode: "range",
    fromDate,
    toDate,
  });
}

async function ensureTelegramWebhook(req, token) {
  const targetUrl = getWebhookUrl(req);
  const info = await telegramGet(token, "getWebhookInfo");
  const currentUrl = String(info?.url || "").trim();

  if (currentUrl === targetUrl) {
    return { ok: true, changed: false, url: currentUrl };
  }

  await telegramGet(
    token,
    `setWebhook?url=${encodeURIComponent(targetUrl)}`
  );
  return { ok: true, changed: true, url: targetUrl, previous_url: currentUrl || null };
}

function buildReportMessage(report) {
  const rows = Array.isArray(report?.rows) ? [...report.rows] : [];
  const rankedRows = rows.sort(
    (a, b) => Number(b?.net_profit || 0) - Number(a?.net_profit || 0)
  );

  const lines = [
    "<b>Net Profit Report</b>",
    `Period: <b>${formatDmy(report?.from_date || "-")} to ${formatDmy(
      report?.to_date || "-"
    )}</b>`,
    `Candidates: <b>${Number(report?.candidate_count || 0)}</b>`,
    `Total Net Profit: <b>${formatCurrency(report?.total_net_profit)}</b>`,
  ];

  if (rankedRows.length) {
    const maxMessageLength = 3800;
    const candidateLines = [];

    for (const [idx, row] of rankedRows.entries()) {
      const name = escapeHtml(String(row?.candidate_name || "Unknown"));
      const line = `${idx + 1}. ${name} - ${formatCurrency(row?.net_profit)}`;
      const projectedLength = [...lines, "", "<b>Candidates by Net Profit:</b>", ...candidateLines, line].join(
        "\n"
      ).length;
      if (projectedLength > maxMessageLength) break;
      candidateLines.push(line);
    }

    lines.push("");
    lines.push("<b>Candidates by Net Profit:</b>");
    lines.push(...candidateLines);

    const remaining = rankedRows.length - candidateLines.length;
    if (remaining > 0) {
      lines.push(`...and ${remaining} more candidate${remaining === 1 ? "" : "s"}.`);
    }
  }

  return lines.join("\n");
}

function isPromptReply(message) {
  const replyText = String(message?.reply_to_message?.text || "");
  return /enter custom date range/i.test(replyText);
}

function isAllowedChat(chatId) {
  const allow = String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || "").trim();
  if (!allow) return true;
  const list = allow
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return list.includes(String(chatId));
}

function isoToKey(iso) {
  return isIsoDate(iso) ? iso.replaceAll("-", "") : "00000000";
}

function keyToIso(key) {
  const k = String(key || "");
  if (!/^\d{8}$/.test(k) || k === "00000000") return null;
  const iso = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
  return isIsoDate(iso) ? iso : null;
}

function ymToYearMonth(ym) {
  const v = String(ym || "");
  if (!/^\d{6}$/.test(v)) return null;
  const year = Number(v.slice(0, 4));
  const month = Number(v.slice(4, 6));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function yearMonthToYm(year, month) {
  return `${year}${pad2(month)}`;
}

function shiftYm(ym, deltaMonths) {
  const parsed = ymToYearMonth(ym);
  if (!parsed) return null;
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1 + deltaMonths, 1));
  return yearMonthToYm(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

function monthLabel(ym) {
  const parsed = ymToYearMonth(ym);
  if (!parsed) return "Month";
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monFirstWeekday(year, month) {
  const js = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 Sun..6 Sat
  return (js + 6) % 7; // 0 Mon..6 Sun
}

function buildNpData(state, action) {
  return `np|${state.step}|${state.ym}|${state.from}|${state.to}|${action}`;
}

function parseNpData(data) {
  const raw = String(data || "");
  if (raw === "np|noop") return { noop: true };
  const parts = raw.split("|");
  if (parts.length !== 6 || parts[0] !== "np") return null;
  const step = parts[1] === "t" ? "t" : "f";
  const ym = /^\d{6}$/.test(parts[2]) ? parts[2] : null;
  const from = /^\d{8}$/.test(parts[3]) ? parts[3] : "00000000";
  const to = /^\d{8}$/.test(parts[4]) ? parts[4] : "00000000";
  const action = String(parts[5] || "");
  if (!ym) return null;
  return { step, ym, from, to, action };
}

function initialCalendarState() {
  const now = new Date();
  return {
    step: "f",
    ym: yearMonthToYm(now.getUTCFullYear(), now.getUTCMonth() + 1),
    from: "00000000",
    to: "00000000",
  };
}

function buildCalendarText(state) {
  const fromIso = keyToIso(state.from);
  const toIso = keyToIso(state.to);
  const stepText = state.step === "f" ? "From Date" : "To Date";
  return [
    "<b>Select Date Range</b>",
    `Step: <b>${stepText}</b>`,
    `From: <b>${formatDmy(fromIso)}</b>`,
    `To: <b>${formatDmy(toIso)}</b>`,
    "",
    "Tap dates from calendar.",
  ].join("\n");
}

function buildCalendarKeyboard(state) {
  const parsed = ymToYearMonth(state.ym);
  if (!parsed) return { inline_keyboard: [] };

  const fromIso = keyToIso(state.from);
  const toIso = keyToIso(state.to);
  const fromKey = state.from;
  const toKey = state.to;
  const totalDays = daysInMonth(parsed.year, parsed.month);
  const startOffset = monFirstWeekday(parsed.year, parsed.month);
  const prevYm = shiftYm(state.ym, -1) || state.ym;
  const nextYm = shiftYm(state.ym, 1) || state.ym;

  const keyboard = [
    [
  { text: "<", callback_data: buildNpData(state, "p") },
  { text: monthLabel(state.ym), callback_data: "np|noop" },
  { text: ">", callback_data: buildNpData(state, "n") },
],
    [
      { text: "Mo", callback_data: "np|noop" },
      { text: "Tu", callback_data: "np|noop" },
      { text: "We", callback_data: "np|noop" },
      { text: "Th", callback_data: "np|noop" },
      { text: "Fr", callback_data: "np|noop" },
      { text: "Sa", callback_data: "np|noop" },
      { text: "Su", callback_data: "np|noop" },
    ],
  ];

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let d = 1; d <= totalDays; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  for (let i = 0; i < cells.length; i += 7) {
    const row = [];
    for (let j = 0; j < 7; j += 1) {
      const day = cells[i + j];
      if (!day) {
        row.push({ text: " ", callback_data: "np|noop" });
        continue;
      }

      const iso = `${parsed.year}-${pad2(parsed.month)}-${pad2(day)}`;
      const key = isoToKey(iso);

      let text = String(day);
      if (key === fromKey && key === toKey && key !== "00000000") text = `[${day}]`;
      else if (key === fromKey && key !== "00000000") text = `F${day}`;
      else if (key === toKey && key !== "00000000") text = `T${day}`;
      else if (fromIso && toIso && key > fromKey && key < toKey) text = `.${day}`;

      row.push({
        text,
        callback_data: buildNpData(state, `d${pad2(day)}`),
      });
    }
    keyboard.push(row);
  }

  keyboard.push([
    { text: "Pick From", callback_data: buildNpData({ ...state, step: "f" }, "sf") },
    { text: "Pick To", callback_data: buildNpData({ ...state, step: "t" }, "st") },
  ]);

  const lastRow = [{ text: "Clear", callback_data: buildNpData(initialCalendarState(), "c") }];
  if (fromIso && toIso) {
    lastRow.push({ text: "Run Report", callback_data: buildNpData(state, "r") });
  }
  keyboard.push(lastRow);
  keyboard.push([{ text: "Cancel", callback_data: buildNpData(state, "x") }]);

  return { inline_keyboard: keyboard };
}

async function openCalendar(token, chatId) {
  const state = initialCalendarState();
  return trySendMessage(token, chatId, buildCalendarText(state), {
    parse_mode: "HTML",
    reply_markup: buildCalendarKeyboard(state),
  });
}

async function answerCallback(token, callbackQueryId, text = "") {
  try {
    await telegramApi(token, "answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    });
  } catch (error) {
    console.error("TELEGRAM_ANSWER_CALLBACK_ERROR", error?.message || String(error));
  }
}

async function editCalendarMessage(token, callbackQuery, state, notice = "") {
  if (!callbackQuery?.message?.chat?.id || !callbackQuery?.message?.message_id) return;
  try {
    await telegramApi(token, "editMessageText", {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      text: buildCalendarText(state),
      parse_mode: "HTML",
      reply_markup: buildCalendarKeyboard(state),
    });
  } catch (error) {
    console.error("TELEGRAM_EDIT_CALENDAR_ERROR", {
      chat_id: callbackQuery?.message?.chat?.id,
      message_id: callbackQuery?.message?.message_id,
      error: error?.message || String(error),
    });
  }
  if (notice) {
    await answerCallback(token, callbackQuery.id, notice);
  } else {
    await answerCallback(token, callbackQuery.id);
  }
}

async function closeCalendarMessage(token, callbackQuery, text) {
  if (!callbackQuery?.message?.chat?.id || !callbackQuery?.message?.message_id) return;
  try {
    await telegramApi(token, "editMessageText", {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      text,
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("TELEGRAM_CLOSE_CALENDAR_ERROR", {
      chat_id: callbackQuery?.message?.chat?.id,
      message_id: callbackQuery?.message?.message_id,
      error: error?.message || String(error),
    });
  }
}

async function handleCalendarCallback(token, callbackQuery) {
  const chatId = callbackQuery?.message?.chat?.id;
  const data = parseNpData(callbackQuery?.data);
  if (!chatId || !data) {
    await answerCallback(token, callbackQuery?.id, "Unsupported action");
    return;
  }
  if (data.noop) {
    await answerCallback(token, callbackQuery?.id);
    return;
  }

  const state = {
    step: data.step,
    ym: data.ym,
    from: data.from,
    to: data.to,
  };
  const action = data.action;

  if (action === "p" || action === "n" || action === "sf" || action === "st" || action === "c") {
    if (action === "p") state.ym = shiftYm(state.ym, -1) || state.ym;
    if (action === "n") state.ym = shiftYm(state.ym, 1) || state.ym;
    if (action === "sf") state.step = "f";
    if (action === "st") state.step = "t";
    if (action === "c") {
      const clean = initialCalendarState();
      state.step = clean.step;
      state.ym = clean.ym;
      state.from = clean.from;
      state.to = clean.to;
    }
    await editCalendarMessage(token, callbackQuery, state);
    return;
  }

  if (action === "x") {
    await closeCalendarMessage(token, callbackQuery, "<b>Date selection cancelled.</b>");
    await answerCallback(token, callbackQuery.id);
    return;
  }

  if (/^d\d{2}$/.test(action)) {
    const day = Number(action.slice(1));
    const ymParsed = ymToYearMonth(state.ym);
    if (!ymParsed) {
      await answerCallback(token, callbackQuery.id, "Invalid month");
      return;
    }
    const dim = daysInMonth(ymParsed.year, ymParsed.month);
    if (day < 1 || day > dim) {
      await answerCallback(token, callbackQuery.id, "Invalid day");
      return;
    }
    const selectedIso = `${ymParsed.year}-${pad2(ymParsed.month)}-${pad2(day)}`;
    const selectedKey = isoToKey(selectedIso);

    if (state.step === "f") {
      state.from = selectedKey;
      if (state.to !== "00000000" && state.to < state.from) {
        state.to = "00000000";
      }
      state.step = "t";
      await editCalendarMessage(token, callbackQuery, state, "From date selected");
      return;
    }

    if (state.from === "00000000") {
      state.from = selectedKey;
      state.step = "t";
      await editCalendarMessage(token, callbackQuery, state, "From date selected");
      return;
    }
    if (selectedKey < state.from) {
      await answerCallback(token, callbackQuery.id, "To date must be on/after From date");
      return;
    }
    state.to = selectedKey;
    await editCalendarMessage(token, callbackQuery, state, "To date selected");
    return;
  }

  if (action === "r") {
    const fromDate = keyToIso(state.from);
    const toDate = keyToIso(state.to);
    if (!fromDate || !toDate) {
      await answerCallback(token, callbackQuery.id, "Select both From and To dates");
      return;
    }
    if (fromDate > toDate) {
      await answerCallback(token, callbackQuery.id, "Invalid range");
      return;
    }

    await closeCalendarMessage(
      token,
      callbackQuery,
      `<b>Loading report for ${formatDmy(fromDate)} to ${formatDmy(toDate)}...</b>`
    );
    await answerCallback(token, callbackQuery.id);

    try {
      const report = await fetchNetProfitReport(fromDate, toDate);
      await trySendMessage(token, chatId, buildReportMessage(report), {
        parse_mode: "HTML",
      });
    } catch (error) {
      console.error("NET_PROFIT_REPORT_ERROR", {
        from_date: fromDate,
        to_date: toDate,
        error: error?.message || String(error),
      });
      await trySendMessage(
        token,
        chatId,
        `Could not load net profit report for ${formatDmy(fromDate)} to ${formatDmy(
          toDate
        )}.`
      );
    }
    return;
  }

  await answerCallback(token, callbackQuery.id);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!token) return res.status(500).json({ error: "Missing TELEGRAM_BOT_TOKEN" });

  if (req.method === "GET") {
    try {
      if (String(req.query?.ensure_webhook || "") === "1") {
        const result = await ensureTelegramWebhook(req, token);
        return res.status(200).json({ ok: true, route: "telegram-webhook", ...result });
      }

      const info = await telegramGet(token, "getWebhookInfo");
      return res.status(200).json({
        ok: true,
        route: "telegram-webhook",
        target_url: getWebhookUrl(req),
        webhook_info: info,
      });
    } catch (error) {
      console.error("TELEGRAM_WEBHOOK_GET_ERROR", error?.message || String(error));
      return res.status(500).json({
        ok: false,
        error: error?.message || "Failed to inspect Telegram webhook",
      });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const update = req.body || {};
    const callbackQuery = update?.callback_query;

    if (callbackQuery) {
      const chatId = callbackQuery?.message?.chat?.id;
      if (chatId && !isAllowedChat(chatId)) {
        await answerCallback(token, callbackQuery.id, "Chat not authorized");
        return res.status(200).json({ ok: true, denied: true });
      }
      await handleCalendarCallback(token, callbackQuery);
      return res.status(200).json({ ok: true, callback: true });
    }

    const message = update?.message;
    const text = String(message?.text || "").trim();
    const chatId = message?.chat?.id;

    if (!message || !chatId) return res.status(200).json({ ok: true, ignored: true });
    if (!isAllowedChat(chatId)) {
      await trySendMessage(token, chatId, "This chat is not authorized for this bot.");
      return res.status(200).json({ ok: true, denied: true });
    }

    if (/^\/start(?:@\w+)?$/i.test(text)) {
      await trySendMessage(
        token,
        chatId,
        "Use /netprofit and pick dates from the calendar UI.",
        {
          reply_markup: {
            keyboard: [[{ text: "/netprofit" }]],
            resize_keyboard: true,
          },
        }
      );
      return res.status(200).json({ ok: true });
    }

    if (/^\/id(?:@\w+)?$/i.test(text)) {
      await trySendMessage(token, chatId, `Chat ID: ${chatId}`);
      return res.status(200).json({ ok: true, chat_id: chatId });
    }

    if (/^\/netprofit(?:@\w+)?$/i.test(text)) {
      await openCalendar(token, chatId);
      return res.status(200).json({ ok: true });
    }

    const parsed = parseDateRangeInput(text);
    if (parsed && (isPromptReply(message) || /^\/netprofit/i.test(text))) {
      const { fromDate, toDate } = parsed;
      if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
        await trySendMessage(
          token,
          chatId,
          "Invalid date format. Use:\n01-01-2026 to 31-01-2026"
        );
        return res.status(200).json({ ok: true });
      }
      if (fromDate > toDate) {
        await trySendMessage(token, chatId, "From date cannot be after To date.");
        return res.status(200).json({ ok: true });
      }

      await trySendMessage(token, chatId, "Loading net profit report...");
      try {
        const report = await fetchNetProfitReport(fromDate, toDate);
        await trySendMessage(token, chatId, buildReportMessage(report), {
          parse_mode: "HTML",
        });
      } catch (error) {
        console.error("NET_PROFIT_REPORT_ERROR", {
          from_date: fromDate,
          to_date: toDate,
          error: error?.message || String(error),
        });
        await trySendMessage(
          token,
          chatId,
          `Could not load net profit report for ${formatDmy(fromDate)} to ${formatDmy(
            toDate
          )}.`
        );
      }
      return res.status(200).json({ ok: true });
    }

    if (/^\/netprofit(?:@\w+)?\b/i.test(text)) {
      await trySendMessage(
        token,
        chatId,
        "Tap /netprofit and use the calendar. Typing is optional."
      );
    }

    return res.status(200).json({ ok: true, ignored: true });
  } catch (error) {
    console.error("TELEGRAM_WEBHOOK_ERROR", error?.message || String(error));
    return res.status(200).json({ ok: true, handled_error: true });
  }
}
