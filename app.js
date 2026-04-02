const form = document.getElementById("projectForm");
const tierButtons = document.querySelectorAll(".tier");
const unitButtons = document.querySelectorAll(".unit-btn");
const summary = document.getElementById("summary");
const splitBar = document.getElementById("splitBar");
const waterfallPanel = document.getElementById("waterfallPanel");
const scenarioCards = document.getElementById("scenarioCards");
const riskPanel = document.getElementById("riskPanel");
const boqBody = document.getElementById("boqBody");
const grandTotal = document.getElementById("grandTotal");
const plotUnit = document.getElementById("plotUnit");
const buaUnit = document.getElementById("buaUnit");
const salePriceValue = document.getElementById("salePriceValue");

const printBtn = document.getElementById("printBtn");
const copyBtn = document.getElementById("copyBtn");
const reportBtn = document.getElementById("reportBtn");
const salePriceInput = document.getElementById("salePrice");
const smartToggle = document.getElementById("smartToggle");
const smartTools = document.getElementById("smartTools");
const presetButtons = document.querySelectorAll(".preset-btn");
const quickSaleFactor = document.getElementById("quickSaleFactor");
const quickSoldAdj = document.getElementById("quickSoldAdj");
const quickEscalationAdj = document.getElementById("quickEscalationAdj");
const quickSaleFactorValue = document.getElementById("quickSaleFactorValue");
const quickSoldAdjValue = document.getElementById("quickSoldAdjValue");
const quickEscalationAdjValue = document.getElementById("quickEscalationAdjValue");
const timelineToggle = document.getElementById("timelineToggle");
const timelineTools = document.getElementById("timelineTools");
const cashflowPanel = document.getElementById("cashflowPanel");
const heatmapToggle = document.getElementById("heatmapToggle");
const heatmapPanel = document.getElementById("heatmapPanel");

let activeTier = "C";
let activeUnit = "sqft";
let currentResult = null;

const sqFtFactor = {
  sqft: 1,
  sqm: 10.7639,
  sqyd: 9,
};

const tierRates = {
  C: { min: 1500, max: 2000, default: 1750 },
  B: { min: 2000, max: 3000, default: 2500 },
  A: { min: 3000, max: 4200, default: 3200 },
};

const boqTemplate = [
  ["Site Preparation", "Site clearance, setting-out, excavation", "cum", 0.042, 0.04],
  ["Foundation", "PCC + footings + plinth beams", "cum", 0.08, 0.1],
  ["Structure", "RCC frame (columns, beams, slabs)", "sqft", 1, 0.24],
  ["Structure", "TMT steel reinforcement", "kg", 4.2, 0.11],
  ["Masonry", "Brick / AAC block walls", "sqft", 0.93, 0.09],
  ["Openings", "Doors, windows, glazing", "sqft", 0.12, 0.08],
  ["Flooring", "Tile / stone flooring and skirting", "sqft", 0.82, 0.1],
  ["Finishes", "Plaster, putty, paint systems", "sqft", 1.95, 0.11],
  ["Waterproofing", "Terrace + wet-area waterproofing", "sqft", 0.24, 0.03],
  ["MEP", "Electrical + plumbing + fire services", "sqft", 1, 0.09],
  ["External Works", "Drainage, paving, site development", "sqft", 0.16, 0.02],
  ["Miscellaneous", "Preliminaries and contingency", "ls", 1, 0],
];

function formatINR(value, digits = 0) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Math.max(0, Number(value || 0)));
}

function formatSignedINR(value) {
  const num = Number(value || 0);
  const sign = num < 0 ? "-" : "+";
  return `${sign}Rs ${formatINR(Math.abs(num))}`;
}

function convertToSqFt(value) {
  return Number(value || 0) * sqFtFactor[activeUnit];
}

function getLiftCount(floors, flatsPerFloor) {
  if (floors <= 6) return 1;
  if (floors <= 12) return flatsPerFloor > 8 ? 3 : 2;
  return flatsPerFloor > 8 ? 4 : 3;
}

function pickRate(data) {
  const customRate = Number(data.customRate || 0);
  if (customRate > 0) return customRate;
  return tierRates[activeTier].default;
}

