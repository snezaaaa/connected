-- ═════════════════════════════════════════════════════════════
--  ConnectEd · 0001 · Šema
-- ═════════════════════════════════════════════════════════════

create schema if not exists private;
revoke all on schema private from public;

create type public.user_role as enum ('student', 'mentor', 'pedagog');
create type public.tag_kind as enum ('volim', 'znam', 'ucim');
create type public.project_status as enum ('pending', 'open', 'done', 'rejected');
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'expired');

create table public.classes (
  id     text primary key,          -- "3-2"
  razred int  not null check (razred between 1 and 4),
  smjer  text not null,
  label  text not null              -- "III-2"
);

create table public.tags (
  slug  text primary key,
  label text not null,
  icon  text not null,
  sort  int  not null
);

-- Pristupni kodovi. Iskorišćen kod se NE povezuje sa nalogom.
create table public.access_codes (
  code     text primary key,
  role     public.user_role not null,
  class_id text references public.classes (id),
  used_at  timestamptz
);

-- Profil: samo nik, uloga i odjeljenje. Bez imena i emaila.
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users (id) on delete cascade, -- null za izmišljene učenike iz seeda
  nick         text not null,
  nick_norm    text not null unique,
  role         public.user_role not null default 'student',
  class_id     text references public.classes (id),
  onboarded    boolean not null default false,
  tags_version int not null default 0,
  is_seed      boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.profile_tags (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tag        text not null references public.tags (slug),
  kind       public.tag_kind not null,
  primary key (profile_id, tag)
);

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 3 and 80),
  goal         text not null check (char_length(goal) between 1 and 300),
  deadline     date,
  spots        int  not null default 2 check (spots between 1 and 8),
  icon         text not null default '✨',
  status       public.project_status not null default 'pending',
  leader_id    uuid not null references public.profiles (id) on delete cascade,
  result_text  text check (char_length(result_text) <= 400),
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  completed_at timestamptz
);
create index on public.projects (status);
create index on public.projects (leader_id);

create table public.project_tags (
  project_id uuid not null references public.projects (id) on delete cascade,
  tag        text not null references public.tags (slug),
  primary key (project_id, tag)
);

create table public.group_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (project_id, profile_id)
);
create index on public.group_members (profile_id);

-- Poziv. Skor se NE čuva ovdje (samo razlog: oznaka i vrsta).
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  reason_tag   text not null references public.tags (slug),
  reason_kind  public.tag_kind not null,
  status       public.invite_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (project_id, profile_id)
);
create index on public.invites (profile_id, created_at);

create table public.wall_posts (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  kind       text not null default 'post' check (kind in ('post', 'system')),
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index on public.wall_posts (project_id, created_at);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  project_id uuid references public.projects (id) on delete cascade,
  body       text not null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (profile_id, created_at);

create table public.help_signals (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  note       text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create table public.demo_meta (
  id       int primary key default 1 check (id = 1),
  reset_at timestamptz not null default now()
);
insert into public.demo_meta (id) values (1);

-- Privatno: nije izloženo API-ju.
create table private.first_group_events (
  profile_id uuid not null,
  at         timestamptz not null default now()
);

-- ─── Nik ────────────────────────────────────────────────────
-- Ista pravila kao src/lib/nick.ts
create or replace function private.normalize_nick(n text)
returns text language sql immutable set search_path = '' as $$
  select replace(translate(lower(btrim(n)), 'ČĆŠŽĐčćšž', 'ccszđccsz'), 'đ', 'dj')
$$;

create or replace function private.nick_problem(n text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  flat text;
  w text;
  blocked text[] := array[
    'kurac', 'kurc', 'picka', 'pizda', 'jeb', 'govno', 'sranje', 'kurva', 'peder',
    'drolj', 'smrad', 'debil', 'kreten', 'retard', 'idiot', 'mrtav', 'ubij', 'nazi', 'hitler',
    'fuck', 'shit', 'bitch', 'dick', 'cock', 'pussy', 'porn', 'sex', 'seks', 'nigg',
    'admin', 'moderator', 'mentor', 'pedagog', 'connected', 'skola'
  ];
begin
  if n is null or char_length(btrim(n)) < 3 then return 'Nik treba da ima bar 3 znaka.'; end if;
  if char_length(btrim(n)) > 20 then return 'Nik može imati najviše 20 znakova.'; end if;
  if btrim(n) !~ '^[A-Za-z0-9čćšžđČĆŠŽĐ._-]+$' then
    return 'Koristi slova, brojeve, tačku, crticu ili donju crtu.';
  end if;
  flat := regexp_replace(translate(private.normalize_nick(n), '013457@', 'oieasta'), '[._-]', '', 'g');
  foreach w in array blocked loop
    if position(w in flat) > 0 then return 'Taj nik nije dozvoljen. Probaj drugi.'; end if;
  end loop;
  return null;
end $$;
