import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../state'
import { go as goTo } from '../lib/go'
import { SCHOOL } from '../config/school'
import type { AppNotification, LocalAccount } from '../data/types'
import { fmtAgo } from '../i18n/me'
import { Icon } from './Icon'

const logo = `${import.meta.env.BASE_URL}icon-192.png`

export function Header() {
  const { ds, me, on, toast } = useApp()
  const [notes, setNotes] = useState<AppNotification[]>([])
  const [sheet, setSheet] = useState<'notes' | 'help' | null>(null)
  const [menu, setMenu] = useState(false)
  const toasted = useRef<Set<string> | null>(null)
  const nav = useNavigate()

  const loadNotes = useCallback(async () => {
    if (!me) return
    const list = await ds.getNotifications().catch(() => [] as AppNotification[])
    setNotes(list)
    if (toasted.current === null) {
      toasted.current = new Set(list.map((n) => n.id)) // stara obavještenja se ne prikazuju kao toast
    } else {
      const fresh = list.find((n) => !n.read && !toasted.current!.has(n.id))
      list.forEach((n) => toasted.current!.add(n.id))
      if (fresh) {
        toast(fresh.body, fresh.kind === 'new_member' ? '🎉' : '🔔')
        try {
          navigator.vibrate?.(80)
        } catch {
          /* ignore */
        }
      }
    }
  }, [ds, me, toast])

  useEffect(() => {
    toasted.current = null
    void loadNotes()
    return on((c) => {
      if (c === 'notifications') void loadNotes()
    })
  }, [loadNotes, on])

  const unread = notes.some((n) => !n.read)
  const openNotes = () => {
    setSheet('notes')
    if (unread) void ds.markNotificationsRead().then(loadNotes)
  }

  return (
    <>
      <header className="header">
        <Link to="/" className="brand" aria-label="ConnectEd početna">
          <img src={logo} alt="" />
          <div>
            <b>ConnectEd</b>
            <div className="school">{SCHOOL.name}</div>
          </div>
        </Link>
        <span className="spacer" />
        <span className={`demo-pill ${ds.mode === 'offline' ? 'off' : ''}`} title="Ovo je demo verzija">
          {ds.mode === 'offline' ? 'Offline demo' : 'Demo'}
        </span>
        {ds.mode === 'offline' && (
          <button className="icon-btn" aria-label="Prebaci nalog" data-testid="switch-account" onClick={() => setMenu((m) => !m)}>
            <Icon name="swap" />
          </button>
        )}
        {me?.role === 'student' && (
          <button className="icon-btn" aria-label="Treba mi pomoć" data-testid="help-btn" onClick={() => setSheet('help')}>
            <Icon name="help" />
          </button>
        )}
        {me && (
          <button className="icon-btn" aria-label="Obavještenja" data-testid="bell" onClick={openNotes}>
            <Icon name="bell" />
            {unread && <span className="dot" data-testid="bell-dot" />}
          </button>
        )}
        {menu && <AccountMenu onClose={() => setMenu(false)} />}
      </header>

      {sheet === 'notes' && (
        <div className="overlay" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h2>Obavještenja</h2>
            {notes.length === 0 && <p className="empty">Još ništa novo. 💜</p>}
            {notes.map((n) => (
              <div
                key={n.id}
                className="card tap"
                style={{ boxShadow: 'none', background: n.read ? '#f7f6fb' : 'var(--violet-soft)' }}
                onClick={() => {
                  setSheet(null)
                  if (n.project_id) nav(`/projekat/${n.project_id}`)
                }}
              >
                <p style={{ fontWeight: 600 }}>{n.body}</p>
                <p className="tiny">{fmtAgo(n.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {sheet === 'help' && <HelpSheet onClose={() => setSheet(null)} />}
    </>
  )
}

function HelpSheet({ onClose }: { onClose: () => void }) {
  const { ds } = useApp()
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} data-testid="help-sheet">
        <div className="grab" />
        <span className="demo-pill" style={{ alignSelf: 'flex-start' }}>Demo</span>
        {sent ? (
          <>
            <h2>Poslato. 💜</h2>
            <p className="muted">Neko od odraslih iz škole će ti se javiti. Ovu poruku vide samo mentor i pedagog.</p>
            <button className="btn block" onClick={onClose}>U redu</button>
          </>
        ) : (
          <>
            <h2>Treba mi pomoć</h2>
            <p className="muted">
              Diskretno javi mentoru ili pedagogu da želiš razgovor. Niko drugi ovo ne vidi.
              <br />
              <span className="small">U ovoj demo verziji signal ide mentoru na ekran „Mentor“.</span>
            </p>
            <textarea className="input" placeholder="Ako želiš, napiši nešto (nije obavezno)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            <button
              className="btn block"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await ds.requestHelp(note).catch(() => {})
                setBusy(false)
                setSent(true)
              }}
            >
              Pošalji diskretno
            </button>
            <button className="link-btn" onClick={onClose}>Zatvori</button>
          </>
        )}
      </div>
    </div>
  )
}

/** Offline: „Prebaci nalog“ — više uloga na jednom uređaju. */
function AccountMenu({ onClose }: { onClose: () => void }) {
  const { ds, me, setMe } = useApp()
  const accounts: LocalAccount[] = ds.listAccounts?.() ?? []
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={onClose} />
      <div className="menu" data-testid="account-menu">
        <div className="lbl">Prebaci nalog</div>
        {accounts.map((a) => (
          <button
            key={a.profile_id}
            className={a.profile_id === me?.id ? 'on' : ''}
            onClick={async () => {
              const m = await ds.switchAccount!(a.profile_id)
              setMe(m)
              onClose()
              goTo(m.role === 'student' ? '/' : '/mentor')
            }}
          >
            {a.role === 'student' ? '🎒' : '🧑‍🏫'} {a.nick}
            {a.role !== 'student' && <span className="tiny">mentor</span>}
          </button>
        ))}
        <button
          onClick={async () => {
            await ds.logout()
            onClose()
            setMe(null)
            goTo('/registracija')
          }}
        >
          ➕ Novi nalog (kod)
        </button>
      </div>
    </>
  )
}
