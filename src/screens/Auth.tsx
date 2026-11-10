import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../state'
import { SCHOOL } from '../config/school'
import { nickProblem } from '../lib/nick'
import { hasSupabaseConfig, isOfflineMode, setOfflineMode } from '../data'

const logo = `${import.meta.env.BASE_URL}logo.png`

export function Welcome() {
  const offline = isOfflineMode()
  const { ds, setMe } = useApp()
  const nav = useNavigate()
  const accounts = ds.listAccounts?.() ?? []
  return (
    <div className="page center" style={{ gap: 18 }}>
      <img className="hero-logo" src={logo} alt="ConnectEd" />
      <div style={{ textAlign: 'center' }}>
        <h1 className="grad-text" style={{ fontSize: 30 }}>{SCHOOL.slogan}</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Školski projekti, sekcije i timovi na jednom mjestu. Po onome što voliš i znaš.
        </p>
        <p className="small" style={{ marginTop: 12, fontWeight: 600 }}>{SCHOOL.name}</p>
      </div>
      <div className="stack" style={{ marginTop: 6 }}>
        <Link to="/registracija" className="btn block" style={{ textDecoration: 'none' }}>Imam pristupni kod</Link>
        <Link to="/prijava" className="btn block ghost" style={{ textDecoration: 'none' }}>Već imam nalog</Link>
      </div>
      {accounts.length > 0 && (
        <div className="card stack">
          <b className="head">Nastavi kao</b>
          <div className="row wrap">
            {accounts.map((a) => (
              <button key={a.profile_id} className="chip" data-testid={`as-${a.nick}`}
                onClick={async () => {
                  const m = await ds.switchAccount!(a.profile_id)
                  setMe(m)
                  nav(m.role === 'student' ? (m.onboarded ? '/' : '/oznake') : '/mentor')
                }}>
                {a.role === 'student' ? '🎒' : '🧑‍🏫'} {a.nick}
              </button>
            ))}
          </div>
        </div>
      )}
      <OfflineSwitch />
      <p className="tiny" style={{ textAlign: 'center' }}>
        <span className="demo-pill">Demo</span> Svi učenici u ovoj verziji su izmišljeni.
        {offline && ' Podaci ostaju samo na ovom uređaju.'}
      </p>
    </div>
  )
}

export function OfflineSwitch() {
  const offline = isOfflineMode()
  return (
    <div className="card switch">
      <div>
        <b className="head">Offline demo</b>
        <p className="tiny">
          {hasSupabaseConfig
            ? 'Cijeli tok na jednom uređaju, bez interneta. Uz „Prebaci nalog“.'
            : 'Server nije podešen, pa aplikacija radi offline.'}
        </p>
      </div>
      <input
        type="checkbox"
        role="switch"
        aria-label="Offline demo"
        data-testid="offline-toggle"
        checked={offline}
        disabled={!hasSupabaseConfig}
        onChange={(e) => setOfflineMode(e.target.checked)}
      />
    </div>
  )
}

