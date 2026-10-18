-- Run only after G20-A/B/C on an isolated Supabase test project.
-- Exercises the real availability function used by total, variant and matrix holds.
begin;
do $$
begin
  if not private.kinto_stock_available_g20c(1,0,1) then raise exception 'last physical unit should be reservable'; end if;
  if private.kinto_stock_available_g20c(1,1,1) then raise exception 'a live hold must block a second last-unit reservation'; end if;
  if not private.kinto_stock_available_g20c(5,2,3) then raise exception 'remaining stock boundary should allow exact quantity'; end if;
  if private.kinto_stock_available_g20c(5,2,4) then raise exception 'remaining stock boundary oversold'; end if;
  if not private.kinto_stock_available_g20c(null,500,1) then raise exception 'unmanaged null stock must preserve legacy unlimited behavior'; end if;
  if private.kinto_stock_available_g20c(4,0,0) then raise exception 'zero requested quantity must be rejected'; end if;
end $$;
rollback;
