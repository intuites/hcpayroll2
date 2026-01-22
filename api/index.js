export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    message: "HC Payroll API is running on Vercel"
  });
}
