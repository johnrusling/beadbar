import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

const LOW_INCHES = 12 // remaining-length warning threshold
const today = () => new Date().toISOString().slice(0, 10)
const fmtLen = n => (n % 1 === 0 ? n : Number(n).toFixed(1))

const emptyChainForm = () => ({ editingId: null, name: '', vendor: '', metal: '', cost: '', cost_unit: 'inch', notes: '' })
const emptyPurchaseForm = chain_name => ({ chain_name, length: '', length_unit: 'inch', total_cost: '', purchased_at: today() })

export default function PermanentJewelry() {
  const [chains, setChains] = useState([])
  const [purchases, setPurchases] = useState([])
  const [types, setTypes] = useState([])
  const [sales, setSales] = useState([]) // permanent-jewelry sales only
  const [activeEvent, setActiveEvent] = useState(null)
  const [source, setSource] = useState('General')

  const [selectedChainId, setSelectedChainId] = useState('')
  const [pending, setPending] = useState([]) // [{ key, chainId, type, length, price, connector }]
  const [logging, setLogging] = useState(false)

  const [chainForm, setChainForm] = useState(null)
  const [purchaseForm, setPurchaseForm] = useState(null)
  const [typeForm, setTypeForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: ch }, { data: pu }, { data: ty }, { data: sl }, { data: ev }] = await Promise.all([
      supabase.from('chains').select('*').order('name'),
      supabase.from('chain_purchases').select('*'),
      supabase.from('pj_types').select('*').order('sort_order'),
      supabase.from('sales').select('*').eq('kind', 'pj').order('sold_at', { ascending: false }),
      supabase.from('events').select('*').is('closed_at', null).order('created_at', { ascending: false }).limit(1),
    ])
    setChains(ch || [])
    setPurchases(pu || [])
    setTypes(ty || [])
    setSales(sl || [])
    const e = ev?.[0] || null
    setActiveEvent(e)
    if (e) setSource(e.name)
    setSelectedChainId(prev => prev || (ch?.[0]?.id ?? ''))
  }

  const chainById = useMemo(() => Object.fromEntries(chains.map(c => [c.id, c])), [chains])
  const vendorOptions = useMemo(() => [...new Set(chains.map(c => c.vendor).filter(Boolean))].sort(), [chains])

  // remaining inches per chain = acquired (purchases) − used (pj sales)
  const usage = useMemo(() => {
    const acquired = {}, used = {}
    purchases.forEach(p => { acquired[p.chain_name] = (acquired[p.chain_name] || 0) + Number(p.length_in) })
    sales.forEach(s => { if (s.chain_name) used[s.chain_name] = (used[s.chain_name] || 0) + Number(s.length_in || 0) })
    return { acquired, used }
  }, [purchases, sales])

  function chainStats(c) {
    const acquired = usage.acquired[c.name] || 0
    const used = usage.used[c.name] || 0
    const remaining = acquired - used
    const status = remaining <= 0 ? 'Critical' : remaining <= LOW_INCHES ? 'Low' : 'In Stock'
    return { acquired, used, remaining, status, value: Math.max(0, remaining) * Number(c.cost_per_inch) }
  }

  // ---- selling ----
  function addPiece(type) {
    if (!selectedChainId) return
    setPending(prev => [...prev, {
      key: Date.now() + Math.random(),
      chainId: selectedChainId,
      type: type.name,
      length: Number(type.default_length_in),
      price: Number(type.default_price),
      connector: Number(type.connector_cost),
    }])
  }
  const updatePiece = (key, field, val) => setPending(prev => prev.map(p => p.key === key ? { ...p, [field]: val } : p))
  const removePiece = key => setPending(prev => prev.filter(p => p.key !== key))

  function pieceCost(p) {
    const c = chainById[p.chainId]
    const cpi = c ? Number(c.cost_per_inch) : 0
    return Number(p.length || 0) * cpi + Number(p.connector || 0)
  }

  const pendingTotals = useMemo(() => {
    let revenue = 0, cost = 0
    pending.forEach(p => { revenue += Number(p.price || 0); cost += pieceCost(p) })
    return { revenue, cost, profit: revenue - cost, count: pending.length }
  }, [pending, chainById])

  async function logPending() {
    if (!pending.length) return
    setLogging(true)
    const now = new Date().toISOString()
    const inserts = pending.map(p => {
      const c = chainById[p.chainId]
      const cost = pieceCost(p)
      const price = Number(p.price || 0)
      return {
        product_name: `${p.type} · ${c ? c.name : '?'}`,
        units: 1,
        price_per_unit: price,
        cost_per_unit: cost,
        profit_per_unit: price - cost,
        sold_at: now,
        source: activeEvent ? activeEvent.name : source,
        event_id: activeEvent ? activeEvent.id : null,
        kind: 'pj',
        chain_name: c ? c.name : null,
        jewelry_type: p.type,
        length_in: Number(p.length || 0),
      }
    })
    await supabase.from('sales').insert(inserts)
    setPending([])
    await load()
    setLogging(false)
  }

  async function deleteSale(id) {
    if (!confirm('Delete this permanent jewelry sale?')) return
    await supabase.from('sales').delete().eq('id', id)
    await load()
  }

  // ---- chain CRUD ----
  async function saveChain() {
    if (!chainForm.name.trim() || !chainForm.cost) return
    setSaving(true)
    const costPerInch = chainForm.cost_unit === 'foot' ? parseFloat(chainForm.cost) / 12 : parseFloat(chainForm.cost)
    const payload = {
      name: chainForm.name.trim(),
      vendor: chainForm.vendor.trim() || null,
      metal: chainForm.metal.trim() || null,
      cost_per_inch: costPerInch,
      notes: chainForm.notes.trim() || null,
    }
    const res = chainForm.editingId
      ? await supabase.from('chains').update(payload).eq('id', chainForm.editingId)
      : await supabase.from('chains').insert(payload)
    setSaving(false)
    if (res.error) { alert(res.error.message); return }
    await load()
    setChainForm(null)
  }

  async function deleteChain(id) {
    if (!confirm('Delete this chain? (Blocked if it has logged purchases.)')) return
    const { error } = await supabase.from('chains').delete().eq('id', id)
    if (error) { alert('Could not delete — this chain has purchases or sales linked to it.'); return }
    await load()
    setChainForm(null)
  }

  // ---- purchase ----
  async function savePurchase() {
    if (!purchaseForm.chain_name || !purchaseForm.length || !purchaseForm.total_cost) return
    setSaving(true)
    const lengthIn = purchaseForm.length_unit === 'foot' ? parseFloat(purchaseForm.length) * 12 : parseFloat(purchaseForm.length)
    const { error } = await supabase.from('chain_purchases').insert({
      chain_name: purchaseForm.chain_name,
      length_in: lengthIn,
      total_cost: parseFloat(purchaseForm.total_cost),
      purchased_at: purchaseForm.purchased_at || null,
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    await load()
    setPurchaseForm(null)
  }

  // ---- type estimate editing ----
  async function saveType() {
    setSaving(true)
    await supabase.from('pj_types').update({
      default_length_in: parseFloat(typeForm.default_length_in) || 0,
      default_price: parseFloat(typeForm.default_price) || 0,
      connector_cost: parseFloat(typeForm.connector_cost) || 0,
    }).eq('id', typeForm.id)
    setSaving(false)
    await load()
    setTypeForm(null)
  }

  const totalStockValue = chains.reduce((s, c) => s + chainStats(c).value, 0)
  const lowCount = chains.filter(c => { const st = chainStats(c).status; return st === 'Low' }).length
  const critCount = chains.filter(c => chainStats(c).status === 'Critical').length
  const allTime = useMemo(() => {
    const revenue = sales.reduce((s, x) => s + Number(x.price_per_unit), 0)
    const profit = sales.reduce((s, x) => s + Number(x.profit_per_unit), 0)
    return { revenue, profit, count: sales.length }
  }, [sales])

  const set = (setter, field, value) => setter(f => ({ ...f, [field]: value }))

  return (
    <div style={{ paddingBottom: pending.length ? 88 : 0 }}>

      {/* Source / event */}
      <div className="card" style={{ marginBottom: 22 }}>
        {activeEvent ? (
          <div className="event-banner">
            <div>
              <div className="event-banner-label">Active Event</div>
              <div className="event-banner-name">{activeEvent.name}</div>
            </div>
            <span style={{ fontSize: 12, color: '#a8a29e' }}>Sales attach to this event</span>
          </div>
        ) : (
          <div className="source-bar">
            <span className="source-bar-label">Sales channel:</span>
            <div className="source-pills">
              {['General', 'Etsy'].map(s => (
                <button key={s} className={`source-pill${source === s ? ' active' : ''}`} onClick={() => setSource(s)}>{s}</button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: '#a8a29e', marginLeft: 'auto' }}>Start an event from the P&amp;L tab</span>
          </div>
        )}
      </div>

      {/* Sell */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Sell a Piece</h2>
          <span style={{ fontSize: 12, color: '#a8a29e' }}>Pick a chain, then tap a type</span>
        </div>

        {chains.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>No chains yet — add one under Chain Inventory below.</div>
        ) : (
          <>
            <div className="form-group" style={{ maxWidth: 360, marginBottom: 16 }}>
              <label>Chain</label>
              <select value={selectedChainId} onChange={e => setSelectedChainId(e.target.value)}>
                {chains.map(c => {
                  const { remaining } = chainStats(c)
                  return <option key={c.id} value={c.id}>{c.name} — ${Number(c.cost_per_inch).toFixed(3)}/in ({fmtLen(remaining)}″ left)</option>
                })}
              </select>
            </div>

            <div className="sale-grid">
              {types.map(t => (
                <div key={t.id} className="sale-tile" onClick={() => addPiece(t)}>
                  <div className="sale-tile-name">{t.name}</div>
                  <div className="sale-tile-price">${Number(t.default_price).toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: '#a8a29e' }}>~{fmtLen(t.default_length_in)}″</div>
                </div>
              ))}
            </div>

            {pending.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 18 }}>
                <table>
                  <thead>
                    <tr><th>Piece</th><th>Chain</th><th>Length (in)</th><th>Price</th><th>Cost</th><th>Profit</th><th></th></tr>
                  </thead>
                  <tbody>
                    {pending.map(p => {
                      const c = chainById[p.chainId]
                      const cost = pieceCost(p)
                      const profit = Number(p.price || 0) - cost
                      return (
                        <tr key={p.key}>
                          <td style={{ fontWeight: 500 }}>{p.type}</td>
                          <td style={{ color: '#78716c' }}>{c ? c.name : '—'}</td>
                          <td>
                            <input className="qty-input" type="number" min="0" step="0.25" value={p.length}
                              onChange={e => updatePiece(p.key, 'length', e.target.value)} />
                          </td>
                          <td>
                            <input className="qty-input" type="number" min="0" step="0.5" value={p.price}
                              onChange={e => updatePiece(p.key, 'price', e.target.value)} />
                          </td>
                          <td>${cost.toFixed(2)}</td>
                          <td style={{ color: profit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>${profit.toFixed(2)}</td>
                          <td><button className="sale-minus" style={{ position: 'static' }} onClick={() => removePiece(p.key)}>−</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Overview metrics */}
      <div className="metrics-row" style={{ marginBottom: 22 }}>
        <div className="metric-card">
          <div className="metric-label">Chain Stock Value</div>
          <div className="metric-value">${totalStockValue.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">PJ Revenue</div>
          <div className="metric-value">${allTime.revenue.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">PJ Profit</div>
          <div className="metric-value green">${allTime.profit.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Low / Critical</div>
          <div className={`metric-value${critCount > 0 ? ' red' : lowCount > 0 ? ' orange' : ''}`}>{lowCount + critCount}</div>
        </div>
      </div>

      {/* Chain inventory */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Chain Inventory</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" disabled={!chains.length} onClick={() => setPurchaseForm(emptyPurchaseForm(chains[0]?.name || ''))}>+ Log Purchase</button>
            <button className="btn btn-primary btn-sm" onClick={() => setChainForm(emptyChainForm())}>+ Add Chain</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Chain</th><th>Vendor</th><th>Metal</th><th>Cost / in</th>
                <th>Acquired</th><th>Used</th><th>Remaining</th><th>Value</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {chains.map(c => {
                const st = chainStats(c)
                return (
                  <tr key={c.id} className="row-tappable" onClick={() => setChainForm({
                    editingId: c.id, name: c.name, vendor: c.vendor || '', metal: c.metal || '',
                    cost: String(c.cost_per_inch), cost_unit: 'inch', notes: c.notes || '',
                  })}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td style={{ color: '#78716c' }}>{c.vendor || '—'}</td>
                    <td style={{ color: '#78716c' }}>{c.metal || '—'}</td>
                    <td>${Number(c.cost_per_inch).toFixed(3)}</td>
                    <td style={{ color: '#78716c' }}>{fmtLen(st.acquired)}″</td>
                    <td style={{ color: '#78716c' }}>{fmtLen(st.used)}″</td>
                    <td style={{ fontWeight: 600, color: st.remaining <= 0 ? '#dc2626' : '#1c1917' }}>{fmtLen(st.remaining)}″</td>
                    <td>${st.value.toFixed(2)}</td>
                    <td><span className={`badge ${st.status === 'In Stock' ? 'badge-green' : st.status === 'Low' ? 'badge-yellow' : 'badge-red'}`}>{st.status}</span></td>
                  </tr>
                )
              })}
              {chains.length === 0 && <tr><td colSpan={9} className="empty-state">No chains yet. Add one to get started.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Type estimates */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Type Estimates</h2>
          <span style={{ fontSize: 12, color: '#a8a29e' }}>Click to edit defaults</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Type</th><th>Est. Length</th><th>Default Price</th><th>Connector Cost</th></tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr key={t.id} className="row-tappable" onClick={() => setTypeForm({
                  id: t.id, name: t.name,
                  default_length_in: String(t.default_length_in), default_price: String(t.default_price), connector_cost: String(t.connector_cost),
                })}>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td>{fmtLen(t.default_length_in)}″</td>
                  <td>${Number(t.default_price).toFixed(2)}</td>
                  <td style={{ color: '#78716c' }}>${Number(t.connector_cost).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent PJ sales */}
      <div className="card">
        <h2 className="section-title" style={{ marginBottom: 16 }}>Recent Permanent Jewelry Sales</h2>
        {sales.length === 0 ? (
          <div className="empty-state">No permanent jewelry sales yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Source</th><th>Piece</th><th>Length</th><th>Price</th><th>Profit</th></tr>
              </thead>
              <tbody>
                {sales.slice(0, 15).map(s => (
                  <tr key={s.id} className="row-tappable" onClick={() => deleteSale(s.id)}>
                    <td style={{ color: '#78716c', whiteSpace: 'nowrap' }}>{new Date(s.sold_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td><span className="source-tag">{s.source || 'General'}</span></td>
                    <td style={{ fontWeight: 500 }}>{s.product_name}</td>
                    <td>{s.length_in != null ? `${fmtLen(s.length_in)}″` : '—'}</td>
                    <td>${Number(s.price_per_unit).toFixed(2)}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>${Number(s.profit_per_unit).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky log bar */}
      {pending.length > 0 && (
        <div className="sale-log-bar">
          <div style={{ fontSize: 13, color: '#fff' }}>
            <strong>{pendingTotals.count} piece{pendingTotals.count !== 1 ? 's' : ''}</strong>
            <span style={{ opacity: 0.75, marginLeft: 8 }}>· ${pendingTotals.revenue.toFixed(2)}</span>
            <span style={{ opacity: 0.6, marginLeft: 8 }}>· profit ${pendingTotals.profit.toFixed(2)}</span>
          </div>
          <button className="btn sale-log-btn" onClick={logPending} disabled={logging}>{logging ? 'Saving…' : 'Log Sales'}</button>
        </div>
      )}

      {/* Add / edit chain modal */}
      {chainForm && (
        <div className="form-overlay" onClick={e => { if (e.target === e.currentTarget) setChainForm(null) }}>
          <div className="form-card">
            <div className="form-title">{chainForm.editingId ? 'Edit Chain' : 'Add Chain'}</div>
            <div className="form-group">
              <label>Chain Name *</label>
              <input value={chainForm.name} onChange={e => set(setChainForm, 'name', e.target.value)} placeholder="e.g. 14k GF Cable 1.2mm" disabled={!!chainForm.editingId} />
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Vendor</label>
                <input list="pj-vendor-options" value={chainForm.vendor} onChange={e => set(setChainForm, 'vendor', e.target.value)} placeholder="Select or type new" />
                <datalist id="pj-vendor-options">
                  {vendorOptions.map(v => <option key={v} value={v} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>Metal</label>
                <input value={chainForm.metal} onChange={e => set(setChainForm, 'metal', e.target.value)} placeholder="e.g. 14k Gold Filled" />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Cost *</label>
                <input type="number" min="0" step="0.0001" value={chainForm.cost} onChange={e => set(setChainForm, 'cost', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Per</label>
                <select value={chainForm.cost_unit} onChange={e => set(setChainForm, 'cost_unit', e.target.value)}>
                  <option value="inch">inch</option>
                  <option value="foot">foot</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input value={chainForm.notes} onChange={e => set(setChainForm, 'notes', e.target.value)} placeholder="Optional" />
            </div>
            <div className="form-actions">
              {chainForm.editingId && <button className="btn btn-danger" onClick={() => deleteChain(chainForm.editingId)}>Delete</button>}
              <button className="btn btn-secondary" onClick={() => setChainForm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving || !chainForm.name.trim() || !chainForm.cost} onClick={saveChain}>
                {saving ? 'Saving…' : chainForm.editingId ? 'Save Changes' : 'Add Chain'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log purchase modal */}
      {purchaseForm && (
        <div className="form-overlay" onClick={e => { if (e.target === e.currentTarget) setPurchaseForm(null) }}>
          <div className="form-card">
            <div className="form-title">Log Chain Purchase</div>
            <div className="form-group">
              <label>Chain *</label>
              <select value={purchaseForm.chain_name} onChange={e => set(setPurchaseForm, 'chain_name', e.target.value)}>
                {chains.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Length *</label>
                <input type="number" min="0" step="0.5" value={purchaseForm.length} onChange={e => set(setPurchaseForm, 'length', e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Unit</label>
                <select value={purchaseForm.length_unit} onChange={e => set(setPurchaseForm, 'length_unit', e.target.value)}>
                  <option value="inch">inches</option>
                  <option value="foot">feet</option>
                </select>
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Total Cost ($) *</label>
                <input type="number" min="0" step="0.01" value={purchaseForm.total_cost} onChange={e => set(setPurchaseForm, 'total_cost', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={purchaseForm.purchased_at} onChange={e => set(setPurchaseForm, 'purchased_at', e.target.value)} />
              </div>
            </div>
            {purchaseForm.length && purchaseForm.total_cost && (
              <div style={{ fontSize: 12, color: '#78716c', marginTop: -4, marginBottom: 8 }}>
                = ${(parseFloat(purchaseForm.total_cost) / ((purchaseForm.length_unit === 'foot' ? parseFloat(purchaseForm.length) * 12 : parseFloat(purchaseForm.length)) || 1)).toFixed(4)} / inch
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setPurchaseForm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving || !purchaseForm.chain_name || !purchaseForm.length || !purchaseForm.total_cost} onClick={savePurchase}>
                {saving ? 'Saving…' : 'Log Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit type modal */}
      {typeForm && (
        <div className="form-overlay" onClick={e => { if (e.target === e.currentTarget) setTypeForm(null) }}>
          <div className="form-card">
            <div className="form-title">Edit {typeForm.name}</div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Est. Length (in)</label>
                <input type="number" min="0" step="0.25" value={typeForm.default_length_in} onChange={e => set(setTypeForm, 'default_length_in', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Default Price ($)</label>
                <input type="number" min="0" step="0.5" value={typeForm.default_price} onChange={e => set(setTypeForm, 'default_price', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Connector Cost ($)</label>
              <input type="number" min="0" step="0.01" value={typeForm.connector_cost} onChange={e => set(setTypeForm, 'connector_cost', e.target.value)} />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setTypeForm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={saveType}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
