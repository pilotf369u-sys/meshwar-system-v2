# Independent global-order workflow — review draft

This is an additive first implementation for owner review, not an activated production route.
No changes to existing orders, payments, inventory, invoices, vendor routing, local staff panels, login guards or deployment settings. No live SQL or real transfer/payment is performed by development or tests.

New isolated private tables own requests, global staff assignment, transaction-reference records and an append-only API audit. New RPCs reuse verified customer/admin/employee session guards. An employee must ALSO be explicitly assigned global permission; local employee login alone grants no access. Revocation is checked on every call. This does not remove any local rights an existing employee already possesses. A new account restricted only to global work still needs a dedicated account/access design before assigning a new hire.

Workflow: customer review request → staff shipping/availability review → expiring final quote (merchandise + staff-confirmed shipping) → customer agrees and reports transfer → staff verifies actual receipt and exact total/currency → paid → purchase after availability and price recheck → shipment → delivery. Paid problems go to refund review; recorded refund requires full amount and actual reference. These APIs RECORD staff verification; they do not execute bank transfers or refunds. Unique bank references stop reuse within this module. Cross-check against other bank activity remains a staff responsibility.

Gateway option is reserved and disabled. No existing local payment creation or callback is reused: activating it requires a separate global payment intent, authenticated provider callback, amount/currency/revision checks, idempotent settlement and refund support. Never infer payment from a browser return URL.

The server recomputes submission estimates from approved pricing; these estimates are NOT a payable amount and never authorize purchase. Staff final quote includes explicit shipping and availability acknowledgment. Revision locking rejects stale actions; idempotency keys prevent duplicate customer submissions. Customer data and estimates are separate: exchange-rate/commission snapshots stay private. Requests include confirmed product options and recipient details; images and multi-product basket editing remain follow-up work.

Staged pages:
- global-order-review.html: customer login context, optional product draft in #draft URL-encoded JSON, explicit policy consent, owned requests and transfer reference.
- global-staff-workspace.html: separate workspace using existing session helpers; admin can assign global permission. No menu injected into any existing local panel.

The staged Android source adds an explicit last-product review handoff from the local draft dialog into the trusted shopkinto.com customer renderer. A persisted request UUID prevents duplicate submission on retry; synthetic fixtures are rejected. The web page still requires customer policy consent and recipient details before submission. No account token crosses into the external shopping process. This source is NOT released: installed Preview 0.4/0.5 continue local TEST storage. Release requires owner-approved SQL activation and manual hosting deployment of the new pages; this PR does not publish an APK. Only one product per request is wired in this stage; a multi-product cart remains follow-up work.

Before activation: owner review/approval of SQL, verify real guard behavior and permissions in staging; browser interaction tests; native handoff and account continuity test; clarify final shipping certainty and out-of-stock refund handling. Before production gateway payment: implement and test separate adapter settlement. The SQL file is deliberately not in automatic migrations.

Rollback: revoke all execution on the four public kinto_world_* functions. Preserve private tables and ledger/history. Do not touch any local order/payment functions or delete paid records.

Validation workflow uses disposable PostgreSQL 17 and dummy session guards only. Production credentials, customer sessions and real orders are never required.
