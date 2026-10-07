# نقطة طوارئ — المخزون والخصم وواجهة العميل 🚩

Saved 2026-10-07 after owner confirmation of the live customer tests.

Application baseline: d180da5cf65d12149a819dc73bd7f959f282a8f9 on main, after PRs #858–#862.

Confirmed: paid orders deduct total and selected variants; pricing sync does not overwrite concurrent variant deductions; multiword variant names match merchant input; zero-stock variants/combinations are hidden; sold-out product cards remain visible with ordering disabled; customer quantity limits count existing cart usage; checkout blocks a stale cart and explains the available quantity.

Installed Supabase stock configuration: public.kinto_apply_option_stock_v47, public.kinto_bundle_stock_link_v47, and trg_meshwar_local_cart_bundle_stock_lifecycle connected to the latter. Their previously installed SQL source is included in this checkpoint, since these definitions were applied manually and are not assumed to be present in main migrations.

Emergency restoration: restore application files from this checkpoint's commit. If database stock functions or the trigger connection have subsequently changed, review those changes and use restore_v47_stock_functions.sql to restore the tested V47 definitions. The SQL script does not replay paid orders, reset inventory or restore database rows. Do not run historical deduction twice.

This checkpoint preserves repository code and SQL definitions, not a complete live Supabase data backup. The case where stock runs out after an order is created but before payment is still pending and is not claimed fixed here.
