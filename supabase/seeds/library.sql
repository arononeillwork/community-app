-- Library sample data for Oceana Gardens (runs after supabase/seed.sql): Bins & info, Local area, Documents.
--   * Readable text for the seed documents (house rules, statutes, AGM minutes, budget, insurance, concierge
--     contract), two new general documents, and translations (house rules in Spanish and German, statutes and
--     insurance summary in English).
--   * Extra building information: shut-off points for the office, fees for owners, bulky rubbish, the community room.
--   * More local places: the beach, a coastal route, a taxi rank, and two places suggested by residents.
-- Safe to run twice.
do $$
declare
  oc constant uuid := '0cea0a00-0000-4000-8000-000000000001';
  admin_id uuid;
  yr int := extract(year from current_date)::int;
  budget_lines_text text;
  budget_total text;
  contract record;
  contract_text text;
  doc uuid;
begin
  select id into admin_id from auth.users where email = 'admin@oceanagardens.test';

  -- -------------------------------------------------------------------------
  -- Document text (the seed rows only carry a first line)
  -- -------------------------------------------------------------------------
  update public.documents set extracted_text = $t$Oceana Gardens – House rules 2026
Approved by the General Meeting of owners. These rules apply to everyone who lives in or visits Oceana Gardens: owners, tenants, guests and holiday visitors.

## Quiet hours
• 23:00 – 08:00 every day.
• 15:00 – 17:00 in July and August (siesta).
• Building and DIY work only Monday to Friday, 09:00 – 14:00 and 17:00 – 20:00. Never on public holidays.

## Balconies and terraces
• No barbecues or open flames.
• Do not hang washing over the railings or on the façade.
• Water your plants so that nothing drips onto the balcony below.
• Awnings must be the community colour (sand, RAL 1015). Ask the office before fitting one.

## Shared areas
• Keep the entrance doors and the garage gate closed behind you.
• Bicycles, prams and mobility scooters go in the storage room of each block, not on the landings.
• No smoking in the lifts, stairs, garage or pool area.

## Pets
• Dogs must be on a lead in all shared areas. They are not allowed in the pool or garden areas.
• Please clean up after your pet straight away.

## Pool
• Open May to October, 10:00 – 20:00. There is no lifeguard.
• Shower before swimming. No glass and no food in the water area.
• Children under 12 must be with an adult.

## Rubbish
• Use the bin area by the main gate and follow the bin days in the app.
• Large items: call the council collection on 010. Never leave them by the bins.

## Holiday lets
• Owners who let their flat must register their guests with the office and give them a copy of these rules.
• Owners are responsible for any damage or noise caused by their guests.

## When rules are broken
The administrator first sends a friendly reminder. Repeated problems go to the committee and, if needed, to the General Meeting under article 7 of the Horizontal Property Law (Ley de Propiedad Horizontal).$t$
  where community_id = oc and title = 'House rules 2026';

  update public.documents set extracted_text = $t$Estatutos de la Comunidad de Propietarios Oceana Gardens
Avenida del Mar 12, 29670 San Pedro de Alcántara (Málaga). Inscritos en el Registro de la Propiedad de Marbella.

## Artículo 1. Objeto
La comunidad está formada por los propietarios de las 36 viviendas, plazas de garaje y trasteros de los bloques A, B y C, y se rige por la Ley 49/1960 de Propiedad Horizontal y por estos estatutos.

## Artículo 2. Elementos comunes
Son elementos comunes, entre otros, los jardines, la piscina, el garaje, los portales, escaleras y ascensores, la sala comunitaria, la cubierta y las fachadas.

## Artículo 3. Cuota de participación
Cada vivienda contribuye a los gastos comunes según su cuota de participación, fijada en la escritura de división horizontal. Las viviendas de la cuarta planta tienen una cuota mayor por su superficie.

## Artículo 4. Órganos de gobierno
• La Junta de Propietarios.
• El Presidente, elegido entre los propietarios por un año.
• El Administrador, que puede ser un profesional externo.
• El Tesorero y los representantes de bloque, cuando la Junta los nombre.

## Artículo 5. Juntas
La Junta ordinaria se celebra una vez al año para aprobar las cuentas y el presupuesto. Las juntas extraordinarias se convocan cuando lo decida el Presidente o lo pidan propietarios que representen al menos el 25 % de las cuotas.

