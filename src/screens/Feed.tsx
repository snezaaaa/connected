import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp, useLive } from '../state'
import { ProjectCard } from '../components/ProjectCard'
import { Icon } from '../components/Icon'
import type { ProjectItem } from '../data/types'

type Filter = 'sve' | 'pozivi' | 'utoku' | 'urađeno'
const FILTERS: [Filter, string][] = [['sve', 'Sve'], ['pozivi', 'Pozivi'], ['utoku', 'U toku'], ['urađeno', 'Urađeno']]

export function Feed() {
  const { ds, me, toast, confetti } = useApp()
  const nav = useNavigate()
  const [f, setF] = useState<Filter>('sve')
  const { data, error, reload } = useLive(() => ds.getFeed(), ['feed', 'invites'])

  const join = async (p: ProjectItem) => {
    try {
      const r = await ds.joinProject(p.id)
      if (r === 'full') return toast('Tim se upravo popunio. Biće još prilika!', '💜')
      confetti()
      toast('Dobro došli u tim! 🎉', '💜')
      nav(`/projekat/${p.id}`)
    } catch (e) {
      toast((e as Error).message, '⚠️')
      reload()
    }
  }

  const items = (data ?? []).filter((p) =>
    f === 'sve' ? true : f === 'pozivi' ? !!p.invite || (p.status === 'open' && p.free > 0) : f === 'utoku' ? p.status === 'open' || p.status === 'pending' : p.status === 'done',
  )

  return (
    <div className="page">
      <h1>U školi</h1>
      <div className="filters" role="tablist">
        {FILTERS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>
        ))}
      </div>
      {me?.role === 'student' && (
        <Link to="/novi" className="card tap row" style={{ textDecoration: 'none', color: 'inherit', background: 'var(--violet-soft)', boxShadow: 'none' }} data-testid="new-project">
          <div className="ptile" style={{ background: '#fff' }}><Icon name="plus" size={26} /></div>
          <div>
            <b className="head">Pokreni projekat</b>
            <p className="small muted">Imaš ideju? Okupi tim po talentima.</p>
          </div>
        </Link>
      )}
      {error && <div className="error-box">{error}</div>}
      {!data && !error && <div className="spinner" />}
      {data && items.length === 0 && <p className="empty">Ovdje još nema ničega. Uskoro! ✨</p>}
      {items.map((p) => (
        <ProjectCard key={p.id} p={p} onJoin={me?.role === 'student' ? join : undefined} />
      ))}
    </div>
  )
}

export function MyGroups() {
  const { ds } = useApp()
  const { data } = useLive(() => ds.getMyGroups(), ['feed', 'invites'])
  return (
    <div className="page">
      <h1>Moji timovi</h1>
      {!data && <div className="spinner" />}
      {data && data.length === 0 && (
        <div className="empty">
          <p>Još nisi u timu. Pogledaj pozive u feedu ili pokreni svoj projekat. ✨</p>
          <Link to="/novi" className="btn small soft" style={{ marginTop: 12, textDecoration: 'none' }}>Pokreni projekat</Link>
        </div>
      )}
      {data?.map((p) => <ProjectCard key={p.id} p={p} />)}
    </div>
  )
}