function makeBoqLines(buaSqFt, constructionCost, effectiveRate) {
  const lines = boqTemplate.map(([category, item, unit, factor, pct]) => {
    const qty = unit === "ls" ? 1 : buaSqFt * factor;
    let amount = pct === 0 ? constructionCost * 0.03 : constructionCost * pct;
    let rate = unit === "ls" ? amount : amount / Math.max(qty, 1);

    if (unit === "kg") {
      rate = Math.max(rate, 72);
      amount = rate * qty;
    }
    if (unit === "cum") {
      rate = Math.max(rate, 5600);
      amount = rate * qty;
    }

    if (unit === "sqft" && category === "Structure") {
      rate = Math.max(rate, effectiveRate * 0.24);
      amount = rate * qty;
    }

    return { category, item, unit, qty, rate, amount };
  });

  const totalLine = lines.reduce((sum, line) => sum + line.amount, 0);
  const scale = constructionCost / Math.max(totalLine, 1);
  lines.forEach((line) => {
    line.amount *= scale;
    line.rate = line.unit === "ls" ? line.amount : line.amount / Math.max(line.qty, 1);
  });
  return lines;
}

function recomputeFinancials(result) {
  const totalGrossRevenue = result.sbaArea * result.salePrice;
  const soldSbaArea = result.sbaArea * (result.soldPct / 100);
  const realizedGrossRevenue = soldSbaArea * result.salePrice;
  const gstAmount = realizedGrossRevenue * (result.gstPct / 100);
  const brokerAmount = realizedGrossRevenue * (result.brokerPct / 100);
  const netRevenue = realizedGrossRevenue - gstAmount - brokerAmount;

  result.totalGrossRevenue = totalGrossRevenue;
  result.soldSbaArea = soldSbaArea;
  result.realizedGrossRevenue = realizedGrossRevenue;
  result.grossRevenue = totalGrossRevenue;
  result.gstAmount = gstAmount;
  result.brokerAmount = brokerAmount;
  result.netRevenue = netRevenue;

  const baseProjectCost = result.landCost + result.stampCost + result.legalCost + result.constructionCost;
  const financedPrincipal = baseProjectCost * (result.loanPct / 100);
  const interestCost = financedPrincipal * (result.interestPct / 100) * (result.durationMonths / 12) * 0.5;
  const delayInterestCost = financedPrincipal * (result.interestPct / 100) * (result.delayMonths / 12) * 0.5;

  result.interestCost = interestCost;
  result.delayInterestCost = delayInterestCost;
  result.totalCost = baseProjectCost + interestCost + delayInterestCost;
  result.profit = netRevenue - result.totalCost;
  result.roi = result.totalCost > 0 ? (result.profit / result.totalCost) * 100 : 0;
  result.margin = netRevenue > 0 ? (result.profit / netRevenue) * 100 : 0;
}

function buildCashflow(result) {
  if (!result.timelineEnabled) return null;

  const delayMonths = Math.max(0, result.delayMonths);
  const durationMonths = Math.max(1, result.durationMonths);
  const salesMonths = Math.max(1, result.salesMonths);
  const salesStart = delayMonths + Math.ceil(durationMonths / 2) + Math.max(0, result.salesStartOffset);
  const horizon = Math.max(delayMonths + durationMonths + salesMonths + 2, 24);

  const monthlyConstruction = result.constructionCost / durationMonths;
  const monthlySalesNet = result.netRevenue / salesMonths;
  const upfront = result.landCost + result.stampCost + result.legalCost;

  let cumulative = -upfront;
  let minCumulative = cumulative;
  let breakevenMonth = null;

  for (let month = 1; month <= horizon; month += 1) {
    const inConstructionWindow = month > delayMonths && month <= delayMonths + durationMonths;
    const inSalesWindow = month >= salesStart && month < salesStart + salesMonths;

    if (inConstructionWindow) cumulative -= monthlyConstruction;
    if (inSalesWindow) cumulative += monthlySalesNet;

    if (cumulative < minCumulative) minCumulative = cumulative;
    if (breakevenMonth === null && cumulative >= 0) breakevenMonth = month;
  }

  return {
    salesStart,
    horizon,
    peakFundingGap: Math.abs(minCumulative),
    breakevenMonth,
  };
}