## Artículo 6. Uso de las viviendas
Las viviendas se destinan a uso residencial. El alquiler turístico requiere comunicación previa a la administración y el cumplimiento de las normas de régimen interior.

## Artículo 7. Obras
Ningún propietario puede alterar la fachada, la cubierta ni los elementos estructurales sin autorización de la Junta.$t$
  where community_id = oc and title = 'Community statutes (Estatutos)';

  update public.documents set extracted_text = $t$Minutes of the Annual General Meeting
Held in the community room, Block A, at 18:00. Chair: James Whitfield (President). Secretary: María López (Administrator).

## Attendance
24 owners attended in person and 6 by proxy, together holding 71.4 % of the participation shares. The meeting was quorate at the first call.

## 1. Approval of the accounts
The treasurer presented the accounts for the year. Spending was 2 % under budget, mainly thanks to lower water costs after the irrigation was repaired. The accounts were approved unanimously.

## 2. Budget for the new year
The budget was approved with a 3 % increase, mainly for the concierge contract (yearly price review) and higher insurance. Fees remain quarterly, by participation share.

## 3. Election of officers
• James Whitfield continues as President.
• Peter Johansson was elected Treasurer.
• María López continues as Administrator.

## 4. Pool opening hours
Owners agreed to extend the pool hours to 20:00 from May to October. The no-glass rule will be enforced.

## 5. Any other business
• The administrator will get three quotes for repairing the Block C roof.
• Extra lighting will be installed in the garage.
• The concierge contract will be reviewed before it renews.

The meeting closed at 19:50.$t$
  where community_id = oc and title like 'Minutes – Annual General Meeting%';

  -- The budget text is built from the approved budget for this year, so it always matches the finance pages.
  select string_agg(format('• %s: €%s', ec.name, to_char(bl.amount_cents / 100, 'FM999,999')), E'\n' order by bl.amount_cents desc),
         to_char(sum(bl.amount_cents) / 100, 'FM999,999')
    into budget_lines_text, budget_total
  from public.budgets b
  join public.budget_lines bl on bl.budget_id = b.id
  left join public.expense_categories ec on ec.id = bl.category_id
  where b.community_id = oc and b.year = yr;

  update public.documents set extracted_text = format($t$Oceana Gardens – Budget %s
Approved by the General Meeting. Amounts include VAT.

## Spending by area
%s

## Total
€%s for the year, shared between the 36 flats by participation share and charged every quarter.

## Notes
• The concierge contract is reviewed each year in line with the consumer price index (IPC).
• Repairs and maintenance include a reserve for small works in the gardens and the garage.
• The Block C roof works are paid separately through the levy approved at the extraordinary meeting.$t$,
      yr,
      coalesce(budget_lines_text, '• Concierge, cleaning, gardens, pool, lift, insurance, utilities, repairs and administration.'),
      coalesce(budget_total, '112,600'))
  where community_id = oc and title = 'Budget ' || yr;

  update public.documents set extracted_text = $t$Resumen de la póliza de seguro de la comunidad
Aseguradora: Seguros Mediterráneo. Póliza multirriesgo de comunidades n.º CM-2291-0457. Renovación anual el 1 de enero.

## Qué cubre
• Daños en el edificio: estructura, fachadas, cubierta e instalaciones comunes.
• Daños por agua en elementos comunes y en viviendas cuando el origen está en una tubería comunitaria.
• Rotura de cristales y daños eléctricos en zonas comunes.
• Responsabilidad civil de la comunidad hasta 600.000 €.
• Ascensores, piscina y jardines.

## Qué no cubre
• El contenido de las viviendas (muebles, electrodomésticos, objetos personales).
• Las averías de tuberías privadas dentro de cada vivienda.
Cada propietario debe tener su propio seguro de hogar.

## Franquicia
150 € por siniestro de daños por agua. Sin franquicia en el resto de coberturas.

