# LedgerLab

LedgerLab is a static, WebMCP-enabled personal budget co-pilot for the OpenAI WebMCP Challenge. The live workspace starts fresh with an empty account, zeroed category templates, and no transactions. Any data a visitor enters is fictional and stays in the page; there is no banking connection, backend, or network request. The landing-page playground uses a separate fictional sandbox so the collaboration loop remains easy to demonstrate.

## Why WebMCP fits

Finance dashboards are difficult for an agent to use reliably through pixels alone. LedgerLab exposes six small, structured tools so an agent can read the exact ledger, inspect budgets, identify recurring or unusual spending, and compute a reallocation. The person remains the decision-maker: a simulated reallocation appears as a pending plan, and only a human click on **Approve changes** applies the budget writes.

## Try these agent prompts

Paste any of these into an agent that can call the page's WebMCP tools:

1. “Find subscriptions I'm paying for and propose moving $100/mo from Dining out to Savings.”
2. “Flag anything unusual in my spending this month.”
3. “Show my restaurant overspend and suggest a fix.”

For a visible write demo, you can also ask: “Move transaction tx-1015 from Dining out to Shopping if that looks more accurate.” The row highlights immediately after the agent changes it.

## Run locally

No install or build step is needed. Serve this directory over HTTP so browser APIs behave normally:

```bash
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) for the landing page or [http://localhost:8080/app.html](http://localhost:8080/app.html) for the fresh ledger. An HTTP server is recommended for browser testing.

## Test WebMCP

The deployed page includes a WebMCP origin-trial meta tag, so Chrome 149+ users can connect without enabling a flag. Open the site in the ChatGPT in-app browser, which works out of the box, or use Chrome with WebMCP testing enabled at `chrome://flags/#enable-webmcp-testing` for local/flag-based testing. The top-right connection card should say **WebMCP connected**.

In Chrome's DevTools console, verify registration with:

```js
navigator.modelContextTesting.listTools()
```

The list should contain `get_transactions`, `get_categories`, `flag_anomaly`, `simulate_reallocation`, `categorize_transaction`, and `set_budget`.

Walkthrough:

1. Add a few fictional transactions and set category budgets in the fresh workspace, or use the landing-page sandbox. Run the subscription prompt. The agent reads the ledger, then calls `simulate_reallocation`; a proposal appears under **Pending agent plan**. Click **Approve changes** and watch both category budgets and the activity log update.
2. Run the anomaly prompt. The agent should receive recurring subscription findings and dining/shopping outlier evidence without needing to scrape the table.
3. Run the restaurant prompt. The agent can call `get_categories` and `get_transactions`, explain the overspend, and propose a move. Reject or approve the resulting card.

## WebMCP implementation

Tools are registered on `DOMContentLoaded` after the empty workspace state is available:

```js
document.modelContext.registerTool({
  name,
  description,
  inputSchema,
  execute: async (args) => toolExecutor(args)
})
```

Every tool has a JSON-Schema-style `inputSchema`. Read tools return compact arrays or objects. `categorize_transaction` and `set_budget` mutate the shared state and synchronously re-render the relevant UI, show a toast, and write to the live activity log. `simulate_reallocation` is pure computation from the agent's point of view: it returns projected category limits and creates a pending proposal; it never mutates budgets. Approving the proposal invokes the same `set_budget` write executor used by the WebMCP tool.

If `document.modelContext` is unavailable, registration is skipped safely and the app shows: “WebMCP not detected — open in ChatGPT in-app browser or Chrome with WebMCP enabled”. The rest of the dashboard remains fully usable manually.

## Files

- `index.html` — marketing experience and fictional tool sandbox
- `app.html` — accessible fresh dashboard markup and transaction dialog
- `styles.css` — responsive visual system
- `app.js` — fresh workspace state, UI rendering, human controls, and WebMCP tools
- `LICENSE` — MIT license

LedgerLab is a fictional demo. It is not financial advice and does not connect to real accounts.