function scenarioResult(base, multiplier) {
  const price = base.salePrice * multiplier;
  const gross = base.sbaArea * (base.soldPct / 100) * price;
  const gst = gross * (base.gstPct / 100);
  const broker = gross * (base.brokerPct / 100);
  const net = gross - gst - broker;
  const profit = net - base.totalCost;
  const roi = base.totalCost > 0 ? (profit / base.totalCost) * 100 : 0;
  return { price, profit, roi };
}

function riskMessages(result) {
  const warnings = [];
  const residentialFloors = Math.max(0, result.floors - 1);
  const parkingRequired = result.units * 1.25;

  if (residentialFloors === 0) warnings.push("No sale floor after reserving ground for parking.");
  if (result.flatsPerFloor > 10) warnings.push("Unit density is aggressive for residential absorption.");
  if (result.parkingSlots > 0 && result.parkingSlots < parkingRequired) {
    const shortfall = ((parkingRequired - result.parkingSlots) / parkingRequired) * 100;
    warnings.push(`Parking appears short by about ${shortfall.toFixed(0)}%.`);
  }
  if (result.roi < 10) warnings.push("ROI below safer threshold (10%).");
  if (result.margin < 12) warnings.push("Net margin below healthy developer target (12%).");
  if (result.bhkType >= 4 && result.flatsPerFloor > 6) {
    warnings.push("High density for large BHK mix may reduce absorption speed.");
  }
  if (result.bhkType === 1 && result.loadingPct > 38) {
    warnings.push("Very high loading on 1 BHK projects can impact market acceptance.");
  }

  let level = "safe";
  if (warnings.length > 0) level = warnings.length > 2 ? "risky" : "warn";
  return { warnings, level };
}

function collectData() {
  return Object.fromEntries(new FormData(form).entries());
}

function applyOptionalTuning(data) {
  if (!smartToggle || !smartToggle.checked) return data;

  const tuned = { ...data };
  const saleFactor = Number(quickSaleFactor?.value || 100) / 100;
  const soldAdj = Number(quickSoldAdj?.value || 0);
  const escalationAdj = Number(quickEscalationAdj?.value || 0);

  tuned.salePrice = String(Math.max(0, Number(tuned.salePrice || 0) * saleFactor));
  tuned.soldPct = String(Math.min(100, Math.max(0, Number(tuned.soldPct || 0) + soldAdj)));
  tuned.escalationPct = String(Math.max(0, Number(tuned.escalationPct || 0) + escalationAdj));
  return tuned;
}

function calculate(data) {
  const plotSqFt = convertToSqFt(data.plotArea);
  const buaSqFt = convertToSqFt(data.bua);
  const floors = Number(data.floors || 1);
  const basements = Number(data.basements || 0);
  const flatsPerFloor = Number(data.flatsPerFloor || 0);
  const parkingSlots = Number(data.parkingSlots || 0);
  const salePrice = Number(data.salePrice || 8000);
  const soldPct = Number(data.soldPct || 90);
  const bhkType = Math.min(5, Math.max(1, Number(data.bhkType || 2)));
  const timelineEnabled = data.advancedTimeline === "on";
  const delayMonths = timelineEnabled ? Math.max(0, Number(data.delayMonths || 0)) : 0;
  const salesMonths = timelineEnabled ? Math.max(1, Number(data.salesMonths || 18)) : 18;
  const salesStartOffset = timelineEnabled ? Math.max(0, Number(data.salesStartOffset || 0)) : 0;

  const loadingPct = Number(data.loadingPct || 30);
  const loadingFactor = 1 + loadingPct / 100;
  const carpetRatioPct = Math.min(90, Math.max(60, Number(data.carpetRatio || 78)));
  const sbaArea = buaSqFt * loadingFactor;
  const carpetArea = buaSqFt * (carpetRatioPct / 100);
  const commonArea = Math.max(0, sbaArea - buaSqFt);

  const baseRate = pickRate(data);
  const contractorFactor = data.costView === "developer" ? 0.86 : 1;
  const effectiveRate = baseRate * contractorFactor;

  const escalationPct = Number(data.escalationPct || 0);
  const constructionCost = buaSqFt * effectiveRate * (1 + escalationPct / 100);

  const units = flatsPerFloor > 0 ? flatsPerFloor * Math.max(0, floors - 1) : 0;
  const lifts = getLiftCount(floors, flatsPerFloor);

  const landRate = Number(data.landRate || 0);
  const landCostInput = Number(data.landCost || 0);
  const landCost = landCostInput > 0 ? landCostInput : plotSqFt * landRate;
  const stampPct = Number(data.stampPct || 7);
  const stampCost = landCost * (stampPct / 100);
  const legalCost = Number(data.legalCost || 0);

  const result = {
    plotSqFt,
    buaSqFt,
    carpetArea,
    commonArea,
    sbaArea,
    floors,
    basements,
    flatsPerFloor,
    units,
    lifts,
    parkingSlots,
    bhkType,
    salePrice,
    soldPct,
    timelineEnabled,
    delayMonths,
    salesMonths,
    salesStartOffset,
    loadingPct,
    carpetRatioPct,
    baseRate,
    effectiveRate,
    constructionCost,
    landCost,
    stampCost,
    legalCost,
    loanPct: Number(data.loanPct || 0),
    interestPct: Number(data.interestPct || 0),
    durationMonths: Number(data.durationMonths || 24),
    gstPct: Number(data.gstPct || 5),
    brokerPct: Number(data.brokerPct || 2),
    lines: makeBoqLines(buaSqFt, constructionCost, effectiveRate),
  };

  recomputeFinancials(result);
  return result;
}

