import { useState } from 'react'
import ProductBuilder from './components/ProductBuilder'
import InventoryTracker from './components/InventoryTracker'
import PLDashboard from './components/PLDashboard'
import MaterialCosts from './components/MaterialCosts'

const TABS = ['Material Costs', 'Product Builder', 'Inventory', 'P&L Dashboard']

export default function App() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <img src="/logo.png" alt="Bead Bar" className="app-logo" />
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
        </div>
      </header>
      <main className="main">
        {activeTab === 0 && <MaterialCosts />}
        {activeTab === 1 && <ProductBuilder />}
        {activeTab === 2 && <InventoryTracker />}
        {activeTab === 3 && <PLDashboard />}
      </main>
    </div>
  )
}
