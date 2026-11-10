import { useNavigate } from 'react-router-dom'
import type { ProjectItem } from '../data/types'
import { STATUS_LABEL, fmtAgo, tagLabel } from '../i18n/me'
import { Icon } from './Icon'

export function ProjectCard({ p, onJoin }: { p: ProjectItem; onJoin?: (p: ProjectItem) => void }) {
  const nav = useNavigate()
  const open = () => nav(`/projekat/${p.id}`)

  if (p.status === 'done') {
    return (
      <article className="card tap result-card" onClick={open} data-testid="result-card">
        <div className="result-banner">{p.icon}</div>
        <span className="badge green"><Icon name="check" size={14} stroke={3} /> Urađeno · {p.completed_at ? fmtAgo(p.completed_at) : ''}</span>
        <h3 style={{ marginTop: 8 }}>{p.title}</h3>
        {p.result_text && <p className="result">{p.result_text}</p>}
        <p className="names">{p.members.map((m) => `${m.nick}${m.class_label ? ` (${m.class_label})` : ''}`).join(', ')}</p>
      </article>
    )
  }

  const canJoin = onJoin && p.status === 'open' && !p.is_member && p.free > 0
  return (
    <article className="card tap" onClick={open} data-testid="project-card">
      <div className="pcard">
        <div className="ptile">{p.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t">{p.title}</div>
          <div className="meta">
            {p.tags.map(tagLabel).join(' · ')}
            {' · '}
            {p.invite ? 'Poziv' : STATUS_LABEL[p.status]}
          </div>
          <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
            {p.invite && <span className="badge grad">✨ Trebaš nam</span>}
            {p.is_member && p.status === 'open' && <span className="badge green">Tvoj tim</span>}
            {p.status === 'pending' && <span className="badge amber">Čeka mentora</span>}
            {p.status === 'rejected' && <span className="badge grey">Nije odobreno</span>}
            {canJoin && (
              <button
                className="btn small soft"
                onClick={(e) => {
                  e.stopPropagation()
                  onJoin!(p)
                }}
              >
                Pridruži se
              </button>
            )}
          </div>
        </div>
        <span className="chev"><Icon name="chev" size={20} /></span>
      </div>
    </article>
  )
}
