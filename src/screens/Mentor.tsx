import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp, useLive } from '../state'
import { fmtAgo, tagLabel } from '../i18n/me'
import type { Metrics } from '../data/types'

export function Mentor() {
  const { ds, toast } = useApp()
  const nav = useNavigate()
  const { data, error, reload } = useLive(() => ds.getMentorDashboard(), ['mentor', 'feed', 'reset'])
  const [showCodes, setShowCodes] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true)
    try {
      await fn()
      if (msg) toast(msg, '✅')
      reload()
    } catch (e) {
      toast((e as Error).message, '⚠️')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="page"><div className="error-box">{error}</div></div>
  if (!data) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <h1>Mentor</h1>
      <MetricsGrid m={data.metrics} />
      <p className="tiny">Samo zbirni brojevi. Bez imena i bez spiskova učenika.</p>

      <div className="section-title"><h2>Na odobrenju</h2><span className="badge">{data.pending.length}</span></div>
      {data.pending.length === 0 && <p className="tiny">Nema projekata koji čekaju.</p>}
      {data.pending.map((p) => (
        <div key={p.id} className="card stack" data-testid="pending-project">
          <div className="pcard">
            <div className="ptile">{p.icon}</div>
            <div>
              <div className="t head">{p.title}</div>
              <div className="meta">{p.tags.map(tagLabel).join(' · ')} · vodi {p.leader_nick} · {fmtAgo(p.created_at)}</div>
              <p className="small" style={{ marginTop: 6 }}>{p.goal}</p>
            </div>
          </div>
          <div className="row">
            <button className="btn small" style={{ flex: 1 }} disabled={busy} data-testid="approve" onClick={() => act(() => ds.approveProject(p.id, true), 'Odobreno. Pozivi su poslati.')}>✓ Odobri</button>
            <button className="btn small ghost" disabled={busy} onClick={() => act(() => ds.approveProject(p.id, false))}>Odbij</button>
          </div>
        </div>
      ))}

      <div className="section-title"><h2>Treba pomoć</h2><span className="demo-pill">Demo</span></div>
      {data.help.length === 0 && <p className="tiny">Nema novih signala.</p>}
      {data.help.map((h) => (
        <div key={h.id} className="card row spread" data-testid="help-signal">
          <div>
            <b>{h.nick}</b> <span className="tiny">{h.class_label} · {fmtAgo(h.created_at)}</span>
            {h.note && <p className="small muted">„{h.note}“</p>}
          </div>
          <button className="btn small soft" onClick={() => act(() => ds.resolveHelp(h.id))}>Javio/la sam se</button>
        </div>
      ))}

      <div className="section-title"><h2>Timovi u toku</h2></div>
      {data.groups.map((p) => (
        <div key={p.id} className="card tap row" onClick={() => nav(`/projekat/${p.id}`)}>
          <div className="ptile" style={{ width: 40, height: 40, fontSize: 20 }}>{p.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b className="small">{p.title}</b>
            <div className="tiny">{p.members.map((m) => m.nick).join(', ')}</div>
          </div>
          <span className="tiny">zid →</span>
        </div>
      ))}

      <div className="section-title">
        <h2>Neiskorišćeni kodovi</h2>
        <button className="btn small ghost" onClick={() => setShowCodes((s) => !s)}>{showCodes ? 'Sakrij' : `Prikaži (${data.codes.length})`}</button>
      </div>
      {showCodes && (
        <div className="stack" data-testid="codes" style={{ gap: 8 }}>
          {groupCodes(data.codes).map(([label, list]) => (
            <div key={label} className="code-row">
              <b>{label}</b>
              <div className="chips">
                {list.map((c) => <code key={c}>{c}</code>)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card stack" style={{ marginTop: 10 }}>
        <h3>Resetuj demo</h3>
        <p className="small muted">Vraća bazu na početno stanje: briše naloge učenika napravljene tokom probe, vraća kodove i projekte. Mentorski nalozi ostaju.</p>
        {!confirmReset ? (
          <button className="btn danger block" onClick={() => setConfirmReset(true)} data-testid="reset">Resetuj demo</button>
        ) : (
          <div className="row">
            <button className="btn danger" style={{ flex: 1 }} disabled={busy} data-testid="reset-confirm" onClick={() => act(async () => {
              await ds.resetDemo()
              setConfirmReset(false)
            }, 'Demo je vraćen na početak.')}>Da, resetuj</button>
            <button className="btn ghost" onClick={() => setConfirmReset(false)}>Odustani</button>
          </div>
        )}
      </div>
    </div>
  )
}

function groupCodes(codes: { code: string; role: string; class_label: string | null }[]): [string, string[]][] {
  const m = new Map<string, string[]>()
  for (const c of codes) {
    const k = c.role === 'student' ? c.class_label ?? '' : c.role === 'mentor' ? 'Mentor' : 'Pedagog'
    m.set(k, [...(m.get(k) ?? []), c.code])
  }
  return [...m.entries()]
}

function MetricsGrid({ m }: { m: Metrics }) {
  const prev = useRef(m)
  const [bump, setBump] = useState<string | null>(null)
  useEffect(() => {
    const p = prev.current
    const k = (Object.keys(m) as (keyof Metrics)[]).find((x) => m[x] !== p[x])
    prev.current = m
    if (k) {
      setBump(k)
      const t = setTimeout(() => setBump(null), 1000)
      return () => clearTimeout(t)
    }
  }, [m])
  const cls = (k: keyof Metrics, extra = '') => `metric ${extra} ${bump === k ? 'bump' : ''}`
  return (
    <div className="metrics" data-testid="metrics">
      <div className={cls('in_group_pct', 'hero')}><b data-testid="m-pct">{m.in_group_pct}%</b><span>učenika je u bar jednoj grupi</span></div>
      <div className={cls('zero_to_one', 'hero')}><b data-testid="m-0to1">{m.zero_to_one}</b><span>prešlo sa 0 na 1 grupu</span></div>
      <div className={cls('done')}><b data-testid="m-done">{m.done}</b><span>završenih projekata</span></div>
      <div className={cls('mixed_groups')}><b data-testid="m-mixed">{m.mixed_groups}</b><span>grupa iz više odjeljenja</span></div>
    </div>
  )
}
