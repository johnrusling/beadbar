import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

const today = () => new Date().toISOString().slice(0, 10)
const emptyEventForm = () => ({ name: '', location: '', event_date: today() })

export default function PLDashboard() {
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [activeEvent, setActiveEvent] = useState(null)
  const [source, setSource] = useState('General')
  const [pending, setPending] = useState({})
  const [logging, setLogging] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventForm, setEventForm] = useState(emptyEventForm())
  const [savingEvent, setSavingEvent] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: sls }, { data: prods }, { data: mats }, { data: evts }] = await Promise.all([
      supabase.from('sales').select('*').order('sold_at', { ascending: false }),
      supabase.from('products').select('*').order('name'),
      supabase.from('materials').select('*'),
      supabase.from('events').select('*').is('closed_at', null).order('created_at', { ascending: false }).limit(1),
    ])
    setSales(sls || [])
    setProducts(prods || [])
    setMaterials(mats || [])
    const evt = evts?.[0] || null
    setActiveEvent(evt)
    if (evt) setSource(evt.name)
  }

  const matMap = useMemo(() => {
    const m = {}
    ;(materials || []).forEach(mat => { m[mat.name] = mat })
    return m
  }, [materials])

  function productCost(p) {
    return (p.materials || []).reduce((sum, r) => {
      const m = matMap[r.mat]
      return sum + (m ? m.cost * r.qty : 0)
    }, 0) + (p.packaging_cost || 0)
  }

  function tap(p) {
    setPending(prev => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
  }

  function decrement(e, p) {
    e.stopPropagation()
    setPending(prev => {
      const next = { ...prev }
      if ((next[p.id] || 0) <= 1) delete next[p.id]
      else next[p.id]--
      return next
    })
  }

  const totalPendingUnits = Object.values(pending).reduce((s, n) => s + n, 0)
  const totalPendingRevenue = useMemo(() => {
    return Object.entries(pending).reduce((s, [id, count]) => {
      const p = products.find(p => p.id === id)
      return s + (p ? Number(p.price) * count : 0)
    }, 0)
  }, [pending, products])

  async function logPending() {
    if (!totalPendingUnits) return
    setLogging(true)
    const inserts = []
    for (const [id, units] of Object.entries(pending)) {
      if (!units) continue
      const p = products.find(p => p.id === id)
      if (!p) continue
      const cost_per_unit = productCost(p)
      inserts.push({
        product_name: p.name,
        units,
        price_per_unit: Number(p.price),
        cost_per_unit,
        profit_per_unit: Number(p.price) - cost_per_unit,
        sold_at: new Date().toISOString(),
        source: activeEvent ? activeEvent.name : source,
        event_id: activeEvent ? activeEvent.id : null,
      })
    }
    await supabase.from('sales').insert(inserts)
    setPending({})
    await load()
    setLogging(false)
  }

  async function createEvent() {
    if (!eventForm.name.trim()) return
    setSavingEvent(true)
    const { data } = await supabase.from('events').insert({
      name: eventForm.name.trim(),
      location: eventForm.location.trim() || null,
      event_date: eventForm.event_date || null,
    }).select().single()
    setActiveEvent(data)
    setSource(data.name)
    setShowEventForm(false)
    setEventForm(emptyEventForm())
    setSavingEvent(false)
  }

  async function closeEvent() {
    if (!activeEvent) return
    if (!confirm(`Close event "${activeEvent.name}"?`)) return
    await supabase.from('events').update({ closed_at: new Date().toISOString() }).eq('id', activeEvent.id)
    setActiveEvent(null)
    setSource('General')
  }

  async function deleteSale(id) {
    if (!confirm('Delete this sale entry?')) return
    await supabase.from('sales').delete().eq('id', id)
    await load()
  }

  const metrics = useMemo(() => {
    const revenue = sales.reduce((s, x) => s + x.price_per_unit * x.units, 0)
    const cost = sales.reduce((s, x) => s + x.cost_per_unit * x.units, 0)
    const profit = sales.reduce((s, x) => s + x.profit_per_unit * x.units, 0)
    const unitsSold = sales.reduce((s, x) => s + x.units, 0)
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
    return { revenue, cost, profit, unitsSold, margin }
  }, [sales])

  const breakdown = useMemo(() => {
    const map = {}
    sales.forEach(x => {
      if (!map[x.product_name]) {
        map[x.product_name] = { name: x.product_name, units: 0, revenue: 0, cost: 0, profit: 0 }
      }
      map[x.product_name].units += x.units
      map[x.product_name].revenue += x.price_per_unit * x.units
      map[x.product_name].cost += x.cost_per_unit * x.units
      map[x.product_name].profit += x.profit_per_unit * x.units
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [sales])

  const bySource = useMemo(() => {
    const map = {}
    sales.forEach(x => {
      const s = x.source || 'General'
      if (!map[s]) map[s] = { source: s, units: 0, revenue: 0, profit: 0 }
      map[s].units += x.units
      map[s].revenue += x.price_per_unit * x.units
      map[s].profit += x.profit_per_unit * x.units
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [sales])

  return (
    <div style={{ paddingBottom: totalPendingUnits ? 88 : 0 }}>

      {/* Source / Event selector */}
      <div className="card" style={{ marginBottom: 22 }}>
        {activeEvent ? (
          <div className="event-banner">
            <div>
              <div className="event-banner-label">Active Event</div>
              <div className="event-banner-name">{activeEvent.name}</div>
              {(activeEvent.location || activeEvent.event_date) && (
                <div className="event-banner-meta">
                  {activeEvent.event_date && new Date(activeEvent.event_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {activeEvent.location && activeEvent.event_date && ' · '}
                  {activeEvent.location}
                </div>
              )}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={closeEvent}>Close Event</button>
          </div>
        ) : (
          <div className="source-bar">
            <span className="source-bar-label">Sales channel:</span>
            <div className="source-pills">
              <button
                className={`source-pill${source === 'General' ? ' active' : ''}`}
                onClick={() => setSource('General')}
              >
                General
              </button>
              <button
                className={`source-pill${source === 'Etsy' ? ' active' : ''}`}
                onClick={() => setSource('Etsy')}
              >
                Etsy
              </button>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowEventForm(true)}>+ New Event</button>
          </div>
        )}
      </div>

      {/* Sale Grid */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Log a Sale</h2>
          <span style={{ fontSize: 12, color: '#a8a29e' }}>Tap to add · − to remove</span>
        </div>
        {products.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>No products yet — add some in Product Builder.</div>
        ) : (
          <div className="sale-grid">
            {products.map(p => {
              const count = pending[p.id] || 0
              return (
                <div key={p.id} className={`sale-tile${count > 0 ? ' sale-tile-active' : ''}`} onClick={() => tap(p)}>
                  {p.photo_url
                    ? <img src={p.photo_url} alt={p.name} className="sale-tile-img" />
                    : <div className="sale-tile-name">{p.name}</div>
                  }
                  <div className="sale-tile-price">${Number(p.price).toFixed(2)}</div>
                  {count > 0 && (
                    <>
                      <div className="sale-badge">{count}</div>
                      <button className="sale-minus" onClick={e => decrement(e, p)}>−</button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary Metrics */}
      <div className="metrics-row" style={{ marginBottom: 22 }}>
        <div className="metric-card">
          <div className="metric-label">Revenue</div>
          <div className="metric-value">${metrics.revenue.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Cost</div>
          <div className="metric-value">${metrics.cost.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Profit</div>
          <div className="metric-value green">${metrics.profit.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Units Sold</div>
          <div className="metric-value">{metrics.unitsSold}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg Margin</div>
          <div className="metric-value green">{metrics.margin.toFixed(1)}%</div>
        </div>
      </div>

      {/* By Source */}
      {bySource.length > 0 && (
        <div className="card" style={{ marginBottom: 22 }}>
          <h2 className="section-title" style={{ marginBottom: 16 }}>By Source</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Units</th>
                  <th>Revenue</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {bySource.map(row => (
                  <tr key={row.source}>
                    <td style={{ fontWeight: 500 }}>{row.source}</td>
                    <td>{row.units}</td>
                    <td>${row.revenue.toFixed(2)}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>${row.profit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By Product */}
      {breakdown.length > 0 && (
        <div className="card" style={{ marginBottom: 22 }}>
          <h2 className="section-title" style={{ marginBottom: 16 }}>By Product</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Units</th>
                  <th>Revenue</th>
                  <th>Cost</th>
                  <th>Profit</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map(row => {
                  const marg = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0
                  return (
                    <tr key={row.name}>
                      <td style={{ fontWeight: 500 }}>{row.name}</td>
                      <td>{row.units}</td>
                      <td>${row.revenue.toFixed(2)}</td>
                      <td>${row.cost.toFixed(2)}</td>
                      <td style={{ color: '#16a34a', fontWeight: 600 }}>${row.profit.toFixed(2)}</td>
                      <td>
                        <div className="margin-bar-wrap">
                          <div className="margin-bar">
                            <div className="margin-bar-fill" style={{ width: `${Math.min(100, Math.max(0, marg))}%` }} />
                          </div>
                          <span className="margin-pct">{marg.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sales Log */}
      <div className="card">
        <h2 className="section-title" style={{ marginBottom: 16 }}>Sales Log</h2>
        {sales.length === 0 ? (
          <div className="empty-state">No sales logged yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Product</th>
                  <th>Units</th>
                  <th>Price / Unit</th>
                  <th>Profit / Unit</th>
                  <th>Total Profit</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id} className="row-tappable" onClick={() => deleteSale(s.id)}>
                    <td style={{ color: '#78716c', whiteSpace: 'nowrap' }}>
                      {new Date(s.sold_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td>
                      <span className="source-tag">{s.source || 'General'}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{s.product_name}</td>
                    <td>{s.units}</td>
                    <td>${Number(s.price_per_unit).toFixed(2)}</td>
                    <td style={{ color: '#16a34a' }}>${Number(s.profit_per_unit).toFixed(2)}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>
                      ${(Number(s.profit_per_unit) * s.units).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky log bar */}
      {totalPendingUnits > 0 && (
        <div className="sale-log-bar">
          <div style={{ fontSize: 13, color: '#fff' }}>
            <strong>{totalPendingUnits} item{totalPendingUnits !== 1 ? 's' : ''}</strong>
            <span style={{ opacity: 0.75, marginLeft: 8 }}>· ${totalPendingRevenue.toFixed(2)}</span>
            {activeEvent && <span style={{ opacity: 0.6, marginLeft: 8 }}>· {activeEvent.name}</span>}
            {!activeEvent && <span style={{ opacity: 0.6, marginLeft: 8 }}>· {source}</span>}
          </div>
          <button className="btn sale-log-btn" onClick={logPending} disabled={logging}>
            {logging ? 'Saving…' : 'Log Sales'}
          </button>
        </div>
      )}

      {/* Create Event Modal */}
      {showEventForm && (
        <div className="form-overlay" onClick={e => { if (e.target === e.currentTarget) setShowEventForm(false) }}>
          <div className="form-card">
            <div className="form-title">New Event</div>
            <div className="form-group">
              <label>Event Name *</label>
              <input
                value={eventForm.name}
                onChange={e => setEventForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Summer Craft Fair"
                autoFocus
              />
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={eventForm.event_date}
                  onChange={e => setEventForm(f => ({ ...f, event_date: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input
                  value={eventForm.location}
                  onChange={e => setEventForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowEventForm(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!eventForm.name.trim() || savingEvent}
                onClick={createEvent}
              >
                {savingEvent ? 'Creating…' : 'Start Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
