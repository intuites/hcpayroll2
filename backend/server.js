
import express from "express";
import cors from "cors";
import candidatesApi from "./api/candidates.js";
import payrollApi from "./api/payroll.js";

const app = express();

/* ================= CORS CONFIG ================= */
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition", "Content-Length", "Content-Type"]
};

app.use(cors(corsOptions));
app.use(express.json());

/* ================= ROUTES ================= */
app.get("/", (req, res) => {
  res.send("Healthcare Payroll API is running");
});

app.use("/api/candidates", candidatesApi);
app.use("/api/payroll", payrollApi);

/* ================= EXPORT FOR VERCEL ================= */
export default app;
