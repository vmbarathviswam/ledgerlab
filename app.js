/* LedgerLab — static WebMCP demo. All data is fictional and stays in this page. */
(function () {
  "use strict";

  const DEMO_PERIOD = "2026-08";
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const fullDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  const icons = { Checking: "⌁", Savings: "◒", Credit: "▣" };

  const state = {
    accounts: [
      { id: "checking", name: "Everyday checking", type: "Fresh ledger", balance: 0 }
    ],
    categories: [
      { id: "housing", name: "Housing", budget: 0, color: "teal" },
      { id: "groceries", name: "Groceries", budget: 0, color: "teal" },
      { id: "dining", name: "Dining out", budget: 0, color: "coral" },
      { id: "transport", name: "Transport", budget: 0, color: "teal" },
      { id: "subscriptions", name: "Subscriptions", budget: 0, color: "gold" },
      { id: "shopping", name: "Shopping", budget: 0, color: "gold" },
      { id: "savings", name: "Savings", budget: 0, color: "teal" }
    ],
    transactions: [],
    pendingPlans: [],
    undoStack: [],
    activity: [],
    highlightedTransactionId: null,
    budgetHighlight: null
  };

  const $ = (id) => document.getElementById(id);
  const isExpense = (tx) => tx.type !== "income" && tx.amount < 0;
  const expenseValue = (tx) => isExpense(tx) ? Math.abs(tx.amount) : 0;
  const formatMoney = (value) => currency.format(value);
  const formatSignedMoney = (value) => `${value < 0 ? "−" : "+"}${formatMoney(Math.abs(value))}`;
  const categoryByName = (name) => state.categories.find((category) => category.name.toLowerCase() === String(name || "").toLowerCase());
  const transactionById = (id) => state.transactions.find((transaction) => transaction.id === id);
  const monthTransactions = () => state.transactions.filter((tx) => tx.date.startsWith(DEMO_PERIOD));
  const nowLabel = () => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date());

  function categorySpent(categoryName, period) {
    return state.transactions.filter((tx) => (!period || tx.date.startsWith(period)) && tx.category === categoryName).reduce((sum, tx) => sum + expenseValue(tx), 0);
  }

  function render() {
    renderMetrics();
    renderAccounts();
    renderCategories();
    renderPlans();
    renderTransactions();
    renderActivity();
    populateCategorySelect();
  }

  function renderMetrics() {
    const expenses = monthTransactions().reduce((sum, tx) => sum + expenseValue(tx), 0);
    const budget = state.categories.reduce((sum, category) => sum + category.budget, 0);
    const available = Math.max(0, budget - expenses);
    const total = state.accounts.reduce((sum, account) => sum + account.balance, 0);
    $("total-balance").textContent = formatMoney(total);
    $("monthly-spend").textContent = formatMoney(expenses);
    $("available-to-plan").textContent = formatMoney(available);
    $("account-count").textContent = `${state.accounts.length} ${state.accounts.length === 1 ? "empty account" : "accounts"}`;
    $("spend-foot").textContent = `${formatMoney(budget)} total category budget`;
    $("spend-foot").className = `metric-foot ${expenses > budget ? "warning" : ""}`;
  }

  function renderAccounts() {
    $("accounts-list").innerHTML = state.accounts.map((account) => `<div class="account-row"><div class="account-left"><span class="account-icon">${icons[account.name.includes("fund") ? "Savings" : account.name.includes("rewards") ? "Credit" : "Checking"]}</span><div><span class="account-name">${escapeHtml(account.name)}</span><span class="account-type">${escapeHtml(account.type)}</span></div></div><span class="account-balance ${account.balance < 0 ? "negative" : ""}">${formatMoney(account.balance)}</span></div>`).join("");
  }

  function renderCategories() {
    $("categories-list").innerHTML = state.categories.map((category) => {
      const spent = categorySpent(category.name, DEMO_PERIOD);
      const percentage = category.budget ? Math.min(100, Math.round((spent / category.budget) * 100)) : 0;
      const over = spent > category.budget;
      return `<div class="category-row ${state.budgetHighlight === category.name ? "row-highlight" : ""}"><div class="category-top"><span class="category-name">${escapeHtml(category.name)}</span><span class="category-values"><strong>${formatMoney(spent)}</strong> / ${formatMoney(category.budget)}</span></div><div class="bar-track" aria-label="${escapeHtml(category.name)}: ${formatMoney(spent)} spent of ${formatMoney(category.budget)} budget"><div class="bar-fill ${over ? "over" : ""}" style="width:${percentage}%"></div></div><div class="budget-line"><span class="muted">Limit</span><input aria-label="${escapeHtml(category.name)} monthly budget" data-budget-input="${escapeHtml(category.name)}" type="number" min="0" step="10" value="${category.budget}" /><button type="button" data-action="save-budget" data-category="${escapeHtml(category.name)}">Save</button>${over ? '<span class="metric-foot warning">Over budget</span>' : ""}</div></div>`;
    }).join("");
  }

  function renderPlans() {
    const plans = $("plans-list");
    $("plan-count").textContent = String(state.pendingPlans.length);
    if (!state.pendingPlans.length) {
      plans.innerHTML = '<div class="empty-state plan-empty"><span class="empty-icon">✦</span><strong>No proposal yet</strong><span>Ask your agent to simulate a reallocation. Suggestions will land here for your review.</span></div>';
      return;
    }
    plans.innerHTML = state.pendingPlans.map((plan) => `<article class="plan-card"><div class="plan-card-header"><h3>Reallocation proposal</h3><span class="plan-time">${escapeHtml(plan.createdAt)}</span></div><ul class="move-list">${plan.moves.map((move) => `<li><span>${escapeHtml(move.fromCategory)} <span class="move-arrow">→</span> ${escapeHtml(move.toCategory)}</span><strong>${formatMoney(move.amount)}/mo</strong></li>`).join("")}</ul><p class="projected-note">Projected: ${formatMoney(plan.projectedTotalBudget)} total monthly budget · Review each category limit below after approval.</p><div class="plan-actions"><button class="button button-primary button-small" type="button" data-action="approve-plan" data-plan-id="${plan.id}">Approve changes</button><button class="button button-ghost button-small" type="button" data-action="reject-plan" data-plan-id="${plan.id}">Reject</button></div></article>`).join("");
  }

  function renderTransactions() {
    const transactions = monthTransactions().sort((a, b) => b.date.localeCompare(a.date));
    $("transaction-count").textContent = String(transactions.length);
    $("transactions-body").innerHTML = transactions.length ? transactions.map((tx) => `<tr class="transaction-row ${state.highlightedTransactionId === tx.id ? "row-highlight" : ""}" data-transaction-id="${tx.id}"><td class="date-cell">${dateFormatter.format(new Date(`${tx.date}T12:00:00`))}</td><td><span class="merchant-cell"><span class="merchant-icon">${merchantIcon(tx.merchant)}</span>${escapeHtml(tx.merchant)}</span></td><td><span class="category-chip">${escapeHtml(tx.category)}</span></td><td class="amount-cell"><span class="amount ${tx.amount >= 0 ? "income" : ""}">${formatSignedMoney(tx.amount)}</span></td><td class="actions-cell"><div class="row-actions"><button type="button" data-action="edit-transaction" data-id="${tx.id}" aria-label="Edit ${escapeHtml(tx.merchant)}">Edit</button><button type="button" data-action="delete-transaction" data-id="${tx.id}" aria-label="Delete ${escapeHtml(tx.merchant)}">Delete</button></div></td></tr>`).join("") : '<tr><td colspan="5" class="empty-row">No transactions in this period.</td></tr>';
  }

  function renderActivity() {
    const undoButton = $("undo-agent-change");
    if (undoButton) undoButton.disabled = state.undoStack.length === 0;
    $("activity-log").innerHTML = state.activity.length ? state.activity.slice().reverse().map((item) => `<div class="activity-item ${item.actor === "agent" ? "agent" : item.actor === "human" ? "human" : ""}"><span class="activity-marker"></span><div><strong>${escapeHtml(item.text)}</strong><time>${escapeHtml(item.actor === "agent" ? "Agent · " : item.actor === "human" ? "You · " : "System · ")}${escapeHtml(item.time instanceof Date ? nowOrDate(item.time) : item.time)}</time></div></div>`).join("") : '<div class="empty-state"><strong>No activity yet</strong><span>Your actions and agent calls will appear here.</span></div>';
  }

  function nowOrDate(date) { return date.toDateString() === new Date().toDateString() ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date) : fullDateFormatter.format(date); }
  function merchantIcon(merchant) { return merchant.toLowerCase().includes("deposit") ? "↓" : merchant.toLowerCase().includes("market") || merchant.toLowerCase().includes("basket") ? "⌂" : merchant.toLowerCase().includes("apart") ? "▤" : merchant.toLowerCase().includes("pass") ? "↝" : "•"; }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
  function logActivity(text, actor = "agent") { state.activity.push({ text, actor, time: new Date() }); renderActivity(); }
  function toast(message, kind = "success") { const element = document.createElement("div"); element.className = `toast ${kind}`; element.textContent = message; $("toast-region").appendChild(element); window.setTimeout(() => element.remove(), 3800); }
  function highlightTransaction(id) { state.highlightedTransactionId = id; renderTransactions(); window.setTimeout(() => { if (state.highlightedTransactionId === id) { state.highlightedTransactionId = null; renderTransactions(); } }, 4200); }
  function highlightBudget(category) { state.budgetHighlight = category; renderCategories(); window.setTimeout(() => { if (state.budgetHighlight === category) { state.budgetHighlight = null; renderCategories(); } }, 4200); }

  function populateCategorySelect() {
    const select = $("transaction-category");
    if (!select) return;
    const current = select.value;
    select.innerHTML = [...state.categories.map((category) => category.name), "Income"].map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
    if (current) select.value = current;
  }

  const toolDefinitions = [
    { name: "get_transactions", description: "Read the user's mock ledger when you need transaction-level evidence. Optionally filter by category and period (YYYY-MM). Read-only; this does not change the on-screen dashboard.", inputSchema: { type: "object", properties: { category: { type: "string", description: "Category name, such as Dining out" }, period: { type: "string", description: "Month filter in YYYY-MM format, such as 2026-08" } }, additionalProperties: false } },
    { name: "get_categories", description: "Read current category budgets and August spending before making a recommendation. Read-only; this does not change the on-screen dashboard.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "flag_anomaly", description: "Inspect the full mock ledger for unusual outliers and recurring subscriptions when the user asks what looks wasteful or unexpected. Read-only; this does not change the on-screen dashboard.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    { name: "simulate_reallocation", description: "Use after reading categories to model moving monthly budget between categories. This is pure computation: it creates a visible pending proposal for human review but does not change budgets until the human approves it.", inputSchema: { type: "object", required: ["moves"], properties: { moves: { type: "array", minItems: 1, items: { type: "object", required: ["fromCategory", "toCategory", "amount"], properties: { fromCategory: { type: "string" }, toCategory: { type: "string" }, amount: { type: "number", exclusiveMinimum: 0 } }, additionalProperties: false } } }, additionalProperties: false } },
    { name: "categorize_transaction", description: "Use when a transaction is in the wrong category. WRITE: this reassigns the transaction and updates the on-screen dashboard immediately with a toast and highlighted row so the human can watch the change. Any change is immediately visible, toast-logged, and undoable by the human.", inputSchema: { type: "object", required: ["id", "category"], properties: { id: { type: "string", description: "Transaction id from get_transactions" }, category: { type: "string", description: "Existing category name" } }, additionalProperties: false } },
    { name: "set_budget", description: "Use when the user approves a budget change or explicitly asks to update a category limit. WRITE: this mutates visible UI state immediately and shows a toast on the on-screen dashboard. Any change is immediately visible, toast-logged, and undoable by the human.", inputSchema: { type: "object", required: ["category", "monthlyLimit"], properties: { category: { type: "string", description: "Existing category name" }, monthlyLimit: { type: "number", minimum: 0, description: "New monthly budget in USD" } }, additionalProperties: false } }
  ];

  const toolExecutors = {
    get_transactions(args = {}) {
      const category = args.category ? String(args.category).toLowerCase() : null;
      const period = args.period ? String(args.period) : null;
      const transactions = state.transactions.filter((tx) => (!period || tx.date.startsWith(period)) && (!category || tx.category.toLowerCase() === category)).map(transactionResult);
      logActivity("Agent read transactions" + (args.category ? ` for category "${args.category}"` : "") + (args.period ? ` in ${args.period}` : "") + ".", "agent");
      return transactions;
    },
    get_categories() {
      const categories = state.categories.map((category) => ({ category: category.name, monthlyLimit: category.budget, spent: Number(categorySpent(category.name, DEMO_PERIOD).toFixed(2)), remaining: Number((category.budget - categorySpent(category.name, DEMO_PERIOD)).toFixed(2)) }));
      logActivity("Agent read category budgets and spending.", "agent");
      return categories;
    },
    flag_anomaly() {
      const findings = [];
      const merchants = [...new Set(state.transactions.map((tx) => tx.merchant))];
      merchants.forEach((merchant) => { const matching = state.transactions.filter((tx) => tx.merchant === merchant && isExpense(tx)); if (matching.length >= 2 && ["cloudbox pro", "streamflix", "fitnow", "musicwave", "newsly"].includes(merchant.toLowerCase())) findings.push({ type: "recurring_subscription", merchant, monthlyAmount: Number((matching.slice(0, 3).reduce((sum, tx) => sum + expenseValue(tx), 0) / Math.min(3, matching.length)).toFixed(2)), occurrences: matching.length, note: "Recurring charge detected" }); });
      state.categories.forEach((category) => { const values = state.transactions.filter((tx) => tx.category === category.name && isExpense(tx)).map(expenseValue); if (values.length >= 3) { const average = values.reduce((a, b) => a + b, 0) / values.length; const outlier = Math.max(...values); if (outlier > average * 1.8) findings.push({ type: "outlier", category: category.name, amount: outlier, average: Number(average.toFixed(2)), note: "One charge is substantially above this category's typical transaction" }); } });
      logActivity("Agent inspected the ledger for anomalies.", "agent");
      return findings;
    },
    simulate_reallocation(args = {}) {
      if (!Array.isArray(args.moves) || !args.moves.length) return { ok: false, error: "moves must contain at least one move" };
      const projected = state.categories.map((category) => ({ category: category.name, monthlyLimit: category.budget }));
      for (const move of args.moves) {
        const amount = Number(move.amount);
        const from = projected.find((category) => category.category.toLowerCase() === String(move.fromCategory).toLowerCase());
        const to = projected.find((category) => category.category.toLowerCase() === String(move.toCategory).toLowerCase());
        if (!from || !to || !Number.isFinite(amount) || amount <= 0 || from.category === to.category) return { ok: false, error: "Each move needs two different existing categories and a positive amount" };
        if (from.monthlyLimit - amount < 0) return { ok: false, error: `Cannot move more than ${from.category} budget` };
        from.monthlyLimit -= amount; to.monthlyLimit += amount;
      }
      const plan = { id: `plan-${Date.now()}`, moves: args.moves.map((move) => ({ fromCategory: categoryByName(move.fromCategory)?.name || move.fromCategory, toCategory: categoryByName(move.toCategory)?.name || move.toCategory, amount: Number(move.amount) })), projectedTotalBudget: projected.reduce((sum, category) => sum + category.monthlyLimit, 0), createdAt: nowLabel() };
      state.pendingPlans.unshift({ ...plan, projected }); renderPlans(); logActivity(`Prepared a ${plan.moves.length}-step reallocation proposal for your review.`, "agent");
      return { ok: true, planId: plan.id, moves: plan.moves, projectedCategories: projected, projectedTotalBudget: plan.projectedTotalBudget };
    },
    categorize_transaction(args = {}, origin = "Agent") {
      const tx = transactionById(args.id); const category = categoryByName(args.category);
      if (!tx) return { ok: false, error: "Transaction not found" }; if (!category) return { ok: false, error: "Category not found" };
      const previous = tx.category; if (origin === "Agent" || origin === "Approved plan") state.undoStack.push({ type: "categorize_transaction", transactionId: tx.id, previousCategory: previous }); tx.category = category.name; render(); highlightTransaction(tx.id); toast(`${tx.merchant} moved to ${category.name}`); logActivity(`${origin} recategorized ${tx.merchant} from ${previous} to ${category.name}.`, origin === "Agent" ? "agent" : "human");
      return { ok: true, id: tx.id, previousCategory: previous, category: tx.category, updatedTransaction: transactionResult(tx) };
    },
    set_budget(args = {}, origin = "Agent") {
      const category = categoryByName(args.category); const monthlyLimit = Number(args.monthlyLimit);
      if (!category) return { ok: false, error: "Category not found" }; if (!Number.isFinite(monthlyLimit) || monthlyLimit < 0) return { ok: false, error: "monthlyLimit must be a non-negative number" };
      const previous = category.budget; if (origin === "Agent" || origin === "Approved plan") state.undoStack.push({ type: "set_budget", category: category.name, previousMonthlyLimit: previous }); category.budget = Number(monthlyLimit.toFixed(2)); render(); highlightBudget(category.name); toast(`${category.name} budget updated to ${formatMoney(category.budget)}`); logActivity(`${origin} changed the ${category.name} budget from ${formatMoney(previous)} to ${formatMoney(category.budget)}.`, origin === "Agent" ? "agent" : "human");
      return { ok: true, category: category.name, previousMonthlyLimit: previous, monthlyLimit: category.budget };
    }
  };

  function transactionResult(tx) { return { id: tx.id, date: tx.date, merchant: tx.merchant, amount: tx.amount, category: tx.category, account: tx.account }; }

  function registerWebMCP() {
    const banner = $("webmcp-banner");
    const candidates = [
      document.modelContext,
      typeof navigator !== "undefined" ? navigator.modelContext : null,
      typeof navigator !== "undefined" ? navigator.modelContextTesting : null,
      typeof window !== "undefined" ? window.modelContext : null
    ];
    const context = candidates.find((candidate) => candidate && typeof candidate.registerTool === "function");
    if (!context || typeof context.registerTool !== "function") {
      banner.classList.remove("is-hidden"); $("agent-status").textContent = "WebMCP unavailable"; $("tool-count").textContent = "Use the app manually or enable WebMCP"; return;
    }
    banner.classList.add("is-hidden");
    toolDefinitions.forEach((definition) => context.registerTool({ ...definition, execute: async (args) => toolExecutors[definition.name](args || {}) }));
    $("agent-status").textContent = "WebMCP connected"; $("tool-count").textContent = `${toolDefinitions.length} structured tools ready`;
    logActivity(`${toolDefinitions.length} structured tools registered for your agent.`, "system");
    window.setTimeout(() => refreshWebMCPDiagnostics(context), 100);
  }

  async function refreshWebMCPDiagnostics(contextOverride) {
    const status = $("diagnostic-status"); const dot = $("diagnostic-dot"); const list = $("webmcp-tool-list");
    if (!status || !dot || !list) return;
    const context = contextOverride || [document.modelContext, typeof navigator !== "undefined" ? navigator.modelContext : null, typeof navigator !== "undefined" ? navigator.modelContextTesting : null, typeof window !== "undefined" ? window.modelContext : null].find((candidate) => candidate && (typeof candidate.getTools === "function" || typeof candidate.listTools === "function"));
    list.replaceChildren(); dot.className = "diagnostic-dot";
    if (!context) { status.textContent = "WebMCP API is not available in this browser"; dot.classList.add("error"); return; }
    try {
      const result = typeof context.getTools === "function" ? await context.getTools() : await context.listTools();
      const tools = Array.isArray(result) ? result : [];
      if (!tools.length) { status.textContent = "API detected, but no tools were returned — refresh the page"; return; }
      tools.map((tool) => tool && tool.name).filter(Boolean).sort().forEach((name) => { const item = document.createElement("li"); item.textContent = name; list.appendChild(item); });
      status.textContent = `${tools.length} structured tools available to the browser agent`;
      dot.classList.add("success");
    } catch (error) { status.textContent = `Tool discovery failed: ${error.message || "unknown error"}`; dot.classList.add("error"); }
  }

  function undoLastAgentChange() {
    const snapshot = state.undoStack.pop();
    if (!snapshot) return;
    if (snapshot.type === "categorize_transaction") {
      const tx = transactionById(snapshot.transactionId);
      if (tx) { const currentCategory = tx.category; tx.category = snapshot.previousCategory; render(); highlightTransaction(tx.id); toast("Last agent change undone"); logActivity(`You undid the agent's category change from ${currentCategory} to ${snapshot.previousCategory}.`, "human"); }
    } else if (snapshot.type === "set_budget") {
      const category = categoryByName(snapshot.category);
      if (category) { const currentLimit = category.budget; category.budget = snapshot.previousMonthlyLimit; render(); highlightBudget(category.name); toast("Last agent change undone"); logActivity(`You undid the agent's ${category.name} budget change from ${formatMoney(currentLimit)} to ${formatMoney(category.budget)}.`, "human"); }
    } else if (snapshot.type === "approved_plan") {
      for (const move of snapshot.moves) {
        const from = categoryByName(move.fromCategory);
        const to = categoryByName(move.toCategory);
        toolExecutors.set_budget({ category: from.name, monthlyLimit: from.budget + move.amount }, "Undo");
        toolExecutors.set_budget({ category: to.name, monthlyLimit: to.budget - move.amount }, "Undo");
      }
      logActivity("You undid the agent's approved reallocation plan.", "human");
    }
  }

  function transactionDialog(mode, tx) {
    $("transaction-dialog").showModal(); $("dialog-title").textContent = mode === "edit" ? "Edit transaction" : "Add transaction"; $("transaction-id").value = tx ? tx.id : ""; $("transaction-merchant").value = tx ? tx.merchant : ""; $("transaction-date").value = tx ? tx.date : `${DEMO_PERIOD}-23`; $("transaction-amount").value = tx ? Math.abs(tx.amount) : ""; $("transaction-type").value = tx && tx.amount >= 0 ? "income" : "expense"; $("transaction-category").value = tx ? tx.category : "Groceries"; window.setTimeout(() => $("transaction-merchant").focus(), 0);
  }

  function saveTransaction(event) {
    event.preventDefault(); const id = $("transaction-id").value; const amount = Number($("transaction-amount").value); const type = $("transaction-type").value; const category = $("transaction-category").value; const date = $("transaction-date").value; const merchant = $("transaction-merchant").value.trim();
    if (!merchant || !date || !Number.isFinite(amount) || amount <= 0) return;
    const signedAmount = type === "income" ? amount : -amount; const existing = id ? transactionById(id) : null;
    if (existing) { const account = state.accounts.find((item) => item.id === existing.account); if (account) account.balance += signedAmount - existing.amount; existing.merchant = merchant; existing.date = date; existing.amount = signedAmount; existing.type = type; existing.category = category; toast("Transaction updated"); logActivity(`You edited ${merchant}.`, "human"); }
    else { const newId = `tx-${Date.now()}`; state.transactions.push({ id: newId, date, merchant, amount: signedAmount, type, category, account: "checking" }); const account = state.accounts.find((item) => item.id === "checking"); if (account) account.balance += signedAmount; toast("Transaction added"); logActivity(`You added ${merchant} to the ledger.`, "human"); }
    $("transaction-dialog").close(); render();
  }

  function approvePlan(planId) {
    const plan = state.pendingPlans.find((item) => item.id === planId); if (!plan) return;
    const undoStackStart = state.undoStack.length;
    for (const move of plan.moves) { const from = categoryByName(move.fromCategory); const to = categoryByName(move.toCategory); toolExecutors.set_budget({ category: from.name, monthlyLimit: from.budget - move.amount }, "Approved plan"); toolExecutors.set_budget({ category: to.name, monthlyLimit: to.budget + move.amount }, "Approved plan"); }
    state.undoStack.splice(undoStackStart);
    state.undoStack.push({ type: "approved_plan", planId: plan.id, moves: plan.moves.map((move) => ({ fromCategory: categoryByName(move.fromCategory).name, toCategory: categoryByName(move.toCategory).name, amount: move.amount })) });
    state.pendingPlans = state.pendingPlans.filter((item) => item.id !== planId); renderPlans(); toast("Plan approved — budgets updated"); logActivity("You approved the agent's reallocation plan.", "human");
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action]"); if (!target) return; const action = target.dataset.action;
    if (action === "save-budget") { const input = document.querySelector(`[data-budget-input="${CSS.escape(target.dataset.category)}"]`); toolExecutors.set_budget({ category: target.dataset.category, monthlyLimit: Number(input.value) }, "You"); }
    if (action === "approve-plan") approvePlan(target.dataset.planId);
    if (action === "reject-plan") { state.pendingPlans = state.pendingPlans.filter((plan) => plan.id !== target.dataset.planId); renderPlans(); toast("Proposal rejected"); logActivity("You rejected a pending proposal.", "human"); }
    if (action === "edit-transaction") transactionDialog("edit", transactionById(target.dataset.id));
    if (action === "delete-transaction") { const tx = transactionById(target.dataset.id); if (tx && window.confirm(`Delete ${tx.merchant}?`)) { const account = state.accounts.find((item) => item.id === tx.account); if (account) account.balance -= tx.amount; state.transactions = state.transactions.filter((item) => item.id !== tx.id); render(); toast("Transaction deleted"); logActivity(`You deleted ${tx.merchant}.`, "human"); } }
  }

  document.addEventListener("DOMContentLoaded", () => {
    render(); registerWebMCP();
    $("refresh-webmcp-tools").addEventListener("click", () => refreshWebMCPDiagnostics());
    document.addEventListener("click", handleClick);
    $("undo-agent-change").addEventListener("click", undoLastAgentChange);
    $("add-transaction-button").addEventListener("click", () => transactionDialog("add"));
    $("transaction-form").addEventListener("submit", saveTransaction);
    $("cancel-dialog").addEventListener("click", () => $("transaction-dialog").close());
    $("close-dialog").addEventListener("click", () => $("transaction-dialog").close());

    const playgroundPresets = {
      subscriptions: { name: "flag_anomaly", args: {} },
      anomalies: { name: "flag_anomaly", args: {} },
      reallocation: { name: "simulate_reallocation", args: { moves: [{ fromCategory: "Dining out", toCategory: "Savings", amount: 100 }] } },
      categorize: { name: "categorize_transaction", args: null },
      budget: { name: "set_budget", args: { category: "Groceries", monthlyLimit: 500 } }
    };
    const playgroundConsole = $("tool-playground-console");
    document.querySelectorAll("[data-tool-preset]").forEach((button) => button.addEventListener("click", async () => {
      const preset = playgroundPresets[button.dataset.toolPreset];
      if (!preset || !window.LedgerLab) return;
      const args = button.dataset.toolPreset === "categorize" ? { id: state.transactions[0]?.id || "add-a-transaction-first", category: "Shopping" } : preset.args;
      const call = `> ${preset.name}(${JSON.stringify(args)})`;
      button.disabled = true;
      playgroundConsole.textContent = `${call}\n\n✦ Running…`;
      try {
        const result = await Promise.resolve(window.LedgerLab.executeTool(preset.name, args));
        playgroundConsole.textContent = `${call}\n\n✦ ${JSON.stringify(result, null, 2)}`;
      } catch (error) {
        playgroundConsole.textContent = `${call}\n\n✦ ${JSON.stringify({ ok: false, error: error.message || "Tool call failed" }, null, 2)}`;
      } finally {
        button.disabled = false;
      }
    }));
  });

  window.LedgerLab = { state, tools: toolDefinitions.map((tool) => tool.name), executeTool: (name, args) => toolExecutors[name] ? toolExecutors[name](args) : { ok: false, error: "Unknown tool" } };
}());
