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
