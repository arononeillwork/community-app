-- New contact visibility level: "people in my block".
-- Kept in its own migration because a new enum value cannot be used in the transaction that adds it.
alter type public.contact_visibility add value if not exists 'block' after 'unit';
