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
