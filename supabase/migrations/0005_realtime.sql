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
