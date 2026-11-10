-- ═════════════════════════════════════════════════════════════
--  ConnectEd · 0006 · Ispravka „Resetuj demo“
--  Supabase (pg-safeupdate) odbija DELETE bez WHERE kad se poziva
--  preko API-ja. Za bazu postavljenu prije ove ispravke: pokrenite
--  ovaj fajl u SQL Editoru. Bezbjedno je pokrenuti ga više puta.
-- ═════════════════════════════════════════════════════════════

create or replace function public.reset_demo()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  delete from auth.users u
  where exists (select 1 from public.profiles p where p.user_id = u.id and p.role = 'student')
     or not exists (select 1 from public.profiles p where p.user_id = u.id);
  delete from public.notifications where true;
  delete from public.help_signals where true;
  delete from public.projects where true; -- kaskadno: oznake, članovi, pozivi, zid
  delete from public.group_members where true;
  delete from public.profiles where role = 'student';
  delete from private.first_group_events where true;
  update public.access_codes set used_at = null where role = 'student';
  perform private.load_seed();
  update public.demo_meta set reset_at = now() where id = 1;
end $$;

revoke execute on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated;
