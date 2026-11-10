import { useEffect } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { useApp } from './state'
import { Header } from './components/Header'
import { InviteOverlay } from './components/InviteOverlay'
import { Icon } from './components/Icon'
import { Login, Register, Welcome } from './screens/Auth'
import { Tags } from './screens/Tags'
import { Feed, MyGroups } from './screens/Feed'
import { NewProject } from './screens/NewProject'
import { Project } from './screens/Project'
import { Mentor } from './screens/Mentor'
import { Profile } from './screens/Profile'

function ResetWatcher() {
  const { ds, me, setMe, on, toast } = useApp()
  const nav = useNavigate()
  useEffect(
    () =>
      on(async (c) => {
        if (c !== 'reset' || !me) return
        const still = await ds.currentUser().catch(() => null)
        if (!still) {
          await ds.logout().catch(() => {})
          setMe(null)
          nav('/dobrodosli', { replace: true })
          toast('Demo je vraćen na početak.', '🔄')
        }
      }),
    [on, me, ds, setMe, nav, toast],
  )
  return null
}

function BottomNav() {
  const { me } = useApp()
  const staff = me?.role !== 'student'
  return (
    <nav className="nav" aria-label="Glavni meni">
      <NavLink to="/" end><Icon name="home" /> Škola</NavLink>
      {staff ? (
        <NavLink to="/mentor" data-testid="nav-mentor"><Icon name="shield" /> Mentor</NavLink>
      ) : (
        <NavLink to="/timovi" data-testid="nav-teams"><Icon name="users" /> Moji timovi</NavLink>
      )}
      <NavLink to="/profil"><Icon name="user" /> Profil</NavLink>
    </nav>
  )
}

function Shell() {
  const { me } = useApp()
  if (!me) {
    return (
      <Routes>
        <Route path="/dobrodosli" element={<Welcome />} />
        <Route path="/registracija" element={<Register />} />
        <Route path="/prijava" element={<Login />} />
        <Route path="*" element={<Navigate to="/dobrodosli" replace />} />
      </Routes>
    )
  }
  if (me.role === 'student' && !me.onboarded) {
    return (
      <>
        <Header />
        <Routes>
          <Route path="/oznake" element={<Tags />} />
          <Route path="*" element={<Navigate to="/oznake" replace />} />
        </Routes>
      </>
    )
  }
  return (
    <>
      <Header />
      <ResetWatcher />
      <InviteOverlay />
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/timovi" element={<MyGroups />} />
        <Route path="/novi" element={<NewProject />} />
        <Route path="/projekat/:id" element={<Project />} />
        <Route path="/oznake" element={<Tags />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/mentor" element={me.role === 'student' ? <Navigate to="/" replace /> : <Mentor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <Shell />
      </div>
    </HashRouter>
  )
}
