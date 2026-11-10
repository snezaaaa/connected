-- ConnectEd: sve migracije + seed u jednom fajlu (GENERISANO: npm run gen:setup).
-- Zalijepite cijeli sadržaj u Supabase → SQL Editor → Run. Pokreće se JEDNOM na praznom projektu.

-- >>> migrations/0001_schema.sql
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


-- >>> migrations/0002_rls.sql
-- ═════════════════════════════════════════════════════════════
--  ConnectEd · 0002 · Row Level Security
--
--  Načela:
--   • RLS je uključen na SVIM tabelama (i u šemi private).
--   • Klijent ne piše direktno ni u jednu tabelu; sve izmjene idu
--     kroz RPC funkcije (0004_rpc.sql) koje same provjeravaju prava.
--   • Niko (ni mentor) ne može dobiti spisak svih učenika, pa ni
--     izvesti listu učenika bez grupe.
-- ═════════════════════════════════════════════════════════════

-- ─── Pomoćne funkcije (security definer, samo čitaju) ────────
create or replace function private.my_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.profiles where user_id = auth.uid()
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('mentor', 'pedagog') from public.profiles where user_id = auth.uid()), false)
$$;

create or replace function private.is_member(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.project_id = p_project and m.left_at is null
      and m.profile_id = (select id from public.profiles where user_id = auth.uid())
  )
$$;

create or replace function private.shares_group(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on b.project_id = a.project_id
    where a.profile_id = (select id from public.profiles where user_id = auth.uid())
      and b.profile_id = p_other and a.left_at is null and b.left_at is null
  )
$$;

create or replace function private.has_group(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.profile_id = p_other and m.left_at is null)
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function
  private.my_profile_id(), private.is_staff(), private.is_member(uuid),
  private.shares_group(uuid), private.has_group(uuid)
to authenticated;

-- ─── Uključi RLS svuda ───────────────────────────────────────
alter table public.classes            enable row level security;
alter table public.tags               enable row level security;
alter table public.access_codes       enable row level security;
alter table public.profiles           enable row level security;
alter table public.profile_tags       enable row level security;
alter table public.projects           enable row level security;
alter table public.project_tags       enable row level security;
alter table public.group_members      enable row level security;
alter table public.invites            enable row level security;
alter table public.wall_posts         enable row level security;
alter table public.notifications      enable row level security;
alter table public.help_signals       enable row level security;
alter table public.demo_meta          enable row level security;
alter table private.first_group_events enable row level security;

-- Klijent nikad ne piše direktno.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke select on public.access_codes, public.profiles, public.profile_tags, public.projects,
  public.project_tags, public.group_members, public.invites, public.wall_posts,
  public.notifications, public.help_signals from anon;

-- ─── Politike čitanja ────────────────────────────────────────
create policy classes_read on public.classes for select to anon, authenticated using (true);
create policy tags_read    on public.tags    for select to anon, authenticated using (true);
create policy demo_read    on public.demo_meta for select to anon, authenticated using (true);

-- Mentor/pedagog vidi SAMO neiskorišćene kodove.
create policy codes_staff on public.access_codes for select to authenticated
  using (private.is_staff() and used_at is null);

-- Profil: svoj; članovi mojih grupa; mentor vidi samo one koji JESU u grupi.
-- Spisak svih učenika nije dostupan nikome.
create policy profiles_read on public.profiles for select to authenticated
  using (
    user_id = auth.uid()
    or private.shares_group(id)
    or (private.is_staff() and private.has_group(id))
  );

create policy profile_tags_own on public.profile_tags for select to authenticated
  using (profile_id = private.my_profile_id());

create policy projects_read on public.projects for select to authenticated
  using (status in ('open', 'done') or leader_id = private.my_profile_id() or private.is_staff());

create policy project_tags_read on public.project_tags for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));

create policy members_read on public.group_members for select to authenticated
  using (private.is_member(project_id) or private.is_staff());

-- Poziv vidi samo onaj ko je pozvan. Vođa ne vidi ko je rekao „Ne sada“.
create policy invites_own on public.invites for select to authenticated
  using (profile_id = private.my_profile_id());

create policy wall_read on public.wall_posts for select to authenticated
  using (private.is_member(project_id) or private.is_staff());

create policy notifications_own on public.notifications for select to authenticated
  using (profile_id = private.my_profile_id());

-- „Treba mi pomoć“: čita samo mentor/pedagog.
create policy help_staff on public.help_signals for select to authenticated
  using (private.is_staff());

-- private.first_group_events: bez politika → nedostupno.


-- >>> migrations/0003_matching.sql
-- ═════════════════════════════════════════════════════════════
--  ConnectEd · 0003 · Spajanje
--
--  Ista logika kao src/lib/matching.ts (provjerava test pariteta).
--  Sve funkcije su u šemi private: nisu dostupne preko API-ja,
--  a skor se nigdje ne upisuje u javne tabele.
--
--  Skor = Σ težina poklopljenih oznaka (znam 30, volim 20, učim 10)
--       + 8 ako učenik grupi donosi novo odjeljenje/razred
--       + 6 ako učenik trenutno nije ni u jednoj aktivnoj grupi
--  Bez poklopljene oznake nema poziva. Najviše 2 poziva u 7 dana.
-- ═════════════════════════════════════════════════════════════

create or replace function private.kind_weight(k public.tag_kind)
returns int language sql immutable set search_path = '' as $$
  select case k when 'znam' then 30 when 'volim' then 20 else 10 end
$$;

create or replace function private.free_spots(p_project uuid)
returns int language sql stable set search_path = '' as $$
  select p.spots - (
    select count(*)::int from public.group_members m
    where m.project_id = p.id and m.left_at is null and m.profile_id <> p.leader_id
  )
  from public.projects p where p.id = p_project
$$;

create or replace function private.in_active_group(p_profile uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    join public.projects p on p.id = m.project_id
    where m.profile_id = p_profile and m.left_at is null and p.status = 'open'
  )
$$;

create or replace function private.recent_invites(p_profile uuid, p_now timestamptz)
returns int language sql stable set search_path = '' as $$
  select count(*)::int from public.invites i
  where i.profile_id = p_profile and i.created_at > p_now - interval '7 days'
$$;

create or replace function private.score_candidate(p_project uuid, p_profile uuid)
returns table (s_score int, s_tag text, s_kind public.tag_kind)
language plpgsql stable set search_path = '' as $$
declare
  v_class text;
  v_tag_score int;
  v_tag text;
  v_kind public.tag_kind;
  v_score int;
begin
  select u.class_id into v_class from public.profiles u
  where u.id = p_profile and u.role = 'student' and u.onboarded;
  if not found then return; end if;
  if not exists (select 1 from public.projects p where p.id = p_project and p.leader_id <> p_profile) then return; end if;
  if exists (select 1 from public.group_members m where m.project_id = p_project and m.profile_id = p_profile) then return; end if;
  if exists (select 1 from public.invites i where i.project_id = p_project and i.profile_id = p_profile) then return; end if;

  select coalesce(sum(private.kind_weight(pt.kind)), 0)::int into v_tag_score
  from public.project_tags x
  join public.profile_tags pt on pt.tag = x.tag and pt.profile_id = p_profile
  where x.project_id = p_project;
  if v_tag_score <= 0 then return; end if;

  select pt.tag, pt.kind into v_tag, v_kind
  from public.project_tags x
  join public.profile_tags pt on pt.tag = x.tag and pt.profile_id = p_profile
  join public.tags t on t.slug = x.tag
  where x.project_id = p_project
  order by private.kind_weight(pt.kind) desc, t.sort asc
  limit 1;

  v_score := v_tag_score;
  if v_class is not null and not exists (
    select 1 from public.group_members m
    join public.profiles q on q.id = m.profile_id
    where m.project_id = p_project and m.left_at is null and q.class_id = v_class
  ) then
    v_score := v_score + 8;
  end if;
  if not private.in_active_group(p_profile) then
    v_score := v_score + 6;
  end if;

  return query select v_score, v_tag, v_kind;