function renderSplitBar(result) {
  const total = result.totalCost;
  const landShare = (result.landCost / Math.max(total, 1)) * 100;
  const constructionShare = (result.constructionCost / Math.max(total, 1)) * 100;
  const financeShare = (result.interestCost / Math.max(total, 1)) * 100;

  splitBar.innerHTML = `
    <div class="split-track">
      <div class="split-land" style="width:${landShare.toFixed(2)}%"></div>
      <div class="split-construction" style="width:${constructionShare.toFixed(2)}%"></div>
      <div class="split-finance" style="width:${financeShare.toFixed(2)}%"></div>
    </div>
    <div class="split-legend">
      <span>Land ${landShare.toFixed(1)}%</span>
      <span>Construction ${constructionShare.toFixed(1)}%</span>
      <span>Finance ${financeShare.toFixed(1)}%</span>
    </div>
  `;
}

function renderScenarios(result) {
  const conservative = scenarioResult(result, 0.85);
  const base = scenarioResult(result, 1);
  const optimistic = scenarioResult(result, 1.15);
  const cards = [
    ["Conservative", conservative],
    ["Base", base],
    ["Optimistic", optimistic],
  ];

  scenarioCards.innerHTML = cards
    .map(
      ([name, v]) => `
      <article class="scenario">
        <h4>${name}</h4>
        <p>Price: Rs ${formatINR(v.price)} / sq ft</p>
        <p>Profit: Rs ${formatINR(v.profit)}</p>
        <p>ROI: ${v.roi.toFixed(1)}%</p>
      </article>
    `,
    )
    .join("");
}

