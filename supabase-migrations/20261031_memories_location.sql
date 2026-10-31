-- Optional, manually entered place name for each memory. Existing rows remain null.
alter table public.memories
  add column if not exists location text;
