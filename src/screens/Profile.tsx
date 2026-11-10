import { useNavigate } from 'react-router-dom'
import { useApp, useLive } from '../state'
import { KIND_LABEL, tagIcon, tagLabel } from '../i18n/me'
import { OfflineSwitch } from './Auth'
import { SCHOOL } from '../config/school'

export function Profile() {
  const { ds, me, setMe } = useApp()
  const nav = useNavigate()
  const { data: tags } = useLive(() => (me?.role === 'student' ? ds.getMyTags() : Promise.resolve([])), [])
  if (!me) return null
  return (
    <div className="page">
      <h1>{me.nick}</h1>
      <p className="muted">
        {me.role === 'student' ? `Odjeljenje ${me.class_label}` : me.role === 'mentor' ? 'Mentor' : 'Pedagog'} · {SCHOOL.name}
      </p>
      {me.role === 'student' && (
        <div className="card stack">
          <div className="row spread">
            <h3>Moje oznake</h3>
            <button className="btn small soft" onClick={() => nav('/oznake')}>Uredi</button>
          </div>
          <div className="chips">
            {(tags ?? []).map((t) => (
              <span key={t.tag} className="chip small on">{tagIcon(t.tag)} {tagLabel(t.tag)} <span className="k">{KIND_LABEL[t.kind].toLowerCase()}</span></span>
            ))}
          </div>
        </div>
      )}
      <OfflineSwitch />
      <div className="card stack">
        <h3>O demo verziji</h3>
        <p className="small muted">
          ConnectEd je demo za hakaton OpenHack. Svi učenici u bazi su izmišljeni. Nema analitike ni praćenja.
          Nema lajkova, pratilaca ni rang-lista: samo timovi koji zajedno nešto naprave.
        </p>
      </div>
      <button className="btn ghost block" data-testid="logout" onClick={async () => {
        await ds.logout()
        setMe(null)
        nav('/dobrodosli', { replace: true })
      }}>Odjavi se</button>
    </div>
  )
}