function renderWaterfall(result) {
  if (!waterfallPanel) return;

  const items = [
    { label: "Gross Revenue", value: result.totalGrossRevenue, cls: "wf-revenue" },
    { label: "GST", value: -result.gstAmount, cls: "wf-deduction" },
    { label: "Brokerage", value: -result.brokerAmount, cls: "wf-deduction" },
    { label: "Net Revenue", value: result.netRevenue, cls: "wf-net" },
    { label: "Total Cost", value: -result.totalCost, cls: "wf-cost" },
    { label: "Profit", value: result.profit, cls: result.profit >= 0 ? "wf-profit" : "wf-loss" },
  ];

  const maxAbs = Math.max(...items.map((item) => Math.abs(item.value)), 1);

  waterfallPanel.innerHTML = `
    <h3>Waterfall Chart</h3>
    <p class="muted">Revenue → deductions → net revenue → total cost → profit</p>
    <div class="waterfall-grid">
      ${items
        .map((item) => {
          const width = (Math.abs(item.value) / maxAbs) * 100;
          return `
            <div class="wf-row">
              <p class="wf-label">${item.label}</p>
              <div class="wf-track">
                <div class="wf-bar ${item.cls}" style="width:${width.toFixed(2)}%"></div>
              </div>
              <p class="wf-value">${formatSignedINR(item.value)}</p>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSummary(result) {
  const kpis = [
    ["Construction Cost", `Rs ${formatINR(result.constructionCost)}`],
    ["Land + Statutory", `Rs ${formatINR(result.landCost + result.stampCost + result.legalCost)}`],
    ["Finance Cost", `Rs ${formatINR(result.interestCost)}`],
    ["Delay Carry Cost", `Rs ${formatINR(result.delayInterestCost)}`],
    ["Total Project Cost", `Rs ${formatINR(result.totalCost)}`],
    ["BUA", `${formatINR(result.buaSqFt)} sq ft`],
    ["Carpet Area", `${formatINR(result.carpetArea)} sq ft`],
    ["SBA (Sellable Base)", `${formatINR(result.sbaArea)} sq ft`],
    ["Sold SBA Area", `${formatINR(result.soldSbaArea)} sq ft`],
    ["Common/Loading Area", `${formatINR(result.commonArea)} sq ft`],
    ["Gross Revenue (100% SBA)", `Rs ${formatINR(result.totalGrossRevenue)}`],
    ["Realized Gross (Sold %)", `Rs ${formatINR(result.realizedGrossRevenue)}`],
    ["Net Revenue", `Rs ${formatINR(result.netRevenue)}`],
    ["Profit / Loss", `Rs ${formatINR(result.profit)}`],
    ["ROI", `${result.roi.toFixed(1)}%`],
    ["Margin", `${result.margin.toFixed(1)}%`],
    ["BHK Mix", `${result.bhkType} BHK`],
    ["Units and Lifts", `${result.units} units, ${result.lifts} lifts`],
  ];

  summary.innerHTML = "";
  kpis.forEach(([k, v]) => {
    const card = document.createElement("div");
    card.className = "kpi";
    card.innerHTML = `<p class="k">${k}</p><p class="v">${v}</p>`;
    summary.appendChild(card);
  });
}

function renderCashflow(result) {
  if (!cashflowPanel) return;
  const cashflow = buildCashflow(result);

  if (!cashflow) {
    cashflowPanel.classList.add("hidden");
    cashflowPanel.innerHTML = "";
    return;
  }

  cashflowPanel.classList.remove("hidden");
  cashflowPanel.innerHTML = `
    <h3>Cashflow Timeline (Optional)</h3>
    <div class="cashflow-grid">
      <div class="kpi"><p class="k">Sales Start Month</p><p class="v">M${cashflow.salesStart}</p></div>
      <div class="kpi"><p class="k">Break-even Month</p><p class="v">${cashflow.breakevenMonth ? `M${cashflow.breakevenMonth}` : "Beyond horizon"}</p></div>
      <div class="kpi"><p class="k">Peak Funding Gap</p><p class="v">Rs ${formatINR(cashflow.peakFundingGap)}</p></div>
      <div class="kpi"><p class="k">Timeline Horizon</p><p class="v">${cashflow.horizon} months</p></div>
    </div>
  `;
}

function evaluateScenarioMetrics(base, saleFactor, costFactor) {
  const salePrice = base.salePrice * saleFactor;
  const constructionCost = base.constructionCost * costFactor;
  const soldSbaArea = base.sbaArea * (base.soldPct / 100);
  const realizedGrossRevenue = soldSbaArea * salePrice;
  const gstAmount = realizedGrossRevenue * (base.gstPct / 100);
  const brokerAmount = realizedGrossRevenue * (base.brokerPct / 100);
  const netRevenue = realizedGrossRevenue - gstAmount - brokerAmount;

  const baseProjectCost = base.landCost + base.stampCost + base.legalCost + constructionCost;
  const financedPrincipal = baseProjectCost * (base.loanPct / 100);
  const interestCost = financedPrincipal * (base.interestPct / 100) * (base.durationMonths / 12) * 0.5;
  const delayInterestCost = financedPrincipal * (base.interestPct / 100) * (base.delayMonths / 12) * 0.5;
  const totalCost = baseProjectCost + interestCost + delayInterestCost;
  const profit = netRevenue - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  return { roi, profit };
}

function heatmapZone(roi) {
  if (roi >= 18) return "safe";
  if (roi >= 10) return "caution";
  return "risky";
}

function renderHeatmap(result) {
  if (!heatmapPanel) return;
  if (!heatmapToggle || !heatmapToggle.checked) {
    heatmapPanel.classList.add("hidden");
    heatmapPanel.innerHTML = "";
    return;
  }

  const saleFactors = [0.9, 0.95, 1, 1.05, 1.1];
  const costFactors = [0.9, 0.95, 1, 1.05, 1.1];

  const head = saleFactors
    .map((f) => `<th>${Math.round(f * 100)}%</th>`)
    .join("");

  const rows = costFactors
    .map((costF) => {
      const cells = saleFactors
        .map((saleF) => {
          const metrics = evaluateScenarioMetrics(result, saleF, costF);
          const zone = heatmapZone(metrics.roi);
          return `<td class="heat-${zone}" title="Profit: Rs ${formatINR(metrics.profit)}">${metrics.roi.toFixed(1)}%</td>`;
        })
        .join("");

      return `<tr><th>${Math.round(costF * 100)}%</th>${cells}</tr>`;
    })
    .join("");

  heatmapPanel.classList.remove("hidden");
  heatmapPanel.innerHTML = `
    <h3>Sensitivity Heatmap (Optional)</h3>
    <p class="muted">Rows: Construction Cost factor, Columns: Sale Price factor, Cell value: ROI.</p>
    <div class="heatmap-legend">
      <span><i class="dot safe"></i> Safe</span>
      <span><i class="dot caution"></i> Caution</span>
      <span><i class="dot risky"></i> Risky</span>
    </div>
    <div class="heatmap-wrap">
      <table class="heatmap-table">
        <thead><tr><th>Cost \\ Price</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderRisk(result) {
  const risk = riskMessages(result);
  riskPanel.className = "risk-panel";
  if (risk.level === "safe") riskPanel.classList.add("safe");
  if (risk.level === "risky") riskPanel.classList.add("risky");

  if (risk.warnings.length === 0) {
    riskPanel.innerHTML = "<strong>PROJECT RISKS</strong><br/>No major risk flags in current scenario. This looks balanced for a first-pass feasibility.";
    return;
  }
  riskPanel.innerHTML = `<strong>PROJECT RISKS</strong><br/>${risk.warnings.map((w) => `• ${w}`).join("<br/>")}`;
}

function renderBoq(result) {
  boqBody.innerHTML = "";
  result.lines.forEach((line, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${line.category}</td>
      <td>${line.item}</td>
      <td>${line.unit}</td>
      <td>${formatINR(line.qty, 2)}</td>
      <td><input class="rate-edit" data-index="${idx}" type="number" min="1" step="1" value="${Math.round(line.rate)}" /></td>
      <td class="line-amount">${formatINR(line.amount)}</td>
    `;
    boqBody.appendChild(tr);
  });
  grandTotal.textContent = `Rs ${formatINR(result.constructionCost)}`;
}

