# مخزون وخصم كامل 🚩

Checkpoint saved 2026-10-07 after the owner confirmed the fresh paid-order test succeeded and persisted after reloading the vendor panel.

Application baseline: main commit 15c6a0ca7b36c8948e29739b97f9862ecc51c9c4 (merged PR #858). Includes the merged V46 variant editor caps and V48 pricing synchronization protection.

Supabase configuration reported installed and tested by the owner: public.kinto_apply_option_stock_v47, public.kinto_bundle_stock_link_v47, and trg_meshwar_local_cart_bundle_stock_lifecycle targeting the V47 function. The installed SQL source is preserved alongside this document because PR #857 was not part of the main baseline at checkpoint creation.

Confirmed scenario: total 48, orange 24, purple 24; pay a new order for two orange units; total 46, orange 22, purple 24; quantities remain correct after reloading. Isolated V47 tests also passed duplicate prevention and helper tests for variant groups and combinations.

Restore application files from this checkpoint. If the stock functions or trigger connection are subsequently changed, use 20261007_v47_bundle_stock_link.sql to restore these definitions after reviewing the intervening database changes. This script does not replay old paid orders or reset inventory values. The preflight script uses fixtures and rolls back. The rollback script intentionally restores the older pre-V47 hook and is not the script for restoring this successful checkpoint.

This checkpoint preserves repository code and SQL definitions, not a live Supabase database/data backup. Customer quantity limits remain a separate pending task.
