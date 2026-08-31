(function () {
  "use strict";

  const period = "2026-08";
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const state = {
    categories: [
      { name: "Housing", budget: 1850 }, { name: "Groceries", budget: 520 }, { name: "Dining out", budget: 260 }, { name: "Transport", budget: 220 }, { name: "Subscriptions", budget: 130 }, { name: "Shopping", budget: 300 }, { name: "Savings", budget: 400 }
    ],
    transactions: [
      { id: "tx-1002", date: "2026-08-02", merchant: "Fresh Basket", amount: -126.40, category: "Groceries" },
      { id: "tx-1003", date: "2026-08-03", merchant: "CloudBox Pro", amount: -24.99, category: "Subscriptions" },
      { id: "tx-1004", date: "2026-08-04", merchant: "Brew & Bloom", amount: -18.60, category: "Dining out" },
      { id: "tx-1006", date: "2026-08-06", merchant: "StreamFlix", amount: -17.99, category: "Subscriptions" },
      { id: "tx-1008", date: "2026-08-10", merchant: "Saffron Table", amount: -86.50, category: "Dining out" },
      { id: "tx-1009", date: "2026-08-11", merchant: "FitNow", amount: -39.00, category: "Subscriptions" },
      { id: "tx-1012", date: "2026-08-17", merchant: "Brew & Bloom", amount: -16.40, category: "Dining out" },
      { id: "tx-1015", date: "2026-08-22", merchant: "Saffron Table", amount: -112.80, category: "Dining out" },
      { id: "tx-1016", date: "2026-07-03", merchant: "CloudBox Pro", amount: -24.99, category: "Subscriptions" },
      { id: "tx-1017", date: "2026-07-06", merchant: "StreamFlix", amount: -17.99, category: "Subscriptions" },
      { id: "tx-1018", date: "2026-07-09", merchant: "FitNow", amount: -39.00, category: "Subscriptions" }
    ],
    pendingPlan: null,
    undoStack: [],
    activity: "Waiting for a preset agent call…"
  };

  const $ = (id) => document.getElementById(id);
  const money = (value) => currency.format(value);
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const expense = (tx) => tx.amount < 0 ? Math.abs(tx.amount) : 0;
  const categoryByName = (name) => state.categories.find((category) => category.name.toLowerCase() === String(name || "").toLowerCase());
  const transactionById = (id) => state.transactions.find((tx) => tx.id === id);
  const spent = (name) => state.transactions.filter((tx) => tx.category === name && tx.date.startsWith(period)).reduce((sum, tx) => sum + expense(tx), 0);

  function transactionResult(tx) { return { id: tx.id, date: tx.date, merchant: tx.merchant, amount: tx.amount, category: tx.category }; }

  const tools = {
    get_transactions(args = {}) {
      const category = args.category ? String(args.category).toLowerCase() : null;
      const requestedPeriod = args.period ? String(args.period) : null;
      return state.transactions.filter((tx) => (!requestedPeriod || tx.date.startsWith(requestedPeriod)) && (!category || tx.category.toLowerCase() === category)).map(transactionResult);
    },
    get_categories() { return state.categories.map((category) => ({ category: category.name, monthlyLimit: category.budget, spent: Number(spent(category.name).toFixed(2)), remaining: Number((category.budget - spent(category.name)).toFixed(2)) })); },
    flag_anomaly() {
      const findings = [];
      ["CloudBox Pro", "StreamFlix", "FitNow"].forEach((merchant) => {
        const matching = state.transactions.filter((tx) => tx.merchant === merchant && tx.amount < 0);
        if (matching.length >= 2) findings.push({ type: "recurring_subscription", merchant, monthlyAmount: Number((matching.slice(0, 3).reduce((sum, tx) => sum + expense(tx), 0) / Math.min(3, matching.length)).toFixed(2)), occurrences: matching.length, note: "Recurring charge detected" });
      });
      const dining = state.transactions.filter((tx) => tx.category === "Dining out" && tx.date.startsWith(period)).map(expense);
      const average = dining.reduce((sum, value) => sum + value, 0) / dining.length;
      const outlier = Math.max(...dining);
      if (outlier > average * 1.5) findings.push({ type: "outlier", category: "Dining out", amount: outlier, average: Number(average.toFixed(2)), note: "One charge is above this category's typical transaction" });
      return findings;
    },
    simulate_reallocation(args = {}) {
      if (!Array.isArray(args.moves) || !args.moves.length) return { ok: false, error: "moves must contain at least one move" };
      const projected = state.categories.map((category) => ({ category: category.name, monthlyLimit: category.budget }));
      args.moves.forEach((move) => {
        const amount = Number(move.amount); const from = projected.find((item) => item.category.toLowerCase() === String(move.fromCategory).toLowerCase()); const to = projected.find((item) => item.category.toLowerCase() === String(move.toCategory).toLowerCase());
        if (!from || !to || !Number.isFinite(amount) || amount <= 0 || from.monthlyLimit < amount) throw new Error("Each move needs existing categories and a positive amount within budget");
        from.monthlyLimit -= amount; to.monthlyLimit += amount;
      });
      state.pendingPlan = { moves: args.moves.map((move) => ({ fromCategory: move.fromCategory, toCategory: move.toCategory, amount: Number(move.amount) })), projected };
      state.activity = "Proposal ready — waiting for your approval";
      render();
      return { ok: true, planId: `landing-plan-${Date.now()}`, moves: state.pendingPlan.moves, projectedCategories: projected };
    },
    categorize_transaction(args = {}) {
      const tx = transactionById(args.id); const category = categoryByName(args.category);
      if (!tx) return { ok: false, error: "Transaction not found" }; if (!category) return { ok: false, error: "Category not found" };
      const previousCategory = tx.category; state.undoStack.push({ type: "category", id: tx.id, previous: previousCategory }); tx.category = category.name;
      state.activity = `Recategorized ${tx.merchant} — undo is available`; render(); showToast(`${tx.merchant} moved to ${category.name}`);
      return { ok: true, id: tx.id, previousCategory, category: tx.category, updatedTransaction: transactionResult(tx) };
    },
    set_budget(args = {}) {
      const category = categoryByName(args.category); const monthlyLimit = Number(args.monthlyLimit);
      if (!category || !Number.isFinite(monthlyLimit) || monthlyLimit < 0) return { ok: false, error: "Use an existing category and a non-negative monthly limit" };
      state.undoStack.push({ type: "budget", category: category.name, previous: category.budget }); category.budget = Number(monthlyLimit.toFixed(2)); state.activity = `${category.name} budget updated — undo is available`; render(); showToast(`${category.name} budget updated to ${money(category.budget)}`);
      return { ok: true, category: category.name, previousMonthlyLimit: state.undoStack.at(-1).previous, monthlyLimit: category.budget };
    }
  };

  function renderBudgets() {
    $("landing-budgets").innerHTML = state.categories.filter((category) => ["Groceries", "Dining out", "Savings"].includes(category.name)).map((category) => { const ratio = category.budget ? Math.min(100, Math.round((spent(category.name) / category.budget) * 100)) : 0; return `<div class="landing-budget-row" data-budget-row="${escapeHtml(category.name)}"><div class="landing-budget-top"><span>${escapeHtml(category.name)}</span><b>${money(category.budget)}</b></div><div class="landing-bar"><span style="width:${ratio}%"></span></div></div>`; }).join("");
  }

  function renderPlan() {
    const plan = $("landing-plan");
    if (!state.pendingPlan) { plan.classList.add("is-hidden"); plan.replaceChildren(); return; }
    plan.classList.remove("is-hidden"); plan.innerHTML = `<h3>✦ Pending reallocation plan</h3><p>The simulated move is ready for a human checkpoint — no budget has changed yet.</p>${state.pendingPlan.moves.map((move) => `<div class="plan-move"><span>${escapeHtml(move.fromCategory)} → ${escapeHtml(move.toCategory)}</span><b>${money(move.amount)}/mo</b></div>`).join("")}<div class="plan-actions"><button type="button" data-plan-action="approve">Approve changes</button><button type="button" class="reject" data-plan-action="reject">Reject</button></div>`;
  }

  function render() { renderBudgets(); renderPlan(); $("landing-activity-text").textContent = state.activity; $("landing-undo").disabled = state.undoStack.length === 0; }

  function pretty(value) { return JSON.stringify(value, null, 2); }
  function logCall(name, args, result) { const consoleElement = $("playground-console"); consoleElement.querySelectorAll(".console-muted").forEach((node) => node.remove()); const call = document.createElement("p"); call.className = "console-call"; call.textContent = `${name}(${JSON.stringify(args)})`; const output = document.createElement("pre"); output.className = "console-result"; output.textContent = pretty(result); consoleElement.prepend(output); consoleElement.prepend(call); }

  function showToast(message) { const toast = $("landing-toast"); toast.textContent = message; toast.classList.add("visible"); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 3300); }

  function runPreset(action) {
    const presets = {
      subscriptions: ["flag_anomaly", {}], anomalies: ["flag_anomaly", {}], reallocation: ["simulate_reallocation", { moves: [{ fromCategory: "Dining out", toCategory: "Savings", amount: 100 }] }], categorize: ["categorize_transaction", { id: "tx-1015", category: "Groceries" }], budget: ["set_budget", { category: "Groceries", monthlyLimit: 500 }]
    };
    const [name, args] = presets[action]; let result;
    try { result = tools[name](args); } catch (error) { result = { ok: false, error: error.message }; }
    logCall(name, args, result);
    if (name === "categorize_transaction") { $("landing-transaction").classList.remove("highlighted"); window.setTimeout(() => $("landing-transaction").classList.add("highlighted"), 10); }
    if (name === "set_budget") { const row = document.querySelector('[data-budget-row="Groceries"]'); if (row) { row.classList.remove("flash"); window.setTimeout(() => row.classList.add("flash"), 10); } }
  }

  function undo() { const snapshot = state.undoStack.pop(); if (!snapshot) return; if (snapshot.type === "category") { const tx = transactionById(snapshot.id); if (tx) tx.category = snapshot.previous; } else { const category = categoryByName(snapshot.category); if (category) category.budget = snapshot.previous; } state.activity = "Last write undone — you are back in control"; render(); $("landing-transaction").classList.remove("highlighted"); showToast("Last write undone"); logCall("undo_last_write", {}, { ok: true, restored: snapshot }); }

  function registerLandingTools() {
    const context = [document.modelContext, typeof navigator !== "undefined" ? navigator.modelContext : null, typeof navigator !== "undefined" ? navigator.modelContextTesting : null, typeof window !== "undefined" ? window.modelContext : null].find((candidate) => candidate && typeof candidate.registerTool === "function");
    if (!context) return;
    const definitions = [
      ["get_transactions", "Read the fictional LedgerLab transactions when the agent needs ledger evidence.", { type: "object", properties: { category: { type: "string" }, period: { type: "string" } }, additionalProperties: false }],
      ["get_categories", "Read current fictional category budgets and spending before making a recommendation.", { type: "object", properties: {}, additionalProperties: false }],
      ["flag_anomaly", "Find recurring subscriptions and unusual outliers in the fictional ledger.", { type: "object", properties: {}, additionalProperties: false }],
      ["simulate_reallocation", "Model a budget move and create a visible pending plan; it does not change budgets until a human approves.", { type: "object", required: ["moves"], properties: { moves: { type: "array", items: { type: "object", required: ["fromCategory", "toCategory", "amount"], properties: { fromCategory: { type: "string" }, toCategory: { type: "string" }, amount: { type: "number" } }, additionalProperties: false } } }, additionalProperties: false }],
      ["categorize_transaction", "Reassign a fictional transaction; this immediately updates the visible playground and is undoable by the human.", { type: "object", required: ["id", "category"], properties: { id: { type: "string" }, category: { type: "string" } }, additionalProperties: false }],
      ["set_budget", "Change a fictional category limit; this immediately updates the visible playground and is undoable by the human.", { type: "object", required: ["category", "monthlyLimit"], properties: { category: { type: "string" }, monthlyLimit: { type: "number", minimum: 0 } }, additionalProperties: false }]
    ];
    definitions.forEach(([name, description, inputSchema]) => context.registerTool({ name, description, inputSchema, execute: async (args) => tools[name](args || {}) }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    render(); registerLandingTools();
    if (window.lucide) window.lucide.createIcons();
    document.querySelectorAll("[data-playground-action]").forEach((button) => button.addEventListener("click", () => runPreset(button.dataset.playgroundAction)));
    $("landing-undo").addEventListener("click", undo);
    document.addEventListener("click", (event) => { const action = event.target.closest("[data-plan-action]")?.dataset.planAction; if (!action || !state.pendingPlan) return; if (action === "approve") { state.pendingPlan.moves.forEach((move) => { const from = categoryByName(move.fromCategory); const to = categoryByName(move.toCategory); tools.set_budget({ category: from.name, monthlyLimit: from.budget - move.amount }); tools.set_budget({ category: to.name, monthlyLimit: to.budget + move.amount }); }); state.pendingPlan = null; state.activity = "Plan approved — budgets updated with your permission"; render(); showToast("Plan approved — budgets updated"); logCall("approve_plan", {}, { ok: true, message: "Human approval applied the budget writes" }); } else { state.pendingPlan = null; state.activity = "Proposal rejected — no budget changed"; render(); showToast("Proposal rejected — no budget changed"); logCall("reject_plan", {}, { ok: true, message: "Proposal dismissed" }); } });
    const tabCopy = { tools: ["blocks", "Tool map:", "reads inform the proposal, simulation creates a reviewable plan, and writes only happen after a human decision."], activity: ["radio", "Activity trail:", "every preset call leaves a visible trace in the terminal and the live activity line below it."], trust: ["lock-keyhole", "Trust boundary:", "the agent can prepare the move — only your click on Approve changes the budget." ] };
    document.querySelectorAll("[data-bento-tab]").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll("[data-bento-tab]").forEach((item) => { item.classList.toggle("active", item === tab); item.setAttribute("aria-selected", item === tab ? "true" : "false"); }); const [icon, label, text] = tabCopy[tab.dataset.bentoTab]; $("bento-tab-output").innerHTML = `<i data-lucide="${icon}"></i><span><strong>${label}</strong> ${text}</span>`; if (window.lucide) window.lucide.createIcons(); }));
  });
}());