export function Register() {
  const { ds, setMe } = useApp()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [code, setCode] = useState('')
  const [codeInfo, setCodeInfo] = useState<string | null>(null)
  const [nick, setNick] = useState('')
  const [nickMsg, setNickMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pass, setPass] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Uživo provjera nika
  useEffect(() => {
    if (step !== 1 || !nick) return setNickMsg(null)
    const local = nickProblem(nick)
    if (local) return setNickMsg({ ok: false, text: local })
    const t = setTimeout(async () => {
      const r = await ds.nickStatus(nick).catch(() => null)
      if (r) setNickMsg(r.ok ? { ok: true, text: 'Slobodno ✓' } : { ok: false, text: r.problem ?? '' })
    }, 300)
    return () => clearTimeout(t)
  }, [nick, step, ds])

  const go = async (fn: () => Promise<void>) => {
    setErr(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submitCode = () =>
    go(async () => {
      const r = await ds.checkCode(code)
      if (!r.ok) throw new Error('Kod nije važeći ili je već iskorišćen.')
      setCodeInfo(r.role === 'student' ? `Odjeljenje ${r.class_label}` : 'Uloga: mentor')
      setStep(1)
    })
  const submitNick = () =>
    go(async () => {
      const r = await ds.nickStatus(nick)
      if (!r.ok) throw new Error(r.problem ?? 'Probaj drugi nik.')
      setStep(2)
    })
  const submitPass = () =>
    go(async () => {
      if (pass.length < 6) throw new Error('Lozinka treba da ima bar 6 znakova.')
      const me = await ds.register(code, nick, pass)
      setMe(me)
      nav(me.role === 'student' ? '/oznake' : '/mentor', { replace: true })
    })

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <div className="steps" aria-hidden>
        {[0, 1, 2, 3].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}
      </div>
      {step === 0 && (
        <form className="stack" onSubmit={(e) => (e.preventDefault(), submitCode())}>
          <h1>Unesi pristupni kod</h1>
          <p className="muted">Kod si dobio/la od razrednog starješine ili mentora. Važi jednom.</p>
          <input className="input code" data-testid="code" placeholder="CE-3B-7K2Q" value={code} autoFocus
            onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
          <button className="btn block" disabled={busy || code.length < 6}>Dalje</button>
        </form>
      )}
      {step === 1 && (
        <form className="stack" onSubmit={(e) => (e.preventDefault(), submitNick())}>
          <span className="badge green" style={{ alignSelf: 'flex-start' }}>✓ {codeInfo}</span>
          <h1>Izaberi nik</h1>
          <p className="muted">Bez imena i prezimena. Tako će te vidjeti tim.</p>
          <input className="input" data-testid="nick" placeholder="npr. luna.k" value={nick} autoFocus maxLength={20}
            onChange={(e) => setNick(e.target.value.replace(/\s/g, ''))} autoCapitalize="none" autoComplete="off" />
          {nickMsg && <p className={`hint ${nickMsg.ok ? 'ok' : 'err'}`}>{nickMsg.text}</p>}
          <button className="btn block" disabled={busy || !nickMsg?.ok}>Dalje</button>
        </form>
      )}
      {step === 2 && (
        <form className="stack" onSubmit={(e) => (e.preventDefault(), submitPass())}>
          <h1>Lozinka</h1>
          <p className="muted">Bar 6 znakova. Za prijavu ti trebaju samo nik i lozinka.</p>
          <input className="input" data-testid="password" type="password" value={pass} autoFocus autoComplete="new-password"
            onChange={(e) => setPass(e.target.value)} />
          <button className="btn block" disabled={busy || pass.length < 6}>{busy ? 'Pravim nalog…' : 'Napravi nalog'}</button>
        </form>
      )}
      {err && <div className="error-box" role="alert">{err}</div>}
      <Link to="/dobrodosli" className="link-btn" style={{ textAlign: 'center' }}>Nazad</Link>
    </div>
  )
}

export function Login() {
  const { ds, setMe } = useApp()
  const nav = useNavigate()
  const [nick, setNick] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="page"
      style={{ paddingTop: 32 }}
      onSubmit={async (e) => {
        e.preventDefault()
        setErr(null)
        setBusy(true)
        try {
          const me = await ds.login(nick, pass)
          setMe(me)
          nav(me.role === 'student' ? (me.onboarded ? '/' : '/oznake') : '/mentor', { replace: true })
        } catch (e) {
          setErr((e as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h1>Dobro došli nazad</h1>
      <div className="field">
        <label htmlFor="ln">Nik</label>
        <input id="ln" className="input" value={nick} onChange={(e) => setNick(e.target.value.trim())} autoCapitalize="none" autoComplete="username" />
      </div>
      <div className="field">
        <label htmlFor="lp">Lozinka</label>
        <input id="lp" className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
      </div>
      {err && <div className="error-box" role="alert">{err}</div>}
      <button className="btn block" disabled={busy || !nick}>Prijavi se</button>
      <Link to="/dobrodosli" className="link-btn" style={{ textAlign: 'center' }}>Nazad</Link>
    </form>
  )
}