function renderAll(result) {
  renderSummary(result);
  renderSplitBar(result);
  renderWaterfall(result);
  renderScenarios(result);
  renderCashflow(result);
  renderHeatmap(result);
  renderRisk(result);
  renderBoq(result);
}

function calculateFromForm() {
  const data = applyOptionalTuning(collectData());
  currentResult = calculate(data);
  renderAll(currentResult);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  calculateFromForm();
});

form.addEventListener("input", (event) => {
  if (event.target.id === "salePrice") {
    salePriceValue.textContent = `Rs ${formatINR(event.target.value)} / sq ft`;
  }
});

if (smartToggle && smartTools) {
  smartToggle.addEventListener("change", () => {
    smartTools.classList.toggle("hidden", !smartToggle.checked);
    calculateFromForm();
  });
}

if (timelineToggle && timelineTools) {
  timelineToggle.addEventListener("change", () => {
    timelineTools.classList.toggle("hidden", !timelineToggle.checked);
    calculateFromForm();
  });
}

if (heatmapToggle) {
  heatmapToggle.addEventListener("change", () => {
    calculateFromForm();
  });
}

function syncSmartLabels() {
  if (quickSaleFactorValue && quickSaleFactor) {
    quickSaleFactorValue.textContent = `${quickSaleFactor.value}%`;
  }
  if (quickSoldAdjValue && quickSoldAdj) {
    const soldVal = Number(quickSoldAdj.value || 0);
    quickSoldAdjValue.textContent = `${soldVal >= 0 ? "+" : ""}${soldVal}%`;
  }
  if (quickEscalationAdjValue && quickEscalationAdj) {
    const escVal = Number(quickEscalationAdj.value || 0);
    quickEscalationAdjValue.textContent = `${escVal >= 0 ? "+" : ""}${escVal}%`;
  }
}

