-- =========================================================
-- Migration 004: Avatars Storage Bucket
-- Run in Supabase SQL Editor > New Query
-- =========================================================

-- 1. Create the avatars storage bucket (public so avatar URLs work without tokens)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 2. RLS: allow authenticated users to upload their own avatars
--    Files must be stored under a path that starts with their user ID.
create policy "Users can upload own avatar" on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own avatar" on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own avatar" on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. Public read access so avatar_url can be fetched by anyone
create policy "Public read access for avatars" on storage.objects
  for select
  using (bucket_id = 'avatars');
