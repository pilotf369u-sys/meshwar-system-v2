-- Run only after G20-A + G20-B on an isolated Supabase test project.
-- These execute the installed PL/pgSQL helper against realistic option maps.
begin;
do $$
declare
  valid_options jsonb := '{
    "colors":["أحمر","أزرق"],
    "sizes":["S","M"],
    "volumes":["500ml"],
    "variant_stock":{"color":{"أحمر":2,"أزرق":0},"size":{"S":4,"M":3},"volume":{"500ml":3}},
    "matrix_stock":{"أحمر_S_500ml":1,"أحمر_M_500ml":2,"أزرق_S_500ml":0}
  }'::jsonb;
begin
  if not private.kinto_payment_options_valid_g20(valid_options,'{"color":"أحمر","size":"S","volume":"500ml"}'::jsonb) then
    raise exception 'expected configured combination to be valid';
  end if;
  if private.kinto_payment_options_valid_g20(valid_options,'{"color":"أحمر","size":"S"}'::jsonb) then
    raise exception 'matrix-required volume omission was accepted';
  end if;
  if private.kinto_payment_options_valid_g20(valid_options,'{"color":"أحمر","size":"L","volume":"500ml"}'::jsonb) then
    raise exception 'unknown size was accepted';
  end if;
  if private.kinto_payment_options_valid_g20(valid_options,'{"color":"أزرق","size":"S","volume":"500ml"}'::jsonb) then
    raise exception 'zero-stock matrix combination was accepted';
  end if;
  if private.kinto_payment_options_valid_g20(valid_options,'{"color":"أحمر","size":"S","volume":"1L"}'::jsonb) then
    raise exception 'unknown volume was accepted';
  end if;
  if private.kinto_payment_options_valid_g20(valid_options,'{"color":"أحمر","size":"M","volume":"500ml"}'::jsonb) is distinct from true then
    raise exception 'valid available combination was rejected';
  end if;
end $$;
rollback;
