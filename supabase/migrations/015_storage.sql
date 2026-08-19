-- ==========================================================
-- STORAGE BUCKETS
-- ==========================================================

insert into storage.buckets (id, name, public)
values
    ('avatares', 'avatares', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values
    ('fotos-barco', 'fotos-barco', true)
on conflict (id) do nothing;