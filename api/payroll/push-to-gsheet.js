import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    // use GSHEET_ID, client_email, private_key from env
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
