import { getNetProfitReport } from "../../../lib/net-profit-service.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const mode = String(req.query?.mode || "range").toLowerCase();
    const report = await getNetProfitReport({
      mode,
      fromDate: req.query?.from_date,
      toDate: req.query?.to_date,
      month: req.query?.month,
      year: req.query?.year,
    });
    return res.status(200).json(report);
  } catch (err) {
    const message = err?.message || "Failed to load report";
    const status = /required|must be|cannot be after/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}