end $$;

-- Koga pozvati na projekat (odobren projekat / neko napustio grupu).
create or replace function private.compute_project_matches(p_project uuid, p_now timestamptz)
returns table (m_project uuid, m_profile uuid, m_tag text, m_kind public.tag_kind)
language plpgsql stable set search_path = '' as $$
declare
  v_free int;
  v_pending int;
  v_k int;
begin
  if not exists (select 1 from public.projects p where p.id = p_project and p.status = 'open') then return; end if;
  v_free := private.free_spots(p_project);
  if v_free <= 0 then return; end if;
  select count(*)::int into v_pending from public.invites i
  where i.project_id = p_project and i.status = 'pending';
  v_k := v_free * 2 - v_pending;
  if v_k <= 0 then return; end if;

  return query
    select p_project, u.id, s.s_tag, s.s_kind
    from public.profiles u
    cross join lateral private.score_candidate(p_project, u.id) s
    where private.recent_invites(u.id, p_now) < 2
    order by s.s_score desc, u.id asc
    limit v_k;
end $$;

-- Na koje projekte pozvati učenika (sačuvao oznake / napustio grupu).
create or replace function private.compute_profile_matches(p_profile uuid, p_now timestamptz)
returns table (m_project uuid, m_profile uuid, m_tag text, m_kind public.tag_kind)
language plpgsql stable set search_path = '' as $$
declare
  v_rem int := 2 - private.recent_invites(p_profile, p_now);
begin
  if v_rem <= 0 then return; end if;
  return query
    select p.id, p_profile, s.s_tag, s.s_kind
    from public.projects p
    cross join lateral private.score_candidate(p.id, p_profile) s
    where p.status = 'open' and private.free_spots(p.id) > 0
    order by s.s_score desc, p.id asc
    limit v_rem;
end $$;

create or replace function private.run_project_matching(p_project uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.invites (project_id, profile_id, reason_tag, reason_kind)
  select m_project, m_profile, m_tag, m_kind from private.compute_project_matches(p_project, now())
  on conflict do nothing;
end $$;

create or replace function private.run_profile_matching(p_profile uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.invites (project_id, profile_id, reason_tag, reason_kind)
  select m_project, m_profile, m_tag, m_kind from private.compute_profile_matches(p_profile, now())
  on conflict do nothing;
end $$;

-- ─── Triggeri ────────────────────────────────────────────────
-- 1) Novi nalog: učenik je sačuvao oznake (tags_version se povećao).
create or replace function private.trg_profile_tags_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.onboarded and new.role = 'student' then
    perform private.run_profile_matching(new.id);
  end if;
  return null;
end $$;
create trigger profile_tags_changed
  after update of tags_version on public.profiles
  for each row when (new.tags_version is distinct from old.tags_version)
  execute function private.trg_profile_tags_changed();

-- 2) Projekat odobren.
create or replace function private.trg_project_opened()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.run_project_matching(new.id);
  return null;
end $$;
create trigger project_opened
  after update of status on public.projects
  for each row when (new.status = 'open' and old.status is distinct from 'open')
  execute function private.trg_project_opened();

-- 3) Neko napustio grupu.
create or replace function private.trg_member_left()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.run_project_matching(new.project_id);
  perform private.run_profile_matching(new.profile_id);
  return null;
end $$;
create trigger member_left
  after update of left_at on public.group_members
  for each row when (new.left_at is not null and old.left_at is null)
  execute function private.trg_member_left();

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.my_profile_id(), private.is_staff(), private.is_member(uuid),
  private.shares_group(uuid), private.has_group(uuid)
to authenticated;


-- >>> migrations/0004_rpc.sql
-- ═════════════════════════════════════════════════════════════
--  ConnectEd · 0004 · RPC funkcije (jedini način pisanja)
--  Sve su security definer i same provjeravaju ko poziva.
--  Oblik JSON odgovora prati src/data/types.ts.
-- ═════════════════════════════════════════════════════════════

-- ─── Interne pomoćne ─────────────────────────────────────────
create or replace function private.me()
returns public.profiles language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles;
begin
  select * into v from public.profiles where user_id = auth.uid();
  if not found then raise exception 'Nalog nije pronađen. Prijavi se ponovo.'; end if;
  return v;
end $$;

create or replace function private.require_staff()
returns public.profiles language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles := private.me();
begin
  if v.role not in ('mentor', 'pedagog') then raise exception 'Samo za mentore.'; end if;
  return v;
end $$;

create or replace function private.me_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', u.id, 'nick', u.nick, 'role', u.role, 'class_id', u.class_id,
    'class_label', c.label, 'onboarded', u.onboarded)
  from public.profiles u left join public.classes c on c.id = u.class_id
  where u.id = p_id
$$;

-- Projekat kao JSON (bez ikakvog skora).
create or replace function private.project_json(p_id uuid, p_me uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'goal', p.goal, 'deadline', p.deadline,
    'spots', p.spots, 'free', private.free_spots(p.id), 'icon', p.icon, 'status', p.status,
    'created_at', p.created_at, 'approved_at', p.approved_at, 'completed_at', p.completed_at,
    'result_text', p.result_text,
    'tags', coalesce((select jsonb_agg(x.tag order by t.sort) from public.project_tags x
                      join public.tags t on t.slug = x.tag where x.project_id = p.id), '[]'::jsonb),
    'leader_nick', (select nick from public.profiles where id = p.leader_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('nick', u.nick, 'class_label', c.label,
                                          'is_leader', u.id = p.leader_id) order by m.joined_at)
      from public.group_members m
      join public.profiles u on u.id = m.profile_id
      left join public.classes c on c.id = u.class_id
      where m.project_id = p.id and m.left_at is null), '[]'::jsonb),
    'class_count', (select count(distinct u.class_id) from public.group_members m
                    join public.profiles u on u.id = m.profile_id
                    where m.project_id = p.id and m.left_at is null),
    'is_member', exists (select 1 from public.group_members m
                         where m.project_id = p.id and m.profile_id = p_me and m.left_at is null),
    'is_leader', p.leader_id = p_me,
    'invite', (select jsonb_build_object('id', i.id, 'reason_tag', i.reason_tag, 'reason_kind', i.reason_kind)
               from public.invites i
               where i.project_id = p.id and i.profile_id = p_me and i.status = 'pending')
  )
  from public.projects p where p.id = p_id
$$;

