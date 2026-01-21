import candidatesApi from "../backend/api/candidates.js";

export default function handler(req, res) {
  return candidatesApi(req, res);
}
