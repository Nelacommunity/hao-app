-- Hotels get their own category, so stays show up under Hotels in My Places.
alter table public.places drop constraint places_category_check;
alter table public.places add constraint places_category_check check (category in ('food', 'attraction', 'shop', 'service', 'hotel'));
