-- Finance operations sample data for Oceana Gardens: quotes for upcoming contract renewals and a
-- one-off repair, so the quote comparison has several jobs to compare (the roof quotes come from seed.sql).
-- Safe to run more than once: each job is only added if it does not exist yet.

do $$
declare
  oc uuid := '0cea0a00-0000-4000-8000-000000000001';
  garden uuid := (select id from public.suppliers where community_id = oc and name = 'Jardines del Sol S.L.');
  cleaning uuid := (select id from public.suppliers where community_id = oc and name = 'LimpiaMax Servicios');
  pool uuid := (select id from public.suppliers where community_id = oc and name = 'AquaClear Piscinas');
begin
  if not exists (select 1 from public.quotes where community_id = oc and job_title = 'Garden maintenance from January') then
    insert into public.quotes (community_id, job_title, supplier_id, supplier_name, amount_cents, valid_until, chosen, notes, created_at) values
      (oc, 'Garden maintenance from January', garden, 'Jardines del Sol S.L.', 1056000, current_date + 40, false,
       'Price per year, €880 a month. Same team as now, price fixed for two years.', now() - interval '12 days'),
      (oc, 'Garden maintenance from January', null, 'Verde Costa Jardinería', 984000, current_date + 30, false,
       'Price per year, €820 a month. Includes an irrigation check every quarter.', now() - interval '9 days'),
      (oc, 'Garden maintenance from January', null, 'Paisajismo Marbella', 1140000, current_date + 25, false,
       'Price per year. Weekly visits, palm pruning twice a year included.', now() - interval '6 days');
  end if;

  if not exists (select 1 from public.quotes where community_id = oc and job_title = 'Common area cleaning from December') then
    insert into public.quotes (community_id, job_title, supplier_id, supplier_name, amount_cents, valid_until, chosen, notes, created_at) values
      (oc, 'Common area cleaning from December', cleaning, 'LimpiaMax Servicios', 1728000, current_date + 20, false,
       'Price per year, €1,440 a month. Same hours as the current contract.', now() - interval '15 days'),
      (oc, 'Common area cleaning from December', null, 'Brillo Limpiezas Costa', 1596000, current_date + 21, false,
       'Price per year. Stairs daily, windows and garage weekly.', now() - interval '10 days'),
      (oc, 'Common area cleaning from December', null, 'CleanCoast Services', 1650000, current_date - 5, false,
       'Price per year. Asked them to extend the offer.', now() - interval '40 days');
  end if;

  if not exists (select 1 from public.quotes where community_id = oc and job_title = 'Pool pump and filter replacement') then
    insert into public.quotes (community_id, job_title, supplier_id, supplier_name, amount_cents, valid_until, chosen, notes, created_at) values
      (oc, 'Pool pump and filter replacement', pool, 'AquaClear Piscinas', 348000, current_date + 45, false,
       'Pump, sand filter and labour. Two-year warranty. Can be done in November.', now() - interval '4 days'),
      (oc, 'Pool pump and filter replacement', null, 'Bombas y Piscinas Málaga', 295000, current_date + 30, false,
       'Pump only, the filter is not included.', now() - interval '2 days');
  end if;
end $$;
