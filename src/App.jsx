import { useState, useEffect } from 'react'
import ProductBuilder from './components/ProductBuilder'
import InventoryTracker from './components/InventoryTracker'
import PLDashboard from './components/PLDashboard'
import MaterialCosts from './components/MaterialCosts'
import TimeTracker from './components/TimeTracker'
import LoginScreen from './components/LoginScreen'
import PasswordReset from './components/PasswordReset'
import { supabase } from './supabase'

const TABS = ['Material Costs', 'Product Builder', 'Inventory', 'Time Tracker', 'P&L Dashboard']

export default function App() {
  const [activeTab, setActiveTab] = useState(0)
  const [session, setSession] = useState(undefined)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'USER_UPDATED') setRecovering(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <LoginScreen />
  if (recovering) return <PasswordReset />

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <img src="/logo.svg" alt="Bead Bar" className="app-logo" />
          <nav className="tab-nav">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                className={`tab-btn${activeTab === i ? ' active' : ''}`}
                onClick={() => setActiveTab(i)}
              >
                {tab}
              </button>
            ))}
          </nav>
          <button
            className="btn btn-secondary btn-sm header-signout"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="main">
        {activeTab === 0 && <MaterialCosts />}
        {activeTab === 1 && <ProductBuilder />}
        {activeTab === 2 && <InventoryTracker />}
        {activeTab === 3 && <TimeTracker />}
        {activeTab === 4 && <PLDashboard />}
      </main>
    </div>
  )
}
