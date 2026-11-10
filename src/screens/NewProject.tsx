import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state'
import { TAGS } from '../config/school'

const ICONS = ['✨', '🎙️', '🎨', '🧁', '🧭', '🎵', '🥁', '📷', '🎬', '⚽', '💼', '🍹', '💃', '💻', '🎮', '✍️']

export function NewProject() {
  const { ds, toast } = useApp()
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10))
  const [spots, setSpots] = useState(2)
  const [icon, setIcon] = useState('✨')
  const [tags, setTags] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ok = title.trim().length >= 3 && goal.trim().length >= 1 && tags.length > 0
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await ds.createProject({ title, goal, deadline: deadline || null, spots, icon, tags })
      toast('Poslato mentoru na odobrenje ✨', '📨')
      nav('/timovi', { replace: true })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="page" onSubmit={submit}>
      <h1>Pokreni projekat</h1>
      <p className="muted">Mentor ga odobrava jednim dodirom. Onda šaljemo pozive onima koji to vole i znaju.</p>
      <div className="field">
        <label htmlFor="np-title">Naziv</label>
        <input id="np-title" data-testid="np-title" className="input" placeholder="npr. Podcast traži montažera" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="np-goal">Cilj</label>
        <textarea id="np-goal" data-testid="np-goal" className="input" placeholder="Šta želite da napravite?" value={goal} maxLength={300} onChange={(e) => setGoal(e.target.value)} />
      </div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 16 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="np-dl">Rok</label>
          <input id="np-dl" className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div className="field">
          <label>Koliko ljudi tražite</label>
          <div className="stepper">
            <button type="button" aria-label="Manje" onClick={() => setSpots((s) => Math.max(1, s - 1))}>−</button>
            <b>{spots}</b>
            <button type="button" aria-label="Više" onClick={() => setSpots((s) => Math.min(8, s + 1))}>+</button>
          </div>
        </div>
      </div>
      <div className="field">
        <label>Ikonica</label>
        <div className="emoji-pick">
          {ICONS.map((i) => (
            <button type="button" key={i} className={icon === i ? 'on' : ''} onClick={() => setIcon(i)}>{i}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Koga tražite? (potrebne oznake)</label>
        <div className="chips">
          {TAGS.map((t) => {
            const on = tags.includes(t.slug)
            return (
              <button type="button" key={t.slug} data-testid={`np-tag-${t.slug}`} className={`chip small ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => setTags((x) => (on ? x.filter((y) => y !== t.slug) : [...x, t.slug]))}>
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>
      </div>
      {err && <div className="error-box">{err}</div>}
      <button className="btn block" data-testid="np-submit" disabled={!ok || busy}>Pošalji na odobrenje</button>
    </form>
  )
}
