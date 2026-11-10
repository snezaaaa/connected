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
