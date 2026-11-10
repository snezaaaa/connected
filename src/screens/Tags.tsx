import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state'
import { TAGS } from '../config/school'
import type { TagKind } from '../data/types'
import { KIND_LABEL } from '../i18n/me'

const SHORT: Record<TagKind, string> = { volim: 'volim', znam: 'znam', ucim: 'učim' }

export function Tags() {
  const { ds, me, setMe, emitLocal } = useApp()
  const nav = useNavigate()
  const [kind, setKind] = useState<TagKind>('volim')
  const [sel, setSel] = useState<Record<string, TagKind>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const first = !me?.onboarded

  useEffect(() => {
    ds.getMyTags().then((t) => setSel(Object.fromEntries(t.map((x) => [x.tag, x.kind]))), () => {})
  }, [ds])

  const toggle = (slug: string) =>
    setSel((s) => {
      const n = { ...s }
      if (n[slug] === kind) delete n[slug]
      else n[slug] = kind
      return n
    })

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      await ds.saveTags(Object.entries(sel).map(([tag, k]) => ({ tag, kind: k })))
      if (me) setMe({ ...me, onboarded: true })
      emitLocal('invites')
      nav('/', { replace: true })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      {first && <div className="steps" aria-hidden>{[0, 1, 2, 3].map((i) => <i key={i} className="on" />)}</div>}
      <h1>Šta voliš i znaš?</h1>
      <p className="muted">Izaberi oznake. Po njima te pozivamo u timove.</p>
      <div className="seg" role="tablist" aria-label="Vrsta oznake">
        {(['volim', 'znam', 'ucim'] as TagKind[]).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <p className="tiny">Dodir dodaje oznaku kao „{KIND_LABEL[kind].toLowerCase()}“. Ponovni dodir je uklanja.</p>
      <div className="chips">
        {TAGS.map((t) => (
          <button key={t.slug} className={`chip ${sel[t.slug] ? 'on' : ''}`} data-testid={`tag-${t.slug}`} onClick={() => toggle(t.slug)} aria-pressed={!!sel[t.slug]}>
            <span>{t.icon}</span> {t.label}
            {sel[t.slug] && <span className="k">{SHORT[sel[t.slug]]}</span>}
          </button>
        ))}
      </div>
      {err && <div className="error-box">{err}</div>}
      <button className="btn block" data-testid="save-tags" disabled={busy || Object.keys(sel).length === 0} onClick={save}>
        Sačuvaj profil
      </button>
      {first && <p className="tiny" style={{ textAlign: 'center' }}>👤 Profil · 30 sekundi</p>}
    </div>
  )
}
