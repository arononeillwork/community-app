-- Members share contact details with their block at most. The office and the key contacts page cover
-- the rest of the community, so the older "everyone in the community" setting becomes "my block".
update public.contact_preferences set visibility = 'block' where visibility = 'all';
