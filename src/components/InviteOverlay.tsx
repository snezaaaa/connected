// Glavni trenutak demonstracije: poziv stiže uživo kao kartica sa animacijom.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state'
import type { ProjectItem } from '../data/types'
import { fmtDate, inviteReason, tagIcon } from '../i18n/me'

const seenKey = (uid: string) => `ce-seen-invites-${uid}`
function getSeen(uid: string): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(seenKey(uid)) || '[]')
  } catch {
    return []
  }
}
function addSeen(uid: string, id: string) {
  try {
    sessionStorage.setItem(seenKey(uid), JSON.stringify([...getSeen(uid), id]))
  } catch {
    /* ignore */
  }
}

export function InviteOverlay() {
  const { ds, me, on, toast, confetti } = useApp()
  const nav = useNavigate()
  const [inv, setInv] = useState<ProjectItem | null>(null)
  const [busy, setBusy] = useState(false)
  const showing = useRef<string | null>(null)

  const check = useCallback(async () => {
    if (!me || me.role !== 'student' || !me.onboarded || showing.current) return
    try {
      const list = await ds.getMyInvites()
      const seen = getSeen(me.id)
      const next = list.find((p) => p.invite && !seen.includes(p.invite.id))
      if (next && !showing.current) {
        showing.current = next.invite!.id
        setInv(next)
        try {
          navigator.vibrate?.([60, 40, 60])
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, [ds, me])

  useEffect(() => {
    void check()
    return on((c) => {
      if (c === 'invites') void check()
    })
  }, [check, on])

  if (!inv || !inv.invite || !me) return null
  const close = () => {
    addSeen(me.id, inv.invite!.id)
    showing.current = null
    setInv(null)
    setTimeout(() => void check(), 400)
  }
  const respond = async (accept: boolean) => {
    setBusy(true)
    try {
      const r = await ds.respondInvite(inv.invite!.id, accept)
      close()
      if (accept && (r === 'ok' || r === 'already')) {
        confetti()
        toast('Dobro došli u tim! 🎉', '💜')
        nav(`/projekat/${inv.id}`)
      } else if (accept && r === 'full') {
        toast('Tim se upravo popunio. Biće još prilika!', '💜')
      }
    } catch (e) {
      toast((e as Error).message, '⚠️')
      close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Novi poziv" data-testid="invite-card">
      <div className="invite">
        <span className="new-badge">NOVI POZIV</span>
        <div className="ptile big">{inv.icon}</div>
        <h1>Trebaš nam.</h1>
        <p className="lead">{inv.title}.</p>
        <span className="why">
          {tagIcon(inv.invite.reason_tag)} Zašto ti: {inviteReason(inv.invite.reason_tag, inv.invite.reason_kind)}
        </span>
        <div className="info-grid" style={{ marginTop: 14 }}>
          <div className="info"><div className="ic">🎯</div><b>Cilj</b><span>{inv.goal.length > 40 ? inv.goal.slice(0, 38) + '…' : inv.goal}</span></div>
          <div className="info"><div className="ic">📅</div><b>Rok</b><span>{fmtDate(inv.deadline)}</span></div>
          <div className="info"><div className="ic">👋</div><b>Tim</b><span>{inv.members.map((m) => m.nick).join(', ') || inv.leader_nick}</span></div>
        </div>
        <div className="actions">
          <button className="btn block" disabled={busy} onClick={() => respond(true)}>Pridružujem se</button>
          <button className="btn block ghost" disabled={busy} onClick={() => respond(false)}>Ne sada</button>
        </div>
      </div>
    </div>
  )
}
