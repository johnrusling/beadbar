import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

export default function InventoryTracker() {
  const [materials, setMaterials] = useState([])
  const [invMap, setInvMap] = useState({})   // material_name → {id, starting_qty}
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [saving, setSaving] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: mats }, { data: inv }, { data: prods }, { data: sls }] = await Promise.all([
      supabase.from('materials').select('*').order('name'),
      supabase.from('inventory').select('*'),
      supabase.from('products').select('*'),
      supabase.from('sales').select('*'),
    ])
    setMaterials(mats || [])
    const map = {}
    ;(inv || []).forEach(i => { map[i.material_name] = i })
    setInvMap(map)
    setProducts(prods || [])
    setSales(sls || [])
  }

  const usedMap = useMemo(() => {
    const prodMap = {}
    products.forEach(p => { prodMap[p.name] = p })
    const used = {}
    sales.forEach(sale => {
      const prod = prodMap[sale.product_name]
      if (!prod) return
      ;(prod.materials || []).forEach(m => {
        used[m.mat] = (used[m.mat] || 0) + m.qty * sale.units
      })
    })
    return used
  }, [sales, products])

  async function saveQty(materialName, rawValue) {
    setSaving(materialName)
    const qty = parseFloat(rawValue) || 0
    const existing = invMap[materialName]
    if (existing) {
      await supabase.from('inventory').update({ starting_qty: qty }).eq('id', existing.id)
    } else {
      await supabase.from('inventory').insert({ material_name: materialName, starting_qty: qty })
    }
    await load()
    setSaving(null)
  }

  const rows = useMemo(() => {
    return materials.map(mat => {
      const inv = invMap[mat.name]
      const startQty = inv ? Number(inv.starting_qty) : 0
      const usedQty = usedMap[mat.name] || 0
      const remaining = startQty - usedQty
      const status = remaining <= 0 ? 'Critical' : remaining <= 10 ? 'Low' : 'In Stock'
      return { ...mat, startQty, usedQty, remaining, status }
    })
  }, [materials, invMap, usedMap])

  const totalValue = rows.reduce((s, r) => s + Math.max(0, r.remaining) * r.cost, 0)
  const lowCount = rows.filter(r => r.status === 'Low').length
  const critCount = rows.filter(r => r.status === 'Critical').length

  const reorderRows = rows.filter(r => r.status === 'Low' || r.status === 'Critical')
  const reorderTotal = reorderRows.reduce((s, r) => {
    const suggest = Math.max(0, r.startQty - r.remaining)
    return s + suggest * r.cost
  }, 0)

  return (
    <div>
      {reorderRows.length > 0 && (
        <div className="card" style={{ marginBottom: 22, borderColor: '#fca5a5' }}>
          <div className="section-header" style={{ marginBottom: 14 }}>
            <h2 className="section-title" style={{ color: '#dc2626' }}>Reorder List</h2>
            <span style={{ fontSize: 12, color: '#a8a29e' }}>Est. order total: <strong style={{ color: '#1c1917' }}>${reorderTotal.toFixed(2)}</strong></span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Supplier</th>
                  <th>Remaining</th>
                  <th>Suggest Order</th>
                  <th>Est. Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reorderRows.map(r => {
                  const suggest = Math.max(0, r.startQty - r.remaining)
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td style={{ color: '#78716c' }}>{r.supplier || '—'}</td>
                      <td style={{ color: r.remaining <= 0 ? '#dc2626' : '#ca8a04', fontWeight: 600 }}>
                        {r.remaining % 1 === 0 ? r.remaining : r.remaining.toFixed(1)}
                      </td>
                      <td style={{ fontWeight: 600 }}>{suggest % 1 === 0 ? suggest : suggest.toFixed(1)}</td>
                      <td>${(suggest * r.cost).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${r.status === 'Critical' ? 'badge-red' : 'badge-yellow'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="metrics-row" style={{ marginBottom: 22 }}>
        <div className="metric-card">
          <div className="metric-label">Stock Value</div>
          <div className="metric-value">${totalValue.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Materials</div>
          <div className="metric-value">{materials.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Low Stock</div>
          <div className={`metric-value${lowCount > 0 ? ' orange' : ''}`}>{lowCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Critical</div>
          <div className={`metric-value${critCount > 0 ? ' red' : ''}`}>{critCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Materials</h2>
          <span style={{ fontSize: 12, color: '#a8a29e' }}>Click starting qty to edit</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Supplier</th>
                <th>Cost / ea</th>
                <th>Starting Qty</th>
                <th>Used</th>
                <th>Remaining</th>
                <th>Stock Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.name}</div>
                  </td>
                  <td style={{ color: '#78716c' }}>{row.supplier || '—'}</td>
                  <td>${row.cost.toFixed(2)}</td>
                  <td>
                    <InlineQty
                      value={row.startQty}
                      saving={saving === row.name}
                      onSave={v => saveQty(row.name, v)}
                    />
                  </td>
                  <td style={{ color: '#78716c' }}>{row.usedQty % 1 === 0 ? row.usedQty : row.usedQty.toFixed(1)}</td>
                  <td style={{ fontWeight: 600, color: row.remaining <= 0 ? '#dc2626' : '#1c1917' }}>
                    {row.remaining % 1 === 0 ? row.remaining : row.remaining.toFixed(1)}
                  </td>
                  <td>${(Math.max(0, row.remaining) * row.cost).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${
                      row.status === 'In Stock' ? 'badge-green'
                      : row.status === 'Low' ? 'badge-yellow'
                      : 'badge-red'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-state">No materials found. Run the schema SQL to seed materials.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function InlineQty({ value, saving, onSave }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(String(value))

  useEffect(() => {
    if (!editing) setLocal(String(value))
  }, [value, editing])

  function commit() {
    setEditing(false)
    const parsed = parseFloat(local)
    if (!isNaN(parsed) && parsed !== value) onSave(local)
  }

  if (saving) return <span className="qty-pill" style={{ color: '#a8a29e' }}>…</span>

  if (editing) {
    return (
      <input
        className="qty-input"
        type="number"
        min="0"
        step="1"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit() }}
        autoFocus
      />
    )
  }

  return (
    <span className="qty-pill" onClick={() => setEditing(true)} title="Click to edit">
      {value}
    </span>
  )
}