[quickSaleFactor, quickSoldAdj, quickEscalationAdj].forEach((input) => {
  input?.addEventListener("input", () => {
    syncSmartLabels();
    if (smartToggle?.checked) calculateFromForm();
  });
});

const presetValues = {
  conservative: { soldPct: 70, escalationPct: 8, loanPct: 50, loadingPct: 28, carpetRatio: 80 },
  balanced: { soldPct: 85, escalationPct: 5, loanPct: 60, loadingPct: 30, carpetRatio: 78 },
  aggressive: { soldPct: 95, escalationPct: 3, loanPct: 70, loadingPct: 35, carpetRatio: 75 },
};

presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = presetValues[btn.dataset.preset];
    if (!preset) return;

    Object.entries(preset).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);
      if (field) field.value = String(value);
    });

    calculateFromForm();
  });
});

boqBody.addEventListener("input", (event) => {
  if (!event.target.classList.contains("rate-edit") || !currentResult) return;
  const idx = Number(event.target.dataset.index);
  const newRate = Number(event.target.value || 0);
  if (newRate <= 0) return;

  const line = currentResult.lines[idx];
  line.rate = newRate;
  line.amount = line.unit === "ls" ? newRate : newRate * line.qty;

  currentResult.constructionCost = currentResult.lines.reduce((sum, l) => sum + l.amount, 0);
  recomputeFinancials(currentResult);
  renderSummary(currentResult);
  renderSplitBar(currentResult);
  renderWaterfall(currentResult);
  renderScenarios(currentResult);
  renderCashflow(currentResult);
  renderHeatmap(currentResult);
  renderRisk(currentResult);

  const amountCell = event.target.closest("tr").querySelector(".line-amount");
  amountCell.textContent = formatINR(line.amount);
  grandTotal.textContent = `Rs ${formatINR(currentResult.constructionCost)}`;
});

tierButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tierButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTier = btn.dataset.tier;
    calculateFromForm();
  });
});

unitButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    unitButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeUnit = btn.dataset.unit;

    const label = activeUnit === "sqft" ? "sq ft" : activeUnit === "sqm" ? "sq m" : "sq yd";
    plotUnit.textContent = label;
    buaUnit.textContent = label;
    calculateFromForm();
  });
});

copyBtn.addEventListener("click", async () => {
  if (!currentResult) return;
  const text = [
    "OPTIBUILD FEASIBILITY SUMMARY",
    `BUA: ${formatINR(currentResult.buaSqFt)} sq ft`,
    `SBA Base: ${formatINR(currentResult.sbaArea)} sq ft`,
    `Sold SBA: ${formatINR(currentResult.soldSbaArea)} sq ft`,
    `Price Basis: Rs ${formatINR(currentResult.salePrice)} / sq ft on SBA`,
    `Gross Revenue (100% SBA): Rs ${formatINR(currentResult.totalGrossRevenue)}`,
    `Realized Gross (Sold %): Rs ${formatINR(currentResult.realizedGrossRevenue)}`,
    `Delay Carry Cost: Rs ${formatINR(currentResult.delayInterestCost)}`,
    `Construction Cost: Rs ${formatINR(currentResult.constructionCost)}`,
    `Total Project Cost: Rs ${formatINR(currentResult.totalCost)}`,
    `Net Revenue: Rs ${formatINR(currentResult.netRevenue)}`,
    `Profit: Rs ${formatINR(currentResult.profit)}`,
    `ROI: ${currentResult.roi.toFixed(1)}%`,
    `Margin: ${currentResult.margin.toFixed(1)}%`,
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = "Copy Summary";
    }, 1200);
  } catch {
    copyBtn.textContent = "Copy Failed";
    setTimeout(() => {
      copyBtn.textContent = "Copy Summary";
    }, 1200);
  }
});

