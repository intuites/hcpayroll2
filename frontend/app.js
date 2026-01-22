const API_URL = window.location.origin + "/api";
const candidateList = document.getElementById("candidateList");
const generateBtn = document.getElementById("generateBtn");
const fromDateInput = document.getElementById("fromDate");
const toDateInput = document.getElementById("toDate");
const previewContainer = document.getElementById("payrollPreview");
/* ================= TOGGLE PAYROLL ================= */
const toggleBtn = document.getElementById("togglePayroll");
const payrollCard = document.getElementById("payrollCard");

let payrollRows = [];
let previewTimer = null;

/* ================= UTIL ================= */
function parseNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/* ================= EDITABLE FIELDS ================= */
const EDITABLE_FIELDS = [
  "reg_hours",
  "ot_hours",
  "holiday_hours",

  "w2_rate",
  "stipend_rate",
  "ot_rate",
  "holiday_rate",

  "sign_bonus",

  "client_standard_bill_rate",
  "client_ot_bill_rate",
  "client_holiday_bill_rate",

  "total_candidate_expense",

  "missed_payment_amount",
  "missed_payment_type",
];

/* ================= HELPERS ================= */
function formatPayrollName(from, to) {
  return `payroll_${from}_${to}`;
}

function formatDateMMDDYYYY(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";

  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${mm}-${dd}-${yyyy}`;
}

/* ================= Show / Hide Functionality ================= */
if (toggleBtn && payrollCard) {
  // ensure correct initial button text
  toggleBtn.textContent = "Generate Payroll";

  toggleBtn.addEventListener("click", () => {
    const isHidden =
      payrollCard.style.display === "none" ||
      getComputedStyle(payrollCard).display === "none";

    payrollCard.style.display = isHidden ? "block" : "none";
    toggleBtn.textContent = isHidden ? "Hide Payroll" : "Generate Payroll";
  });
}

function updateGenerateState() {
  const hasFrom = !!fromDateInput.value;
  const hasTo = !!toDateInput.value;

  generateBtn.disabled = !(hasFrom && hasTo);
}

fromDateInput.addEventListener("change", updateGenerateState);
toDateInput.addEventListener("change", updateGenerateState);

// initial load
updateGenerateState();

// function updateGenerateState() {
//   generateBtn.disabled = !fromDateInput.value || !toDateInput.value;
// }

// fromDateInput.addEventListener("change", updateGenerateState);
// toDateInput.addEventListener("change", updateGenerateState);
// updateGenerateState();

/* ================= LOAD CANDIDATES ================= */
async function loadCandidates() {
  const res = await fetch(`${API_URL}/candidates`);
  const candidates = await res.json();
  candidateList.innerHTML = "";

  candidates.forEach((c) => {
    // const card = document.createElement("div");
    // card.className = "candidate-card";
    const card = document.createElement("div");
    card.className = "candidate-card";
    card.innerHTML = ``;
    candidateList.appendChild(card);
    candidateList.innerHTML = `
  <table>
    <thead>
      <tr>
        <th></th>
        <th>Name</th>
        <th>Reg</th>
        <th>OT</th>
        <th>Holiday</th>
      </tr>
    </thead>
    <tbody>
      ${candidates
        .map(
          (c) => `
        <tr>
          <td>
            <input
              type="checkbox"
              class="candidate-checkbox"
              value="${c.candidate_uuid}"
            />
          </td>
          <td class="candidate-name">${c.candidate_name}</td>
          <td><input type="number" class="reg_hours" value="0" step="0.5" /></td>
          <td><input type="number" class="ot_hours" value="0" step="0.5" /></td>
          <td><input type="number" class="holiday_hours" value="0" step="0.5" /></td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>
`;

    candidateList.appendChild(card);
  });
}

generateBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  const candidates = [];

  if (!fromDateInput.value || !toDateInput.value) {
    alert("Please select Start Date and End Date");
    return;
  }

  if (new Date(fromDateInput.value) > new Date(toDateInput.value)) {
    alert("End Date cannot be before Start Date");
    return;
  }

  document.querySelectorAll(".candidate-checkbox:checked").forEach((cb) => {
    const row = cb.closest("tr"); // ✅ FIX

    if (!row) return;

    candidates.push({
      id: cb.value,
      reg_hours: parseNumberOrNull(row.querySelector(".reg_hours")?.value),
      ot_hours: parseNumberOrNull(row.querySelector(".ot_hours")?.value),
      holiday_hours: parseNumberOrNull(
        row.querySelector(".holiday_hours")?.value
      ),
    });
  });

  if (!candidates.length) {
    alert("Select at least one candidate");
    return;
  }

  const res = await fetch(`${API_URL}/payroll/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates }),
  });

  const data = await res.json();

  if (!res.ok || !Array.isArray(data.rows)) {
    console.error("Preview error:", data);
    alert("Payroll preview failed");
    return;
  }

  payrollRows = data.rows;
  renderPayrollTable();
});

/* ================= TABLE ================= */

function renderPayrollTable() {
  const headers = [
    ["candidate_name", "NAME"],
    ["total_hours", "TOTAL"],
    ["reg_hours", "REG"],
    ["ot_hours", "OT"],
    ["holiday_hours", "HOL"],

    ["w2_rate", "W2"],
    ["stipend_rate", "STIPEND"],
    ["ot_rate", "OT RATE"],
    ["holiday_rate", "HOL RATE"],

    ["guaranteed", "GUAR"],
    ["standard_w2_amount", "STD W2"],
    ["ot_amount", "OT AMT"],
    ["holiday_amount", "HOL AMT"],
    ["sign_bonus", "BONUS"],
    ["overall_bonus", "OVERALL"],

    ["total_pay", "GUSTO PAY"],
    ["standard_stipend_amount", "STIPEND AMT"],
    ["total_payable", "TOTAL PAYABLE"],

    ["missed_payment_amount", "MISSED AMT"],
    ["missed_payment_type", "MISSED TYPE"],

    ["total_candidate_expense", "CANDIDATE EXP"],

    ["client_standard_bill_rate", "CLIENT STD"],
    ["vms_charges", "VMS"],
    ["client_standard_amount", "CLIENT STD AMT"],
    ["client_ot_bill_rate", "CLIENT OT"],
    ["client_holiday_bill_rate", "CLIENT HOL"],
    ["client_ot_holiday_amount", "OT/HOL AMT"],
    ["total_amount_received_from_client", "RECEIVED"],
    ["net_profit", "NET PROFIT"],
  ];

  previewContainer.innerHTML = `
    <div class="payroll-table-wrapper">
      <table class="payroll-table">
        <thead>
          <tr>
            ${headers.map((h) => `<th>${h[1]}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${payrollRows
            .map(
              (row, r) => `
              <tr>
                ${headers
                  .map(
                    ([key]) => `
                    <td
                      data-row="${r}"
                      data-key="${key}"
                      class="${
                        EDITABLE_FIELDS.includes(key) ? "editable" : "readonly"
                      }"
                      ${
                        key !== "missed_payment_type" &&
                        EDITABLE_FIELDS.includes(key)
                          ? 'contenteditable="true"'
                          : ""
                      }
                    >
                      ${
                        key === "missed_payment_type"
                          ? renderMissedType(row[key])
                          : row[key] ?? ""
                      }
                    </td>
                  `
                  )
                  .join("")}
              </tr>
            `
            )
            .join("")} 
        </tbody>
      </table>
    </div>

    <div class="payroll-footer">
  <div class="payroll-actions">
    <button id="saveBtn" class="btn primary">Save Payroll</button>
    <button id="pushBtn" class="btn secondary">Download Payroll</button>
  </div>

  <div id="reportTotals"></div>
</div>

    <br /> 
  `;

  previewContainer
    .querySelectorAll("[contenteditable]")
    .forEach((td) => td.addEventListener("blur", onCellEdit));

  previewContainer
    .querySelectorAll(".missed-type")
    .forEach((sel) => sel.addEventListener("change", onMissedTypeChange));

  document.getElementById("saveBtn").onclick = savePayroll;
  document.getElementById("pushBtn").onclick = pushToGSheet;

  function calculateGrossReportTotals(rows) {
    const sum = (key) => rows.reduce((t, r) => t + Number(r[key] || 0), 0);

    const totalBonus = sum("overall_bonus");
    const totalGrossPay = sum("total_pay");
    const totalReimbursement = sum("standard_stipend_amount");

    return {
      totalBonus,
      totalGrossPay,
      totalReimbursement,
      totalEarnings: totalGrossPay + totalReimbursement,
    };
  }

  // 🔽 CALCULATE & RENDER REPORT TOTALS
  const totals = calculateGrossReportTotals(payrollRows);
  renderReportTotals(totals);
}
document.querySelectorAll('[data-key="net_profit"]').forEach((td) => {
  const v = Number(td.textContent);
  if (!isNaN(v) && v < 0) td.classList.add("negative");
});

/* ================= REPORT TOTALS ================= */
function renderReportTotals(totals) {
  const container = document.getElementById("reportTotals");

  if (!totals) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
  <div class="report-totals-wrapper">
    <div class="report-totals-card">
      <div class="report-totals-header">
        Report Totals
      </div>

      <div class="report-totals-body">
        <div class="totals-row">
          <span>Total Bonus</span>
          <strong>${totals.totalBonus.toFixed(2)}</strong>
        </div>

        <div class="totals-row">
          <span>GUSTO TOTAL Gross Pay</span>
          <strong>${totals.totalGrossPay.toFixed(2)}</strong>
        </div>

        <div class="totals-row">
          <span>GUSTO Total Reimbursement</span>
          <strong>${totals.totalReimbursement.toFixed(2)}</strong>
        </div>

        <div class="totals-row totals-highlight">
          <span>Total Earnings</span>
          <strong>${totals.totalEarnings.toFixed(2)}</strong>
        </div>
      </div>
    </div>
  </div>
`;
}

/* ================= DROPDOWN ================= */
function renderMissedType(value) {
  return `
    <select class="missed-type">
      <option value="">--</option>
      <option value="regular" ${
        value === "regular" ? "selected" : ""
      }>Regular</option>
      <option value="ot" ${value === "ot" ? "selected" : ""}>OT</option>
      <option value="stipend" ${
        value === "stipend" ? "selected" : ""
      }>Stipend</option>
      <option value="holiday" ${
        value === "holiday" ? "selected" : ""
      }>Holiday</option>
    </select>
  `;
}

/* ================= EDIT ================= */
function onCellEdit(e) {
  const td = e.target;
  payrollRows[td.dataset.row][td.dataset.key] = parseNumberOrNull(
    td.textContent.trim()
  );
  debouncePreview();
}

function onMissedTypeChange(e) {
  const td = e.target.closest("td");
  payrollRows[td.dataset.row].missed_payment_type = e.target.value || null;
  debouncePreview();
}

/* ================= PREVIEW ================= */
function debouncePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 300);
}

async function runPreview() {
  const res = await fetch(`${API_URL}/payroll/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidates: payrollRows.map((r) => ({
        id: r.candidate_uuid,
        ...Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, r[f] ?? null])),
      })),
    }),
  });

  const data = await res.json();
  if (res.ok && Array.isArray(data.rows)) {
    payrollRows = data.rows;
    renderPayrollTable();
  }
}

/* ================= SAVE ================= */
async function savePayroll() {
  await fetch(`${API_URL}/payroll/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from_date: fromDateInput.value,
      to_date: toDateInput.value,
      payroll_name: formatPayrollName(fromDateInput.value, toDateInput.value),
      rows: payrollRows,
    }),
  });

  alert("Payroll saved successfully");
}

/* ================= PUSH TO GSHEET ================= */

async function pushToGSheet() {
  const from = formatDateMMDDYYYY(fromDateInput.value);
  const to = formatDateMMDDYYYY(toDateInput.value);

  const filename = `Payroll_Period_${from}_to_${to}.xlsx`;
  
  const res = await fetch(`${API_URL}/payroll/push-to-gsheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: payrollRows,
      from_date: fromDateInput.value,
      to_date: toDateInput.value,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || "Download failed");
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename; // ✅ EXACT filename format
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/* ================= INIT ================= */
loadCandidates();