create or replace function private.notify(p_profile uuid, p_kind text, p_project uuid, p_body text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (profile_id, kind, project_id, body) values (p_profile, p_kind, p_project, p_body)
$$;

-- Ulazak u grupu (poziv ili „Pridruži se“ iz feeda). Atomski.
create or replace function private.join_internal(p_project uuid, p_me public.profiles)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_p public.projects;
  v_was_without boolean;
begin
  select * into v_p from public.projects where id = p_project for update;
  if not found or v_p.status <> 'open' then raise exception 'Ovaj projekat trenutno ne prima nove članove.'; end if;
  if exists (select 1 from public.group_members where project_id = p_project and profile_id = p_me.id and left_at is null) then
    return 'already';
  end if;
  if private.free_spots(p_project) <= 0 then return 'full'; end if;

  v_was_without := not exists (select 1 from public.group_members where profile_id = p_me.id and left_at is null);

  insert into public.group_members (project_id, profile_id) values (p_project, p_me.id)
  on conflict (project_id, profile_id) do update set left_at = null, joined_at = now();

  update public.invites set status = 'accepted', responded_at = now()
  where project_id = p_project and profile_id = p_me.id and status = 'pending';

  insert into public.wall_posts (project_id, author_id, kind, body)
  values (p_project, p_me.id, 'system', p_me.nick || ' se pridružio/la timu 🎉');

  if v_p.leader_id <> p_me.id then
    perform private.notify(v_p.leader_id, 'new_member', p_project,
      p_me.nick || ' se pridružio/la timu „' || v_p.title || '“ 🎉');
  end if;

  if v_was_without then
    insert into private.first_group_events (profile_id) values (p_me.id);
  end if;

  if private.free_spots(p_project) <= 0 then
    update public.invites set status = 'expired' where project_id = p_project and status = 'pending';
  end if;
  return 'ok';
end $$;

-- ─── Registracija ────────────────────────────────────────────
create or replace function public.check_code(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'role', a.role, 'class_label', c.label)
     from public.access_codes a left join public.classes c on c.id = a.class_id
     where a.code = upper(btrim(p_code)) and a.used_at is null),
    jsonb_build_object('ok', false))
$$;

create or replace function public.nick_status(p_nick text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_problem text := private.nick_problem(p_nick);
begin
  if v_problem is null and exists (select 1 from public.profiles where nick_norm = private.normalize_nick(p_nick)) then
    v_problem := 'Taj nik je zauzet. Probaj drugi.';
  end if;
  return jsonb_build_object('ok', v_problem is null, 'problem', v_problem);
end $$;

-- Provjera i trošenje koda u JEDNOJ transakciji (zaključavanje reda).
create or replace function public.redeem_code(p_code text, p_nick text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code public.access_codes;
  v_problem text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Prijavi se ponovo.'; end if;
  if exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'Ovaj nalog već ima profil.';
  end if;
  v_problem := private.nick_problem(p_nick);
  if v_problem is not null then raise exception '%', v_problem; end if;

  select * into v_code from public.access_codes where code = upper(btrim(p_code)) for update;
  if not found or v_code.used_at is not null then
    raise exception 'Kod nije važeći ili je već iskorišćen.';
  end if;

  begin
    insert into public.profiles (user_id, nick, nick_norm, role, class_id, onboarded)
    values (v_uid, btrim(p_nick), private.normalize_nick(p_nick), v_code.role, v_code.class_id,
            v_code.role <> 'student')
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Taj nik je zauzet. Probaj drugi.';
  end;

  update public.access_codes set used_at = now() where code = v_code.code;
  return private.me_json(v_id);
end $$;

create or replace function public.get_me()
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.me_json(id) from public.profiles where user_id = auth.uid()
$$;

create or replace function public.get_my_tags()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'kind', kind)), '[]'::jsonb)
  from public.profile_tags where profile_id = private.my_profile_id()
$$;

-- p_tags: [{"tag":"video","kind":"znam"}, …]. Pokreće spajanje (trigger).
create or replace function public.save_tags(p_tags jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  if jsonb_typeof(p_tags) <> 'array' or jsonb_array_length(p_tags) = 0 then
    raise exception 'Izaberi bar jednu oznaku.';
  end if;
  if jsonb_array_length(p_tags) > 17 then raise exception 'Previše oznaka.'; end if;
  delete from public.profile_tags where profile_id = v_me.id;
  insert into public.profile_tags (profile_id, tag, kind)
  select distinct on (e->>'tag') v_me.id, e->>'tag', (e->>'kind')::public.tag_kind
  from jsonb_array_elements(p_tags) e
  where exists (select 1 from public.tags t where t.slug = e->>'tag');
  update public.profiles set onboarded = true, tags_version = tags_version + 1 where id = v_me.id;
end $$;

-- ─── Feed i projekti ─────────────────────────────────────────
create or replace function public.get_feed()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  return coalesce((
    select jsonb_agg(private.project_json(p.id, v_me.id)
                     order by (p.status = 'done'), coalesce(p.completed_at, p.approved_at, p.created_at) desc)
    from public.projects p
    where p.status in ('open', 'done') or (p.status = 'pending' and p.leader_id = v_me.id)
  ), '[]'::jsonb);
end $$;

create or replace function public.get_my_groups()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  return coalesce((
    select jsonb_agg(private.project_json(p.id, v_me.id)
                     order by (p.status = 'done'), coalesce(p.completed_at, p.approved_at, p.created_at) desc)
    from public.projects p
    where (p.status in ('open', 'done') and exists (
             select 1 from public.group_members m
             where m.project_id = p.id and m.profile_id = v_me.id and m.left_at is null))
       or (p.status in ('pending', 'rejected') and p.leader_id = v_me.id)
  ), '[]'::jsonb);
end $$;

create or replace function public.get_my_invites()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  return coalesce((
    select jsonb_agg(private.project_json(i.project_id, v_me.id) order by i.created_at desc)
    from public.invites i join public.projects p on p.id = i.project_id
    where i.profile_id = v_me.id and i.status = 'pending' and p.status = 'open'
  ), '[]'::jsonb);
end $$;

create or replace function public.get_project(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me public.profiles := private.me();
  v_p public.projects;
  v_wall boolean;
begin
  select * into v_p from public.projects where id = p_id;
  if not found then return null; end if;
  if not (v_p.status in ('open', 'done') or v_p.leader_id = v_me.id or v_me.role in ('mentor', 'pedagog')) then
    return null;
  end if;
  v_wall := v_me.role in ('mentor', 'pedagog') or exists (
    select 1 from public.group_members where project_id = p_id and profile_id = v_me.id and left_at is null);
  return private.project_json(p_id, v_me.id) || jsonb_build_object(
    'can_see_wall', v_wall,
    'can_post', v_wall and v_me.role = 'student' and v_p.status = 'open',
    'wall', case when v_wall then coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'kind', w.kind, 'body', w.body,
                                          'author_nick', u.nick, 'created_at', w.created_at)
                       order by w.created_at)
      from public.wall_posts w left join public.profiles u on u.id = w.author_id
      where w.project_id = p_id), '[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function public.create_project(
  p_title text, p_goal text, p_deadline date, p_spots int, p_tags text[], p_icon text default '✨')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles := private.me();
  v_id uuid;