printBtn.addEventListener("click", () => {
  window.print();
});

function buildInvestorReportHtml(result) {
  const risks = riskMessages(result).warnings;
  const conservative = scenarioResult(result, 0.85);
  const base = scenarioResult(result, 1);
  const optimistic = scenarioResult(result, 1.15);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>OptiBuild Investor Report</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #1a1717; }
    h1,h2 { margin: 0 0 8px; }
    p { margin: 4px 0; }
    .block { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin: 10px 0; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(160px, 1fr)); gap: 8px; }
    .k { color: #5b5754; font-size: 12px; }
    .v { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 13px; }
  </style>
</head>
<body>
  <h1>OptiBuild Investor Report</h1>
  <p>Generated from live assumptions and current scenario.</p>

  <div class="block">
    <h2>Key Metrics</h2>
    <div class="grid">
      <div><p class="k">Total Project Cost</p><p class="v">Rs ${formatINR(result.totalCost)}</p></div>
      <div><p class="k">Net Revenue</p><p class="v">Rs ${formatINR(result.netRevenue)}</p></div>
      <div><p class="k">Profit</p><p class="v">Rs ${formatINR(result.profit)}</p></div>
      <div><p class="k">ROI</p><p class="v">${result.roi.toFixed(1)}%</p></div>
      <div><p class="k">Margin</p><p class="v">${result.margin.toFixed(1)}%</p></div>
      <div><p class="k">Gross Revenue (100% SBA)</p><p class="v">Rs ${formatINR(result.totalGrossRevenue)}</p></div>
    </div>
  </div>

  <div class="block">
    <h2>Assumptions</h2>
    <p>BUA: ${formatINR(result.buaSqFt)} sq ft | SBA: ${formatINR(result.sbaArea)} sq ft | Sold SBA: ${formatINR(result.soldSbaArea)} sq ft</p>
    <p>Sale Price: Rs ${formatINR(result.salePrice)} / sq ft on SBA | Sold %: ${result.soldPct}%</p>
    <p>Construction Cost: Rs ${formatINR(result.constructionCost)} | Land + Statutory: Rs ${formatINR(result.landCost + result.stampCost + result.legalCost)}</p>
    <p>Finance Cost: Rs ${formatINR(result.interestCost)} | Delay Carry Cost: Rs ${formatINR(result.delayInterestCost)}</p>
  </div>

  <div class="block">
    <h2>Formulas</h2>
    <p>Revenue Model: Sold SBA × Sale Price</p>
    <p>Net Revenue: Realized Gross - GST - Brokerage</p>
    <p>Total Cost: Land + Statutory + Construction + Finance + Delay Carry</p>
    <p>ROI = Profit / Total Cost</p>
  </div>

  <div class="block">
    <h2>Scenarios</h2>
    <table>
      <thead><tr><th>Scenario</th><th>Price / sq ft</th><th>Profit</th><th>ROI</th></tr></thead>
      <tbody>
        <tr><td>Conservative</td><td>Rs ${formatINR(conservative.price)}</td><td>Rs ${formatINR(conservative.profit)}</td><td>${conservative.roi.toFixed(1)}%</td></tr>
        <tr><td>Base</td><td>Rs ${formatINR(base.price)}</td><td>Rs ${formatINR(base.profit)}</td><td>${base.roi.toFixed(1)}%</td></tr>
        <tr><td>Optimistic</td><td>Rs ${formatINR(optimistic.price)}</td><td>Rs ${formatINR(optimistic.profit)}</td><td>${optimistic.roi.toFixed(1)}%</td></tr>
      </tbody>
    </table>
  </div>

  <div class="block">
    <h2>Risks</h2>
    ${risks.length ? `<ul>${risks.map((r) => `<li>${r}</li>`).join("")}</ul>` : "<p>No major risk flags in current scenario.</p>"}
  </div>
</body>
</html>`;
}

reportBtn?.addEventListener("click", () => {
  if (!currentResult) return;
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) return;
  reportWindow.document.open();
  reportWindow.document.write(buildInvestorReportHtml(currentResult));
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
});

salePriceValue.textContent = `Rs ${formatINR(salePriceInput.value)} / sq ft`;
syncSmartLabels();
form.dispatchEvent(new Event("submit"));
