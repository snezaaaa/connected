import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp, useLive } from '../state'
import { Icon } from '../components/Icon'
import { STATUS_LABEL, fmtAgo, fmtDate, inviteReason, tagIcon, tagLabel } from '../i18n/me'

const initials = (n: string) => n.replace(/[^A-Za-zČĆŠŽĐčćšžđ0-9]/g, '').slice(0, 2).toUpperCase() || '🙂'

export function Project() {
  const { id = '' } = useParams()
  const { ds, me, toast, confetti } = useApp()
  const nav = useNavigate()
  const { data: p, loaded, reload } = useLive(() => ds.getProject(id), ['wall', 'feed', 'invites'], [id])
  const [body, setBody] = useState('')
  const [done, setDone] = useState(false)
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const seen = useRef<Set<string> | null>(null)
  const wallEnd = useRef<HTMLDivElement>(null)

  const fresh = new Set<string>()
  if (p) {
    if (seen.current) for (const w of p.wall) if (!seen.current.has(w.id)) fresh.add(w.id)
  }
  useEffect(() => {
    if (!p) return
    const first = seen.current === null
    seen.current = new Set(p.wall.map((w) => w.id))
    if (!first && fresh.size) wallEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <div className="page"><div className="spinner" /></div>
  if (!p) return <div className="page"><p className="empty">Projekat nije pronađen.</p></div>

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      reload()
    } catch (e) {
      toast((e as Error).message, '⚠️')
    } finally {
      setBusy(false)
    }
  }

  let progress: { pct: number; label: string } | null = null
  if (p.status === 'open' && p.deadline && p.approved_at) {
    const start = new Date(p.approved_at).getTime()
    const end = new Date(p.deadline + 'T23:59:59').getTime()
    const weeks = Math.max(1, Math.ceil((end - start) / (7 * 86400_000)))
    const cur = Math.min(weeks, Math.max(1, Math.ceil((Date.now() - start) / (7 * 86400_000))))
    progress = { pct: Math.min(100, Math.max(6, ((Date.now() - start) / (end - start)) * 100)), label: `${cur}. od ${weeks} nedjelje` }
  }
  const student = me?.role === 'student'

  return (
    <div className="page">
      <button className="icon-btn" aria-label="Nazad" onClick={() => nav(-1)} style={{ marginLeft: -8 }}><Icon name="back" /></button>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="ptile big" style={{ width: 64, height: 64, fontSize: 34, borderRadius: 18 }}>{p.icon}</div>
        <div style={{ flex: 1 }}>
          <h2 data-testid="project-title">{p.title}</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            {p.members.length > 0
              ? `Tim · ${p.class_count > 1 ? `članovi iz ${p.class_count} odjeljenja` : 'iz jednog odjeljenja'}`
              : `Vodi: ${p.leader_nick}`}
          </p>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className={`badge ${p.status === 'done' ? 'green' : p.status === 'open' ? '' : 'amber'}`}>{STATUS_LABEL[p.status]}</span>
        {p.tags.map((t) => <span key={t} className="badge grey">{tagIcon(t)} {tagLabel(t)}</span>)}
      </div>

      <div className="card stack">
        <p><b>Cilj:</b> {p.goal}</p>
        <p className="small muted">📅 Rok: {fmtDate(p.deadline)}</p>
        {progress && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row spread small"><b>Napredak</b><span className="muted">{progress.label}</span></div>
            <div className="progress"><i style={{ width: `${progress.pct}%` }} /></div>
          </div>
        )}
        {p.status === 'done' && p.result_text && (
          <div className="post system" style={{ fontWeight: 500 }}>🏁 {p.result_text}</div>
        )}
      </div>

      {p.members.length > 0 && (
        <div className="card stack">
          <h3>Tim</h3>
          <div className="members" data-testid="members">
            {p.members.map((m) => (
              <span key={m.nick} className="member">
                <span className="avatar">{initials(m.nick)}</span>
                {m.nick}
                {m.class_label && <span className="tiny">{m.class_label}</span>}
                {m.is_leader && <span title="Vođa">⭐</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {student && p.invite && (
        <div className="card stack" style={{ border: '2px solid var(--violet)' }}>
          <b className="head">Trebaš nam. ✨</b>
          <span className="small muted">Zašto ti: {inviteReason(p.invite.reason_tag, p.invite.reason_kind)}</span>
          <div className="row">
            <button className="btn small" disabled={busy} onClick={() => act(async () => {
              const r = await ds.respondInvite(p.invite!.id, true)
              if (r === 'ok') { confetti(); toast('Dobro došli u tim! 🎉', '💜') }
              if (r === 'full') toast('Tim se upravo popunio. Biće još prilika!', '💜')
            })}>Pridružujem se</button>
            <button className="btn small ghost" disabled={busy} onClick={() => act(() => ds.respondInvite(p.invite!.id, false))}>Ne sada</button>
          </div>
        </div>
      )}
      {student && !p.invite && p.status === 'open' && !p.is_member && p.free > 0 && (
        <button className="btn block" disabled={busy} onClick={() => act(async () => {
          const r = await ds.joinProject(p.id)
          if (r === 'ok') { confetti(); toast('Dobro došli u tim! 🎉', '💜') }
        })}>Pridruži se</button>
      )}
      {p.status === 'pending' && <div className="card"><p className="muted">⏳ Projekat čeka odobrenje mentora. Javićemo ti čim bude odobren.</p></div>}

      {p.can_see_wall && (
        <div className="card stack">
          <div className="row spread">
            <h3>Zid tima</h3>
            <span className="tiny">👁️ vidi i mentor</span>
          </div>
          <div className="wall" data-testid="wall">
            {p.wall.length === 0 && <p className="tiny">Još nema poruka.</p>}
            {p.wall.map((w) => (
              <div key={w.id} className={`post ${w.kind === 'system' ? 'system' : ''} ${fresh.has(w.id) ? 'fresh' : ''}`}>
                {w.kind === 'post' && <div className="who">{w.author_nick ?? '—'}</div>}
                <div>{w.body}</div>
                <div className="tiny">{fmtAgo(w.created_at)}</div>
              </div>
            ))}
            <div ref={wallEnd} />
          </div>
          {p.can_post && (
            <form className="composer" onSubmit={(e) => {
              e.preventDefault()
              const b = body
              setBody('')
              void act(() => ds.postWall(p.id, b))
            }}>
              <input className="input" placeholder="Napiši timu…" value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} />
              <button className="btn small" aria-label="Pošalji" disabled={!body.trim()}><Icon name="send" size={18} /></button>
            </form>
          )}
        </div>
      )}

      {student && p.is_member && p.status === 'open' && (
        <div className="stack">
          {!done ? (
            <button className="btn block soft" onClick={() => setDone(true)} data-testid="complete-open">🏁 Označi kao završeno</button>
          ) : (
            <div className="card stack">
              <h3>Šta ste uradili?</h3>
              <textarea className="input" data-testid="complete-text" value={result} maxLength={400} placeholder="Kratko: rezultat koji će svi vidjeti u feedu." onChange={(e) => setResult(e.target.value)} />
              <button className="btn block" disabled={busy || result.trim().length < 3} data-testid="complete-submit" onClick={() => act(async () => {
                await ds.completeProject(p.id, result)
                setDone(false)
                confetti()
                toast('Bravo! Rezultat je sada u feedu škole. 🎉', '🏁')
              })}>Objavi rezultat</button>
            </div>
          )}
          {!p.is_leader && (
            <button className="link-btn" onClick={() => act(() => ds.leaveProject(p.id))}>Napusti tim</button>
          )}
        </div>
      )}
    </div>
  )
}