## Cómo dar un parte
Avise primero a la oficina de la comunidad. Para urgencias fuera de horario, llame al teléfono de siniestros 24 horas de la aseguradora (+34 952 100 006) e indique el número de póliza.$t$
  where community_id = oc and title = 'Insurance policy summary';

  select c.start_date, c.end_date, c.notice_period_days, c.amount_cents, c.vat_rate
    into contract
  from public.contracts c
  join public.suppliers s on s.id = c.supplier_id
  where c.community_id = oc and s.name = 'Conserjería Integral'
  order by c.start_date desc
  limit 1;

  contract_text := format($t$Contrato de servicio de conserjería
Entre la Comunidad de Propietarios Oceana Gardens y Conserjería Integral S.L.

## Servicio
• Conserje en la entrada principal todos los días de 08:00 a 22:00, incluidos festivos.
• Control de accesos, recepción de paquetes y custodia de llaves de cuartos técnicos.
• Primera atención de incidencias (fugas, ascensores, accesos) y aviso a los servicios de mantenimiento.
• Rondas por el garaje y las zonas comunes dos veces al día.

## Duración
Desde el %s hasta el %s, con renovación automática por periodos anuales salvo preaviso de %s días.

## Precio
%s € al mes más IVA (%s %%). El precio se revisa cada año según el IPC.

## Sustituciones
La empresa cubre vacaciones y bajas con personal formado, avisando a la administración con 48 horas de antelación.$t$,
    coalesce(to_char(contract.start_date, 'DD/MM/YYYY'), '01/08/2024'),
    coalesce(to_char(contract.end_date, 'DD/MM/YYYY'), '31/07/2027'),
    coalesce(contract.notice_period_days, 90),
    -- Spanish number format: 2.900,00
    coalesce(replace(to_char(contract.amount_cents / 100, 'FM999,990'), ',', '.') || ',' || lpad((contract.amount_cents % 100)::text, 2, '0'), '2.900,00'),
    coalesce(trim(trailing '.' from trim(trailing '0' from contract.vat_rate::text)), '21'));
  update public.documents set extracted_text = contract_text
  where community_id = oc and title = 'Concierge service contract';

  -- -------------------------------------------------------------------------
  -- Two general documents
  -- -------------------------------------------------------------------------
  if not exists (select 1 from public.documents where community_id = oc and title = 'Welcome guide for new residents') then
    insert into public.documents (community_id, folder, title, description, visibility, original_language, extracted_text, uploaded_by, created_at)
    values (oc, 'General', 'Welcome guide for new residents', 'Keys, parking, bins and who to call in your first weeks.', 'all', 'en',
$t$Welcome to Oceana Gardens
We hope you feel at home quickly. This guide covers the things new residents ask about most.

## Keys and remotes
• Each flat has keys for the main gate, the block entrance and the storage room.
• Garage remotes can be ordered from the office (€45). Lost remotes are blocked the same day.

## The office and the concierge
• The office is on the ground floor of Block A, open Monday to Friday 09:00 – 14:00.
• The concierge is at the main gate every day 08:00 – 22:00 and accepts parcels for you.

## Bins
General waste goes out every night after 20:00. Recycling has its own days: see Bins & info in the app.

## Post
Letterboxes are in each block's entrance. Ask the office for a name label so the postman can find you.

## Getting help
• Something broken: report it in the app, with a photo if you can.
• Water leak or someone stuck in the lift: call the concierge straight away.
• Emergencies: 112.$t$,
      admin_id, now() - interval '45 days');
  end if;

  if not exists (select 1 from public.documents where community_id = oc and title = 'Fire safety and evacuation plan') then
    insert into public.documents (community_id, folder, title, description, visibility, original_language, extracted_text, uploaded_by, created_at)
    values (oc, 'General', 'Fire safety and evacuation plan', 'Escape routes, meeting point and fire equipment in each block.', 'all', 'en',
$t$Fire safety and evacuation plan
Reviewed with the fire safety engineer this year. Please read it once and keep it handy.

## If you discover a fire
• Leave the flat and close the door behind you.
• Call 112 and tell the concierge.
• Use the stairs, never the lift.

## Meeting point
The lawn by the main gate, away from the buildings. Tell the concierge if someone may still be inside.

## Fire equipment
• Extinguishers on every landing, next to the lift.
• Fire hoses in the garage, by each stair door.
• Smoke detectors in the garage and storage rooms, checked every year.

## If you need help to leave
Residents who cannot use the stairs on their own can tell the office in confidence. The concierge keeps a list so firefighters know which flats to check first.$t$,
      admin_id, now() - interval '20 days');
  end if;

  -- -------------------------------------------------------------------------
  -- Translations
  -- -------------------------------------------------------------------------
  select id into doc from public.documents where community_id = oc and title = 'House rules 2026';
  if doc is not null then
    insert into public.document_translations (community_id, document_id, language, translated_text, status) values
    (oc, doc, 'es', $t$Oceana Gardens – Normas de convivencia 2026
Aprobadas por la Junta de Propietarios. Estas normas se aplican a todas las personas que viven en Oceana Gardens o lo visitan: propietarios, inquilinos, invitados y turistas.

## Horario de descanso
• De 23:00 a 08:00 todos los días.
• De 15:00 a 17:00 en julio y agosto (siesta).
• Obras y bricolaje solo de lunes a viernes, de 09:00 a 14:00 y de 17:00 a 20:00. Nunca en días festivos.

## Balcones y terrazas
• No se permiten barbacoas ni fuego.
• No tienda la ropa por fuera de la barandilla ni en la fachada.
• Riegue las plantas sin que caiga agua al balcón de abajo.
• Los toldos deben ser del color de la comunidad (arena, RAL 1015). Consulte a la oficina antes de instalar uno.

## Zonas comunes
• Cierre siempre las puertas de entrada y la puerta del garaje.
• Bicicletas, carritos y scooters de movilidad se guardan en el trastero de cada bloque, no en los rellanos.
• No se puede fumar en ascensores, escaleras, garaje ni en la zona de la piscina.

## Mascotas
• Los perros deben ir con correa en todas las zonas comunes. No pueden entrar en la piscina ni en los jardines.
• Recoja los excrementos de su mascota inmediatamente.

## Piscina
• Abierta de mayo a octubre, de 10:00 a 20:00. No hay socorrista.
• Dúchese antes de bañarse. No se permite vidrio ni comida en la zona de baño.
• Los menores de 12 años deben ir acompañados de un adulto.

## Basura
• Utilice la zona de contenedores junto a la entrada principal y siga los días de recogida de la aplicación.
• Muebles y enseres: llame a la recogida municipal al 010. Nunca los deje junto a los contenedores.

## Alquiler vacacional
• Los propietarios que alquilen su vivienda deben registrar a sus huéspedes en la oficina y entregarles una copia de estas normas.
• Los propietarios responden de los daños o molestias que causen sus huéspedes.

## Incumplimiento de las normas
El administrador enviará primero un recordatorio amable. Los problemas repetidos se trasladan a la junta directiva y, si es necesario, a la Junta de Propietarios, según el artículo 7 de la Ley de Propiedad Horizontal.$t$, 'done'),
    (oc, doc, 'de', $t$Oceana Gardens – Hausordnung 2026
Von der Eigentümerversammlung beschlossen. Diese Regeln gelten für alle, die in Oceana Gardens wohnen oder zu Besuch sind: Eigentümer, Mieter, Gäste und Feriengäste.

## Ruhezeiten
• Täglich von 23:00 bis 08:00 Uhr.
• Im Juli und August zusätzlich von 15:00 bis 17:00 Uhr (Siesta).
• Bau- und Heimwerkerarbeiten nur montags bis freitags von 09:00 bis 14:00 und von 17:00 bis 20:00 Uhr. Nie an Feiertagen.

## Balkone und Terrassen
• Keine Grills und kein offenes Feuer.
• Keine Wäsche über das Geländer oder an die Fassade hängen.
• Pflanzen so gießen, dass kein Wasser auf den Balkon darunter tropft.
• Markisen müssen die Farbe der Gemeinschaft haben (Sand, RAL 1015). Bitte vor dem Anbringen im Büro fragen.

## Gemeinschaftsbereiche
• Eingangstüren und Garagentor immer hinter sich schließen.
• Fahrräder, Kinderwagen und Elektromobile gehören in den Abstellraum des jeweiligen Blocks, nicht in das Treppenhaus.
• Rauchen ist in Aufzügen, Treppenhäusern, in der Garage und am Pool nicht erlaubt.

## Haustiere
• Hunde sind in allen Gemeinschaftsbereichen an der Leine zu führen. Pool und Gärten sind für Hunde nicht erlaubt.
• Bitte entfernen Sie den Kot Ihres Tieres sofort.

## Pool
• Geöffnet von Mai bis Oktober, 10:00 bis 20:00 Uhr. Es gibt keinen Bademeister.
• Vor dem Schwimmen duschen. Kein Glas und keine Speisen im Badebereich.
• Kinder unter 12 Jahren nur in Begleitung eines Erwachsenen.

## Müll
• Bitte den Müllplatz am Haupttor benutzen und die Abholtage in der App beachten.
• Sperrmüll: die städtische Abholung unter 010 anrufen. Nie neben die Container stellen.

## Ferienvermietung
• Eigentümer, die ihre Wohnung vermieten, melden ihre Gäste im Büro an und geben ihnen eine Kopie dieser Hausordnung.
• Eigentümer haften für Schäden oder Lärm ihrer Gäste.

## Bei Verstößen
Der Verwalter schickt zunächst eine freundliche Erinnerung. Wiederholte Probleme gehen an den Vorstand und, wenn nötig, an die Eigentümerversammlung nach Artikel 7 des spanischen Wohnungseigentumsgesetzes (Ley de Propiedad Horizontal).$t$, 'done')
    on conflict (document_id, language) do nothing;
  end if;

  select id into doc from public.documents where community_id = oc and title = 'Community statutes (Estatutos)';
  if doc is not null then
    insert into public.document_translations (community_id, document_id, language, translated_text, status) values
    (oc, doc, 'en', $t$Statutes of the Oceana Gardens Community of Owners
Avenida del Mar 12, 29670 San Pedro de Alcántara (Málaga). Registered at the Marbella Land Registry.

## Article 1. Purpose
The community is made up of the owners of the 36 flats, garage spaces and storage rooms in Blocks A, B and C. It is governed by Law 49/1960 on Horizontal Property and by these statutes.

## Article 2. Common elements
Common elements include the gardens, the pool, the garage, the entrance halls, stairs and lifts, the community room, the roof and the façades.

## Article 3. Participation share
Each flat contributes to the common costs according to its participation share, set in the deed of horizontal division. Fourth-floor flats have a larger share because of their size.

## Article 4. Governing bodies
• The General Meeting of owners.
• The President, elected from among the owners for one year.
• The Administrator, who may be an outside professional.
• The Treasurer and the block representatives, when the General Meeting appoints them.

## Article 5. Meetings
The ordinary General Meeting is held once a year to approve the accounts and the budget. Extraordinary meetings are called by the President or at the request of owners holding at least 25 % of the shares.

## Article 6. Use of the flats
The flats are for residential use. Holiday lets must be notified to the administration in advance and follow the house rules.

## Article 7. Building works
No owner may alter the façade, the roof or structural elements without the approval of the General Meeting.$t$, 'done')
    on conflict (document_id, language) do nothing;
  end if;

  select id into doc from public.documents where community_id = oc and title = 'Insurance policy summary';
  if doc is not null then
    insert into public.document_translations (community_id, document_id, language, translated_text, status) values
    (oc, doc, 'en', $t$Summary of the community insurance policy
Insurer: Seguros Mediterráneo. Community multi-risk policy no. CM-2291-0457. Renews every year on 1 January.

## What is covered
• Damage to the building: structure, façades, roof and shared installations.
• Water damage to common areas, and to flats when it comes from a shared pipe.
• Broken glass and electrical damage in common areas.
• The community's public liability up to €600,000.
• Lifts, pool and gardens.

## What is not covered
• The contents of the flats (furniture, appliances, personal belongings).
• Faults in private pipes inside each flat.
Every owner needs their own home insurance.

## Excess
€150 per water damage claim. No excess for the other covers.

## How to make a claim
Tell the community office first. For emergencies outside office hours, call the insurer's 24-hour claims line (+34 952 100 006) and give the policy number.$t$, 'done')
    on conflict (document_id, language) do nothing;
  end if;

  -- A translation that is still being prepared is not shown to residents.
  select id into doc from public.documents where community_id = oc and title like 'Minutes – Annual General Meeting%' limit 1;
  if doc is not null then
    insert into public.document_translations (community_id, document_id, language, translated_text, status)
    values (oc, doc, 'es', null, 'pending')
    on conflict (document_id, language) do nothing;
  end if;

  -- -------------------------------------------------------------------------
  -- More building information
  -- -------------------------------------------------------------------------
  insert into public.info_pages (community_id, title, body, category, icon, sort, visibility)
  select oc, v.title, v.body, v.category, v.icon, v.sort, v.visibility::public.visibility
  from (values
    ('Water and power shut-offs', $t$For the office and the concierge, to act fast on a leak or a power cut.

Main water stopcocks:
• Block A: basement plant room (door A-0), blue valve on the left.
• Block B: under the ground-floor stairs, behind the grey panel (key 14).
• Block C: basement plant room (door C-0).
• Every flat also has its own stopcock under the kitchen sink.

Electricity:
• Meter rooms are on the ground floor of each block. The main switch for the common areas is in Block A.
• There is no mains gas. Some flats use butane bottles: ask the resident to close the bottle valve.

Keys:
The concierge holds a labelled set of keys for every plant room and meter room. A spare set is in the office safe.

Entering a flat:
Call the owner first (their number is in Members). If no one answers and water is coming through a ceiling, call the local police on 092 before entering with the concierge.$t$, 'emergency', 'siren', 1, 'admins'),
    ('Community fees', $t$Fees are charged every quarter (January, April, July and October), according to each flat's participation share.
• Pay by direct debit (recommended) or bank transfer. The bank details are on your fee statement in My flat.
• Put your flat number, for example A-2B, in the transfer reference.
• Unpaid fees are reminded by email after 30 days. After three months the community may claim them through the courts, as the Horizontal Property Law allows.
Questions about your account: the treasurer or the office.$t$, 'general', 'info', 6, 'owners'),
    ('Bulky rubbish and garden waste', $t$Furniture, mattresses and appliances must never be left in the bin area.
• Book the free council collection on 010. They collect from the main gate on the night you agree.
• Small electrical items, batteries, paint and cooking oil go to the council recycling point (Punto Limpio), open Monday to Saturday.
• Garden cuttings from terraces: tie them in bundles and leave them next to the brown bins on a collection evening.$t$, 'general', 'truck', 7, 'all'),
    ('Community room', $t$The community room is on the ground floor of Block A, next to the office.
• Residents can book it free of charge through the office, for up to 20 people.
• Bookings between 10:00 and 22:00.
• Please leave it clean and tidy and give the key back to the concierge.
• Wi-Fi: network “Oceana-Room”. The concierge has the password.$t$, 'facilities', 'building', 8, 'all')
  ) as v(title, body, category, icon, sort, visibility)
  where not exists (select 1 from public.info_pages i where i.community_id = oc and i.title = v.title);

  -- -------------------------------------------------------------------------
  -- More local places (two suggested by residents)
  -- -------------------------------------------------------------------------
  insert into public.local_places (community_id, name, place_type, description, address, lat, lng, phone, website,
    distance_km, price_level, step_free, accessibility_notes, route_url, recommended_by, created_at)
  select oc, v.name, v.place_type, v.description, v.address, v.lat, v.lng, v.phone, null,
    v.distance_km, v.price_level, v.step_free, v.notes, v.route_url,
    (select id from auth.users where email = v.suggested_by), now() - (v.age_days || ' days')::interval
  from (values
    ('San Pedro beach', 'beach', 'Wide sandy beach with sun loungers, showers and a lifeguard from June to September.',
      'Paseo Marítimo, at the end of Avenida del Mar', 36.4797, -4.9919, null::text, 0.5, null::int, true,
      'Wooden walkway down to the water, and an amphibious beach chair at the lifeguard post in summer.', null::text, null::text, 30),
    ('Coastal path to Guadalmina', 'route', 'Seaside path west towards Guadalmina, past the Roman baths. About an hour each way.',
      'Starts at the beach end of Avenida del Mar', 36.4797, -4.9919, null, 0.5, null, false,
      'Boardwalk most of the way, with a sandy stretch and a few steps at the river mouth.',
      'https://www.google.com/maps/dir/?api=1&origin=36.4797,-4.9919&destination=36.4741,-5.0136&travelmode=walking', null, 28),
    ('Taxi rank', 'transport', 'Taxis wait here most of the day. The radio taxi can also collect you at the main gate.',
      'Plaza de la Iglesia', 36.4878, -4.9893, '+34 952 774 488', 1.2, null, true,
      'Ask for an adapted taxi when you call.', null, null, 26),
    ('Heladería Los Arcos', 'cafe', 'Homemade ice cream and horchata on the promenade. Open until midnight in summer.',
      'Paseo Marítimo', 36.4801, -4.9897, null, 0.6, 1, true,
      'Level terrace on the promenade.', null, 'owner4@oceanagardens.test', 12),
    ('Panadería La Espiga', 'shop', 'Small bakery with fresh bread from 07:30, good empanadas and almond cakes.',
      'Calle Palmeras 8', 36.4851, -4.9921, '+34 952 789 012', 0.3, 1, false,
      'One small step at the door.', null, 'tenant1@oceanagardens.test', 6)
  ) as v(name, place_type, description, address, lat, lng, phone, distance_km, price_level, step_free, notes, route_url, suggested_by, age_days)
  where not exists (select 1 from public.local_places p where p.community_id = oc and p.name = v.name);
end $$;
