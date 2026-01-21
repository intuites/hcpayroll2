// import express from "express";
// import cors from "cors";
// import candidatesApi from "./api/candidates.js";
// import payrollApi from "./api/payroll.js";

// const app = express();

// // CORS configuration for file downloads
// const corsOptions = {
//   origin: "*",
//   methods: ["GET", "POST", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   exposedHeaders: ["Content-Disposition", "Content-Length", "Content-Type"]
// };

// app.use(cors(corsOptions));
// app.use(express.json());

// app.use("/api/candidates", candidatesApi);
// app.use("/api/payroll", payrollApi);

// app.listen(5000, () => {
//   console.log("Backend running on http://localhost:5000");
// });
// app.get("/", (req, res) => {
//   res.send("Healthcare Payroll API is running");
// });


import express from "express";
import cors from "cors";
import candidatesApi from "./api/candidates.js";
import payrollApi from "./api/payroll.js";
// import payrollGsheetApi from "./api/payrollGsheet.js";


const app = express();

/* ================= CORS CONFIG ================= */
const corsOptions = {
  origin: "*", // OK for development
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
// app.use("/api/payroll", payrollGsheetApi);

/* ================= START SERVER ================= */
const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