begin
  if v_me.role <> 'student' then raise exception 'Projekte pokreću učenici.'; end if;
  if (select count(*) from public.projects where leader_id = v_me.id and status = 'pending') >= 3 then
    raise exception 'Već imaš 3 projekta koja čekaju odobrenje.';
  end if;
  if coalesce(array_length(p_tags, 1), 0) = 0 then raise exception 'Izaberi bar jednu oznaku.'; end if;
  insert into public.projects (title, goal, deadline, spots, icon, leader_id)
  values (btrim(p_title), btrim(p_goal), p_deadline, coalesce(p_spots, 2), coalesce(nullif(p_icon, ''), '✨'), v_me.id)
  returning id into v_id;
  insert into public.project_tags (project_id, tag)
  select distinct v_id, t from unnest(p_tags) t where exists (select 1 from public.tags where slug = t);
  return v_id;
end $$;

create or replace function public.respond_invite(p_invite uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles := private.me();
  v_i public.invites;
begin
  select * into v_i from public.invites where id = p_invite and profile_id = v_me.id for update;
  if not found or v_i.status <> 'pending' then return 'gone'; end if;
  if not p_accept then
    -- „Ne sada“: bez posljedica, bez pitanja, niko ne dobija obavještenje.
    update public.invites set status = 'declined', responded_at = now() where id = p_invite;
    return 'ok';
  end if;
  return private.join_internal(v_i.project_id, v_me);
end $$;

create or replace function public.join_project(p_project uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  if v_me.role <> 'student' then raise exception 'Samo učenici ulaze u timove.'; end if;
  return private.join_internal(p_project, v_me);
end $$;

create or replace function public.leave_project(p_project uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  if exists (select 1 from public.projects where id = p_project and leader_id = v_me.id) then
    raise exception 'Vođa projekta ne može napustiti tim.';
  end if;
  update public.group_members set left_at = now()
  where project_id = p_project and profile_id = v_me.id and left_at is null;
  if found then
    insert into public.wall_posts (project_id, author_id, kind, body)
    values (p_project, v_me.id, 'system', v_me.nick || ' više nije u timu. Hvala na pomoći! 💜');
  end if;
end $$;

create or replace function public.post_wall(p_project uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  if not exists (select 1 from public.group_members m join public.projects p on p.id = m.project_id
                 where m.project_id = p_project and m.profile_id = v_me.id and m.left_at is null
                   and p.status = 'open') then
    raise exception 'Na zid pišu članovi tima.';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then return; end if;
  insert into public.wall_posts (project_id, author_id, body) values (p_project, v_me.id, left(btrim(p_body), 500));
end $$;

create or replace function public.complete_project(p_project uuid, p_result text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles := private.me();
  v_p public.projects;
begin
  select * into v_p from public.projects where id = p_project for update;
  if not found or v_p.status <> 'open' then raise exception 'Projekat nije u toku.'; end if;
  if not exists (select 1 from public.group_members where project_id = p_project and profile_id = v_me.id and left_at is null) then
    raise exception 'Projekat završavaju članovi tima.';
  end if;
  if char_length(btrim(coalesce(p_result, ''))) < 3 then raise exception 'Napiši kratko šta ste uradili.'; end if;
  update public.projects set status = 'done', result_text = left(btrim(p_result), 400), completed_at = now()
  where id = p_project;
  update public.invites set status = 'expired' where project_id = p_project and status = 'pending';
  insert into public.wall_posts (project_id, author_id, kind, body)
  values (p_project, v_me.id, 'system', 'Projekat je završen! Rezultat je sada u feedu škole. 🎉');
  insert into public.notifications (profile_id, kind, project_id, body)
  select m.profile_id, 'done', p_project, 'Projekat „' || v_p.title || '“ je završen. Bravo, tim! 🎉'
  from public.group_members m where m.project_id = p_project and m.left_at is null and m.profile_id <> v_me.id;
end $$;

-- ─── Obavještenja i pomoć ────────────────────────────────────
create or replace function public.get_notifications()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'project_id', project_id,
           'body', body, 'read', read_at is not null, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
  from (select * from public.notifications where profile_id = private.my_profile_id()
        order by created_at desc limit 30) n
$$;

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where profile_id = private.my_profile_id() and read_at is null
$$;

create or replace function public.request_help(p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles := private.me();
begin
  insert into public.help_signals (profile_id, note) values (v_me.id, nullif(left(btrim(coalesce(p_note, '')), 300), ''));
end $$;

-- ─── Mentor ──────────────────────────────────────────────────
create or replace function public.approve_project(p_project uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles := private.require_staff();
  v_p public.projects;
begin
  select * into v_p from public.projects where id = p_project for update;
  if not found or v_p.status <> 'pending' then return; end if;
  if p_approve then
    -- Vođa ulazi u grupu prije otvaranja, da spajanje zna odjeljenje tima.
    insert into public.group_members (project_id, profile_id) values (p_project, v_p.leader_id)
    on conflict (project_id, profile_id) do update set left_at = null;
    if not exists (select 1 from public.group_members where profile_id = v_p.leader_id and left_at is null and project_id <> p_project) then
      insert into private.first_group_events (profile_id) values (v_p.leader_id);
    end if;
    insert into public.wall_posts (project_id, kind, body)
    values (p_project, 'system', 'Projekat je odobren. Srećno, tim! 🚀');
    update public.projects set status = 'open', approved_at = now() where id = p_project; -- → trigger spajanja
    perform private.notify(v_p.leader_id, 'approved', p_project,
      'Tvoj projekat „' || v_p.title || '“ je odobren. Pozivi su poslati! 🚀');
  else
    update public.projects set status = 'rejected' where id = p_project;
    perform private.notify(v_p.leader_id, 'rejected', p_project,
      'Projekat „' || v_p.title || '“ ovaj put nije odobren. Mentor će ti se javiti.');
  end if;
end $$;

create or replace function public.resolve_help(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  update public.help_signals set handled_at = now() where id = p_id;
end $$;

-- Samo zbirni brojevi. Bez imena, bez spiskova.
create or replace function public.get_metrics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_total int;
  v_in int;
begin
  perform private.require_staff();
  select count(*) into v_total from public.profiles where role = 'student';
  select count(distinct m.profile_id) into v_in
  from public.group_members m
  join public.profiles u on u.id = m.profile_id and u.role = 'student'
  join public.projects p on p.id = m.project_id and p.status in ('open', 'done')
  where m.left_at is null;
  return jsonb_build_object(
    'students', v_total,
    'in_group_pct', case when v_total = 0 then 0 else round(100.0 * v_in / v_total) end,
    'zero_to_one', (select count(*) from private.first_group_events),
    'done', (select count(*) from public.projects where status = 'done'),
    'mixed_groups', (select count(*) from public.projects p where p.status in ('open', 'done') and (
       select count(distinct u.class_id) from public.group_members m
       join public.profiles u on u.id = m.profile_id
       where m.project_id = p.id and m.left_at is null) >= 2));
end $$;

create or replace function public.get_mentor_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me public.profiles := private.require_staff();
begin
  return jsonb_build_object(
    'pending', coalesce((select jsonb_agg(private.project_json(p.id, v_me.id) order by p.created_at)
                         from public.projects p where p.status = 'pending'), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(private.project_json(p.id, v_me.id) order by p.approved_at desc)
                        from public.projects p where p.status = 'open'), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', a.code, 'role', a.role, 'class_label', c.label)
                                        order by a.role, c.razred, c.label, a.code)
                       from public.access_codes a left join public.classes c on c.id = a.class_id
                       where a.used_at is null), '[]'::jsonb),
    'help', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'nick', u.nick, 'class_label', c.label,
                                                          'note', h.note, 'created_at', h.created_at)
                                       order by h.created_at desc)
                      from public.help_signals h join public.profiles u on u.id = h.profile_id
                      left join public.classes c on c.id = u.class_id
                      where h.handled_at is null), '[]'::jsonb),
    'metrics', public.get_metrics());
end $$;

-- Vraća bazu na seed. Briše naloge učenika napravljene tokom demonstracije;
-- mentorski/pedagoški nalozi ostaju.
create or replace function public.reset_demo()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  delete from auth.users u
  where exists (select 1 from public.profiles p where p.user_id = u.id and p.role = 'student')
     or not exists (select 1 from public.profiles p where p.user_id = u.id);
  delete from public.notifications;
  delete from public.help_signals;
  delete from public.projects;            -- kaskadno: oznake, članovi, pozivi, zid
  delete from public.group_members;
  delete from public.profiles where role = 'student';
  delete from private.first_group_events;
  update public.access_codes set used_at = null where role = 'student';
  perform private.load_seed();
  update public.demo_meta set reset_at = now() where id = 1;
end $$;

-- Privremena prazna verzija; prava se definiše u supabase/seed.sql.
create or replace function private.load_seed()
returns void language plpgsql security definer set search_path = '' as $$ begin end $$;

-- ─── Prava ───────────────────────────────────────────────────
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.my_profile_id(), private.is_staff(), private.is_member(uuid),
  private.shares_group(uuid), private.has_group(uuid)
to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.check_code(text), public.nick_status(text) to anon, authenticated;
grant execute on function
  public.redeem_code(text, text), public.get_me(), public.get_my_tags(), public.save_tags(jsonb),
  public.get_feed(), public.get_my_groups(), public.get_my_invites(), public.get_project(uuid),
  public.create_project(text, text, date, int, text[], text), public.respond_invite(uuid, boolean),
  public.join_project(uuid), public.leave_project(uuid), public.post_wall(uuid, text),
  public.complete_project(uuid, text), public.get_notifications(), public.mark_notifications_read(),
  public.request_help(text), public.approve_project(uuid, boolean), public.resolve_help(uuid),
  public.get_metrics(), public.get_mentor_dashboard(), public.reset_demo()
to authenticated;


-- >>> migrations/0005_realtime.sql
-- ═════════════════════════════════════════════════════════════
--  ConnectEd · 0005 · Realtime
--  Klijent dobija promjene bez pollinga. Realtime poštuje RLS:
--  svako dobija samo redove koje smije da vidi.
-- ═════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table
  public.invites,
  public.notifications,
  public.wall_posts,
  public.projects,
  public.group_members,
  public.help_signals,
  public.demo_meta;


-- >>> seed.sql
-- ═════════════════════════════════════════════════════════════
--  ConnectEd · seed (GENERISANO: npm run gen:seed — ne mijenjati ručno)
--  Svi učenici su izmišljeni. private.load_seed() poziva i reset_demo().
-- ═════════════════════════════════════════════════════════════

create or replace function private.load_seed()
returns void language plpgsql security definer set search_path = '' as $seed$
begin
  insert into public.classes (id, razred, smjer, label) values
    ('1-1', 1, 'Ekonomski tehničar', 'I-1'),
    ('1-2', 1, 'Turistički tehničar', 'I-2'),
    ('1-3', 1, 'Kuvar', 'I-3'),
    ('1-4', 1, 'Konobar', 'I-4'),
    ('2-1', 2, 'Ekonomski tehničar', 'II-1'),
    ('2-2', 2, 'Turistički tehničar', 'II-2'),
    ('2-3', 2, 'Kuvar', 'II-3'),
    ('2-4', 2, 'Konobar', 'II-4'),
    ('3-1', 3, 'Ekonomski tehničar', 'III-1'),
    ('3-2', 3, 'Turistički tehničar', 'III-2'),
    ('3-3', 3, 'Kuvar', 'III-3'),
    ('3-4', 3, 'Konobar', 'III-4'),
    ('4-1', 4, 'Ekonomski tehničar', 'IV-1'),
    ('4-2', 4, 'Turistički tehničar', 'IV-2'),
    ('4-3', 4, 'Kuvar', 'IV-3'),
    ('4-4', 4, 'Konobar', 'IV-4')
  on conflict (id) do update set razred = excluded.razred, smjer = excluded.smjer, label = excluded.label;

  insert into public.tags (slug, label, icon, sort) values
    ('kuvanje', 'Kuvanje', '🍳', 0),
    ('poslasticarstvo', 'Poslastičarstvo', '🧁', 1),
    ('barmen', 'Barmen i posluženje', '🍹', 2),
    ('turizam', 'Turizam i vođenje tura', '🧭', 3),
    ('jezici', 'Strani jezici', '🗣️', 4),
    ('preduzetnistvo', 'Preduzetništvo', '💼', 5),
    ('crtanje', 'Crtanje i dizajn', '🎨', 6),
    ('fotografija', 'Fotografija', '📷', 7),
    ('video', 'Video montaža', '🎬', 8),
    ('muzika', 'Muzika', '🎵', 9),
    ('bubnjevi', 'Bubnjevi', '🥁', 10),
    ('ples', 'Ples', '💃', 11),
    ('sport', 'Sport', '⚽', 12),
    ('pisanje', 'Pisanje', '✍️', 13),
    ('podcast', 'Podcast', '🎙️', 14),
    ('programiranje', 'Programiranje', '💻', 15),
    ('gaming', 'Gaming', '🎮', 16)
  on conflict (slug) do update set label = excluded.label, icon = excluded.icon, sort = excluded.sort;

  insert into public.access_codes (code, role, class_id) values
    ('CE-3B-7K2Q', 'student', '3-2'),
    ('CE-2A-5M8P', 'student', '2-1'),
    ('CE-MT-2026', 'mentor', null),
    ('CE-1A-Y32C', 'student', '1-1'),
    ('CE-1A-45K6', 'student', '1-1'),
    ('CE-1B-RUE5', 'student', '1-2'),
    ('CE-1B-Z5NC', 'student', '1-2'),
    ('CE-1C-A288', 'student', '1-3'),
    ('CE-1C-NMVK', 'student', '1-3'),
    ('CE-1D-CZ54', 'student', '1-4'),
    ('CE-1D-LD8U', 'student', '1-4'),
    ('CE-2A-N9D3', 'student', '2-1'),
    ('CE-2A-5T9J', 'student', '2-1'),
    ('CE-2B-9MR8', 'student', '2-2'),
    ('CE-2B-M3CA', 'student', '2-2'),
    ('CE-2C-NA6Q', 'student', '2-3'),
    ('CE-2C-3BXZ', 'student', '2-3'),
    ('CE-2D-66TD', 'student', '2-4'),
    ('CE-2D-8YRH', 'student', '2-4'),
    ('CE-3A-AFNB', 'student', '3-1'),
    ('CE-3A-TG88', 'student', '3-1'),
    ('CE-3B-LKMU', 'student', '3-2'),
    ('CE-3B-R9BK', 'student', '3-2'),
    ('CE-3C-XRRL', 'student', '3-3'),
    ('CE-3C-U5DV', 'student', '3-3'),
    ('CE-3D-SCPY', 'student', '3-4'),
    ('CE-3D-FSN4', 'student', '3-4'),
    ('CE-4A-3Q4B', 'student', '4-1'),
    ('CE-4A-KB8Y', 'student', '4-1'),
    ('CE-4B-SS6N', 'student', '4-2'),
    ('CE-4B-4TXR', 'student', '4-2'),
    ('CE-4C-HGYQ', 'student', '4-3'),
    ('CE-4C-ZK38', 'student', '4-3'),
    ('CE-4D-LFBJ', 'student', '4-4'),
    ('CE-4D-SW28', 'student', '4-4'),
    ('CE-MT-J448', 'mentor', null),
    ('CE-MT-9CZR', 'mentor', null),
    ('CE-PG-CXSG', 'pedagog', null)
  on conflict (code) do nothing;

  insert into public.profiles (id, nick, nick_norm, role, class_id, onboarded, is_seed, created_at) values
    ('a0000000-0000-4000-8000-000000000001', 'luna.k', private.normalize_nick('luna.k'), 'student', '1-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000002', 'marko_99', private.normalize_nick('marko_99'), 'student', '1-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000003', 'tea.art', private.normalize_nick('tea.art'), 'student', '1-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000004', 'nikola7', private.normalize_nick('nikola7'), 'student', '1-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000005', 'sara.slatko', private.normalize_nick('sara.slatko'), 'student', '1-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000006', 'vuk', private.normalize_nick('vuk'), 'student', '1-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000007', 'mia_mix', private.normalize_nick('mia_mix'), 'student', '1-4', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000008', 'dejo', private.normalize_nick('dejo'), 'student', '1-4', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000009', 'ana.vodi', private.normalize_nick('ana.vodi'), 'student', '2-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000010', 'bojan.b', private.normalize_nick('bojan.b'), 'student', '2-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000011', 'lena', private.normalize_nick('lena'), 'student', '2-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000012', 'stefan.ritam', private.normalize_nick('stefan.ritam'), 'student', '2-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000013', 'jana_torte', private.normalize_nick('jana_torte'), 'student', '2-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000014', 'petar.chef', private.normalize_nick('petar.chef'), 'student', '2-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000015', 'iva.shake', private.normalize_nick('iva.shake'), 'student', '2-4', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000016', 'milos', private.normalize_nick('milos'), 'student', '2-4', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000017', 'kaća', private.normalize_nick('kaća'), 'student', '3-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000018', 'dusan.foto', private.normalize_nick('dusan.foto'), 'student', '3-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000019', 'eli.ples', private.normalize_nick('eli.ples'), 'student', '3-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000020', 'andrej.gg', private.normalize_nick('andrej.gg'), 'student', '3-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000021', 'maja.mural', private.normalize_nick('maja.mural'), 'student', '3-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000022', 'ognjen', private.normalize_nick('ognjen'), 'student', '3-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000023', 'tamara', private.normalize_nick('tamara'), 'student', '3-4', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000024', 'luka.bas', private.normalize_nick('luka.bas'), 'student', '3-4', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000025', 'mina.pise', private.normalize_nick('mina.pise'), 'student', '4-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000026', 'filip.cut', private.normalize_nick('filip.cut'), 'student', '4-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000027', 'nina', private.normalize_nick('nina'), 'student', '4-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000028', 'relja', private.normalize_nick('relja'), 'student', '4-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000029', 'zara', private.normalize_nick('zara'), 'student', '4-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000030', 'bane.drums', private.normalize_nick('bane.drums'), 'student', '4-4', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000031', 'ena.crta', private.normalize_nick('ena.crta'), 'student', '1-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000032', 'igor', private.normalize_nick('igor'), 'student', '1-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000033', 'sofija.en', private.normalize_nick('sofija.en'), 'student', '1-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000034', 'dario', private.normalize_nick('dario'), 'student', '2-4', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000035', 'kiki', private.normalize_nick('kiki'), 'student', '2-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000036', 'lazar.beat', private.normalize_nick('lazar.beat'), 'student', '3-4', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000037', 'hana', private.normalize_nick('hana'), 'student', '3-2', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000038', 'teo', private.normalize_nick('teo'), 'student', '4-3', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000039', 'mila.m', private.normalize_nick('mila.m'), 'student', '4-1', true, true, now() - interval '70 days'),
    ('a0000000-0000-4000-8000-000000000040', 'pavle', private.normalize_nick('pavle'), 'student', '4-4', true, true, now() - interval '70 days')
  on conflict (id) do nothing;

  insert into public.profile_tags (profile_id, tag, kind) values
    ('a0000000-0000-4000-8000-000000000001', 'crtanje', 'znam'),
    ('a0000000-0000-4000-8000-000000000001', 'fotografija', 'volim'),
    ('a0000000-0000-4000-8000-000000000002', 'sport', 'znam'),
    ('a0000000-0000-4000-8000-000000000002', 'gaming', 'volim'),
    ('a0000000-0000-4000-8000-000000000003', 'crtanje', 'znam'),
    ('a0000000-0000-4000-8000-000000000003', 'ples', 'volim'),
    ('a0000000-0000-4000-8000-000000000004', 'turizam', 'volim'),
    ('a0000000-0000-4000-8000-000000000004', 'jezici', 'znam'),
    ('a0000000-0000-4000-8000-000000000005', 'poslasticarstvo', 'znam'),
    ('a0000000-0000-4000-8000-000000000005', 'kuvanje', 'volim'),
    ('a0000000-0000-4000-8000-000000000006', 'kuvanje', 'znam'),
    ('a0000000-0000-4000-8000-000000000006', 'sport', 'volim'),
    ('a0000000-0000-4000-8000-000000000007', 'barmen', 'znam'),
    ('a0000000-0000-4000-8000-000000000007', 'muzika', 'volim'),
    ('a0000000-0000-4000-8000-000000000008', 'barmen', 'volim'),
    ('a0000000-0000-4000-8000-000000000008', 'sport', 'znam'),
    ('a0000000-0000-4000-8000-000000000009', 'turizam', 'znam'),
    ('a0000000-0000-4000-8000-000000000009', 'jezici', 'znam'),
    ('a0000000-0000-4000-8000-000000000009', 'fotografija', 'volim'),
    ('a0000000-0000-4000-8000-000000000010', 'preduzetnistvo', 'znam'),
    ('a0000000-0000-4000-8000-000000000010', 'programiranje', 'volim'),
    ('a0000000-0000-4000-8000-000000000011', 'pisanje', 'znam'),
    ('a0000000-0000-4000-8000-000000000011', 'podcast', 'volim'),
    ('a0000000-0000-4000-8000-000000000012', 'bubnjevi', 'volim'),
    ('a0000000-0000-4000-8000-000000000012', 'muzika', 'znam'),
    ('a0000000-0000-4000-8000-000000000013', 'poslasticarstvo', 'znam'),
    ('a0000000-0000-4000-8000-000000000013', 'crtanje', 'volim'),
    ('a0000000-0000-4000-8000-000000000014', 'kuvanje', 'znam'),
    ('a0000000-0000-4000-8000-000000000014', 'preduzetnistvo', 'ucim'),
    ('a0000000-0000-4000-8000-000000000015', 'barmen', 'znam'),
    ('a0000000-0000-4000-8000-000000000015', 'ples', 'volim'),
    ('a0000000-0000-4000-8000-000000000016', 'sport', 'znam'),
    ('a0000000-0000-4000-8000-000000000016', 'muzika', 'ucim'),
    ('a0000000-0000-4000-8000-000000000017', 'preduzetnistvo', 'znam'),
    ('a0000000-0000-4000-8000-000000000017', 'jezici', 'volim'),
    ('a0000000-0000-4000-8000-000000000018', 'fotografija', 'znam'),
    ('a0000000-0000-4000-8000-000000000018', 'video', 'volim'),
    ('a0000000-0000-4000-8000-000000000019', 'ples', 'znam'),
    ('a0000000-0000-4000-8000-000000000019', 'muzika', 'volim'),
    ('a0000000-0000-4000-8000-000000000020', 'gaming', 'znam'),
    ('a0000000-0000-4000-8000-000000000020', 'programiranje', 'znam'),
    ('a0000000-0000-4000-8000-000000000021', 'crtanje', 'znam'),
    ('a0000000-0000-4000-8000-000000000021', 'poslasticarstvo', 'volim'),
    ('a0000000-0000-4000-8000-000000000022', 'kuvanje', 'volim'),
    ('a0000000-0000-4000-8000-000000000022', 'bubnjevi', 'ucim'),
    ('a0000000-0000-4000-8000-000000000023', 'barmen', 'znam'),
    ('a0000000-0000-4000-8000-000000000023', 'jezici', 'volim'),
    ('a0000000-0000-4000-8000-000000000024', 'muzika', 'znam'),
    ('a0000000-0000-4000-8000-000000000024', 'sport', 'volim'),
    ('a0000000-0000-4000-8000-000000000025', 'pisanje', 'znam'),
    ('a0000000-0000-4000-8000-000000000025', 'podcast', 'znam'),
    ('a0000000-0000-4000-8000-000000000026', 'video', 'znam'),
    ('a0000000-0000-4000-8000-000000000026', 'fotografija', 'volim'),
    ('a0000000-0000-4000-8000-000000000027', 'turizam', 'znam'),
    ('a0000000-0000-4000-8000-000000000027', 'ples', 'volim'),
    ('a0000000-0000-4000-8000-000000000028', 'sport', 'znam'),
    ('a0000000-0000-4000-8000-000000000028', 'turizam', 'ucim'),
    ('a0000000-0000-4000-8000-000000000029', 'poslasticarstvo', 'volim'),
    ('a0000000-0000-4000-8000-000000000029', 'kuvanje', 'znam'),
    ('a0000000-0000-4000-8000-000000000030', 'bubnjevi', 'znam'),
    ('a0000000-0000-4000-8000-000000000030', 'muzika', 'volim'),
    ('a0000000-0000-4000-8000-000000000031', 'crtanje', 'volim'),
    ('a0000000-0000-4000-8000-000000000031', 'pisanje', 'ucim'),
    ('a0000000-0000-4000-8000-000000000032', 'kuvanje', 'volim'),
    ('a0000000-0000-4000-8000-000000000032', 'gaming', 'znam'),
    ('a0000000-0000-4000-8000-000000000033', 'jezici', 'znam'),
    ('a0000000-0000-4000-8000-000000000033', 'turizam', 'ucim'),
    ('a0000000-0000-4000-8000-000000000034', 'barmen', 'volim'),
    ('a0000000-0000-4000-8000-000000000034', 'sport', 'volim'),
    ('a0000000-0000-4000-8000-000000000035', 'poslasticarstvo', 'volim'),
    ('a0000000-0000-4000-8000-000000000035', 'fotografija', 'ucim'),
    ('a0000000-0000-4000-8000-000000000036', 'bubnjevi', 'volim'),
    ('a0000000-0000-4000-8000-000000000036', 'gaming', 'volim'),
    ('a0000000-0000-4000-8000-000000000037', 'ples', 'volim'),
    ('a0000000-0000-4000-8000-000000000037', 'muzika', 'ucim'),
    ('a0000000-0000-4000-8000-000000000038', 'programiranje', 'volim'),
    ('a0000000-0000-4000-8000-000000000038', 'preduzetnistvo', 'ucim'),
    ('a0000000-0000-4000-8000-000000000039', 'pisanje', 'volim'),
    ('a0000000-0000-4000-8000-000000000039', 'crtanje', 'ucim'),
    ('a0000000-0000-4000-8000-000000000040', 'sport', 'volim'),
    ('a0000000-0000-4000-8000-000000000040', 'kuvanje', 'ucim')
  on conflict do nothing;

  insert into public.projects (id, title, goal, icon, spots, status, leader_id, created_at, approved_at, completed_at, deadline, result_text) values
    ('b0000000-0000-4000-8000-000000000001', 'Ketering za školsku proslavu traži poslastičara', 'Slatki sto za 150 gostiju na proslavi Dana škole.', '🧁', 3, 'open', 'a0000000-0000-4000-8000-000000000014', now() - interval '9 days', now() - interval '8 days', null, current_date + 18, null),
    ('b0000000-0000-4000-8000-000000000002', 'Tura kroz Stari Bar traži vodiča na engleskom', 'Šetnja za goste iz partnerske škole iz Italije.', '🧭', 2, 'open', 'a0000000-0000-4000-8000-000000000009', now() - interval '8 days', now() - interval '7 days', null, current_date + 21, null),
    ('b0000000-0000-4000-8000-000000000003', 'Školski mural traži nekoga ko crta', 'Mural na zidu kod sale: „Naša škola, naš sto“.', '🎨', 3, 'open', 'a0000000-0000-4000-8000-000000000021', now() - interval '14 days', now() - interval '13 days', null, current_date + 14, null),
    ('b0000000-0000-4000-8000-000000000004', 'Bendu fali bubnjar', 'Tri pjesme za školsku žurku na kraju polugodišta.', '🥁', 2, 'open', 'a0000000-0000-4000-8000-000000000024', now() - interval '6 days', now() - interval '5 days', null, current_date + 30, null),
    ('b0000000-0000-4000-8000-000000000005', 'Bezalkoholni kokteli za Dan škole traže barmena', 'Meni od pet mocktaila i posluženje za goste.', '🍹', 2, 'open', 'a0000000-0000-4000-8000-000000000023', now() - interval '5 days', now() - interval '4 days', null, current_date + 18, null),
    ('b0000000-0000-4000-8000-000000000006', 'Turnir u odbojci traži organizatore', 'Međuodjeljenski turnir: raspored, sudije, medalje.', '🏐', 3, 'open', 'a0000000-0000-4000-8000-000000000028', now() - interval '10 days', now() - interval '9 days', null, current_date + 25, null),
    ('b0000000-0000-4000-8000-000000000007', 'Mini sajam učeničke zadruge traži prodavce', 'Štand sa domaćim proizvodima i cjenovnikom na dva jezika.', '💼', 3, 'open', 'a0000000-0000-4000-8000-000000000017', now() - interval '7 days', now() - interval '6 days', null, current_date + 20, null),
    ('b0000000-0000-4000-8000-000000000008', 'Foto-priča „Ljudi naše škole“ traži fotografa', 'Deset portreta i kratkih priča za hodnik prvog sprata.', '📷', 2, 'open', 'a0000000-0000-4000-8000-000000000011', now() - interval '4 days', now() - interval '3 days', null, current_date + 28, null),
    ('b0000000-0000-4000-8000-000000000009', 'Plesna tačka za maturu traži plesače', 'Koreografija od tri minuta za maturski program.', '💃', 4, 'open', 'a0000000-0000-4000-8000-000000000019', now() - interval '3 days', now() - interval '2 days', null, current_date + 40, null),
    ('b0000000-0000-4000-8000-000000000011', 'Školski podcast: 1. epizoda je vani', 'Prva epizoda o praksi u hotelima.', '🎙️', 3, 'done', 'a0000000-0000-4000-8000-000000000025', now() - interval '40 days', now() - interval '39 days', now() - interval '6 days', current_date + -5, 'Snimili smo 25 minuta razgovora sa učenicima sa prakse u Budvi. Epizoda je na školskom sajtu!'),
    ('b0000000-0000-4000-8000-000000000012', 'Kuvar za jedan dan: radionica za osnovce', 'Radionica pravljenja palačinki za 30 osnovaca.', '👩‍🍳', 3, 'done', 'a0000000-0000-4000-8000-000000000029', now() - interval '35 days', now() - interval '34 days', now() - interval '10 days', current_date + -9, '30 osnovaca, 200 palačinki i nijedna izgorjela. Recepte smo podijelili roditeljima.'),
    ('b0000000-0000-4000-8000-000000000013', 'Mini igra o istoriji škole', 'Kviz-igra za Dan otvorenih vrata.', '🎮', 2, 'done', 'a0000000-0000-4000-8000-000000000020', now() - interval '50 days', now() - interval '49 days', now() - interval '15 days', current_date + -14, 'Igru je na Danu otvorenih vrata odigralo 120 posjetilaca. Kod je otvoren za sljedeću generaciju.'),
    ('b0000000-0000-4000-8000-000000000014', 'Novogodišnji štand učeničke zadruge', 'Prodaja kolača i čestitki za humanitarnu akciju.', '🎄', 3, 'done', 'a0000000-0000-4000-8000-000000000010', now() - interval '60 days', now() - interval '59 days', now() - interval '20 days', current_date + -19, 'Prikupili smo 640 € za opremu dječjeg odjeljenja bolnice.')
  on conflict (id) do nothing;

  insert into public.project_tags (project_id, tag) values
    ('b0000000-0000-4000-8000-000000000001', 'poslasticarstvo'),
    ('b0000000-0000-4000-8000-000000000001', 'kuvanje'),
    ('b0000000-0000-4000-8000-000000000002', 'turizam'),
    ('b0000000-0000-4000-8000-000000000002', 'jezici'),
    ('b0000000-0000-4000-8000-000000000003', 'crtanje'),
    ('b0000000-0000-4000-8000-000000000004', 'bubnjevi'),
    ('b0000000-0000-4000-8000-000000000004', 'muzika'),
    ('b0000000-0000-4000-8000-000000000005', 'barmen'),
    ('b0000000-0000-4000-8000-000000000006', 'sport'),
    ('b0000000-0000-4000-8000-000000000006', 'preduzetnistvo'),
    ('b0000000-0000-4000-8000-000000000007', 'preduzetnistvo'),
    ('b0000000-0000-4000-8000-000000000007', 'jezici'),
    ('b0000000-0000-4000-8000-000000000008', 'fotografija'),
    ('b0000000-0000-4000-8000-000000000008', 'pisanje'),
    ('b0000000-0000-4000-8000-000000000009', 'ples'),
    ('b0000000-0000-4000-8000-000000000009', 'muzika'),
    ('b0000000-0000-4000-8000-000000000011', 'podcast'),
    ('b0000000-0000-4000-8000-000000000011', 'video'),
    ('b0000000-0000-4000-8000-000000000012', 'kuvanje'),
    ('b0000000-0000-4000-8000-000000000012', 'poslasticarstvo'),
    ('b0000000-0000-4000-8000-000000000013', 'programiranje'),
    ('b0000000-0000-4000-8000-000000000013', 'gaming'),
    ('b0000000-0000-4000-8000-000000000013', 'pisanje'),
    ('b0000000-0000-4000-8000-000000000014', 'preduzetnistvo'),
    ('b0000000-0000-4000-8000-000000000014', 'poslasticarstvo'),
    ('b0000000-0000-4000-8000-000000000014', 'crtanje')
  on conflict do nothing;

  insert into public.group_members (project_id, profile_id, joined_at) values
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000014', now() - interval '8 days'),
    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000009', now() - interval '7 days'),
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000021', now() - interval '13 days'),
    ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000024', now() - interval '5 days'),
    ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000023', now() - interval '4 days'),
    ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000028', now() - interval '9 days'),
    ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000017', now() - interval '6 days'),
    ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000011', now() - interval '3 days'),
    ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000019', now() - interval '2 days'),
    ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000025', now() - interval '39 days'),
    ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000029', now() - interval '34 days'),
    ('b0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000020', now() - interval '49 days'),
    ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000010', now() - interval '59 days'),
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', now() - interval '7 days'),
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000013', now() - interval '7 days'),
    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', now() - interval '6 days'),
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', now() - interval '12 days'),
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', now() - interval '12 days'),
    ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000012', now() - interval '4 days'),
    ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000007', now() - interval '3 days'),
    ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000002', now() - interval '8 days'),
    ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000016', now() - interval '8 days'),
    ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000008', now() - interval '5 days'),
    ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000018', now() - interval '2 days'),
    ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000015', now() - interval '1 days'),
    ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000027', now() - interval '1 days'),
    ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000026', now() - interval '38 days'),
    ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000011', now() - interval '38 days'),
    ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000006', now() - interval '33 days'),
    ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000022', now() - interval '33 days'),
    ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000013', now() - interval '58 days'),
    ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000017', now() - interval '58 days'),
    ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000030', now() - interval '58 days')
  on conflict do nothing;

  insert into public.wall_posts (project_id, author_id, kind, body, created_at) values
    ('b0000000-0000-4000-8000-000000000003', null, 'system', 'Projekat je odobren. Srećno, tim! 🚀', now() - interval '13 days'),
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000021', 'post', 'Skica je odobrena! Boje stižu u petak.', now() - interval '6 days'),
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'post', 'Ja donosim šablone za sunce 🌞', now() - interval '2 days'),
    ('b0000000-0000-4000-8000-000000000001', null, 'system', 'Projekat je odobren. Srećno, tim! 🚀', now() - interval '8 days'),
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000014', 'post', 'Probni dan u kuhinji: srijeda, 7. čas.', now() - interval '3 days'),
    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000009', 'post', 'Ruta: Kapija → Akvadukt → Sahat-kula. Treba nam još neko za engleski!', now() - interval '4 days'),
    ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000024', 'post', 'Proba u muzičkom kabinetu, petak poslije škole.', now() - interval '2 days'),
    ('b0000000-0000-4000-8000-000000000011', null, 'system', 'Projekat je završen! Rezultat je sada u feedu škole. 🎉', now() - interval '6 days')
;

  insert into private.first_group_events (profile_id, at) values
    ('a0000000-0000-4000-8000-000000000003', now() - interval '12 days'),
    ('a0000000-0000-4000-8000-000000000004', now() - interval '6 days'),
    ('a0000000-0000-4000-8000-000000000008', now() - interval '5 days'),
    ('a0000000-0000-4000-8000-000000000018', now() - interval '2 days'),
    ('a0000000-0000-4000-8000-000000000027', now() - interval '1 days')
;
end $seed$;

revoke all on function private.load_seed() from public, anon, authenticated;

select private.load_seed();
