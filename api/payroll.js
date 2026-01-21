import payrollApi from "../backend/api/payroll.js";

export default function handler(req, res) {
  return payrollApi(req, res);
}
