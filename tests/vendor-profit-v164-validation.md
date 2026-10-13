V164 isolates the acceptance test to KN-000100. It does not delete or rewrite historical orders, expenses, settlement periods, or the V163 archive.

Run the browser fixture through the existing Playwright suite. It mocks only the three V164 RPCs and verifies the cost gate, cost confirmation, expense subtraction, and matching archived payable.

Standalone SQL and DOM checks:

```sh
npm install --prefix /tmp/kinto-v164-tests @electric-sql/pglite jsdom
NODE_PATH=/tmp/kinto-v164-tests/node_modules node tests/vendor-profit-v164.cjs
NODE_PATH=/tmp/kinto-v164-tests/node_modules node tests/vendor-profit-v164-dom.cjs
```

SQL tests execute the migration in an isolated PostgreSQL-compatible engine with fixture tables and fixture session guards. They cover the missing-cost gate, owner isolation, preview-change rejection, idempotent cost capture, fixed exchange rate, quantities, expenses, archive immutability, and direct-table permission denial. Production session validation is delegated to the existing private.require_vendor_session.

Acceptance: apply V164 SQL; open merchant P&L; only KN-000100 should appear. Before cost confirmation, profit is incomplete. Review unit cost USD 50 and order FX 1750, then confirm capture. Cost becomes IQD 87,500, archived payable stays IQD 110,700, and profit before expenses is IQD 23,200. The cost snapshot is immutable. A later product price or store FX change must not alter it. Missing product cost or order FX blocks capture.

The new expense journal belongs only to this test order and changes profit, never the manager's settlement payable. Historic P&L period closure is removed from this test UI; growth metrics and general rollout are deferred.
