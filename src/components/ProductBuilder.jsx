import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

const MAX_MATS = 8
const emptyRow = () => ({ mat: '', qty: '' })
const emptyForm = () => ({ name: '', materials: [emptyRow()], packaging_cost: '', price: '', notes: '' })

export default function ProductBuilder() {
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: prods }, { data: mats }] = await Promise.all([
      supabase.from('products').select('*').order('created_at'),
      supabase.from('materials').select('*').order('name'),
    ])
    setProducts(prods || [])
    setMaterials(mats || [])
  }

  const matMap = useMemo(() => {
    const m = {}
    materials.forEach(mat => { m[mat.name] = mat })
    return m
  }, [materials])

  function calcCosts(f) {
    const matCost = f.materials.reduce((sum, r) => {
      const m = matMap[r.mat]
      return sum + (m && r.qty ? m.cost * parseFloat(r.qty) : 0)
    }, 0)
    const pkg = parseFloat(f.packaging_cost) || 0
    const total = matCost + pkg
    const price = parseFloat(f.price) || 0
    const profit = price - total
    const margin = price > 0 ? (profit / price) * 100 : 0
    return { matCost, total, profit, margin }
  }

  const preview = useMemo(() => calcCosts(form), [form, matMap])

  function openAdd() { setForm(emptyForm()); setEditingId(null); setShowForm(true) }

  function openEdit(p) {
    setForm({
      name: p.name,
      materials: p.materials?.length
        ? p.materials.map(m => ({ mat: m.mat, qty: String(m.qty) }))
        : [emptyRow()],
      packaging_cost: p.packaging_cost ? String(p.packaging_cost) : '',
      price: String(p.price),
      notes: p.notes || '',
    })
    setEditingId(p.id)
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditingId(null) }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function updateRow(i, key, val) {
    setForm(f => {
      const rows = [...f.materials]
      rows[i] = { ...rows[i], [key]: val }
      return { ...f, materials: rows }
    })
  }

  function addRow() {
    if (form.materials.length < MAX_MATS)
      setForm(f => ({ ...f, materials: [...f.materials, emptyRow()] }))
  }

  function removeRow(i) {
    setForm(f => {
      const rows = f.materials.filter((_, idx) => idx !== i)
      return { ...f, materials: rows.length ? rows : [emptyRow()] }
    })
  }

  async function save() {
    if (!form.name.trim() || !form.price) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      materials: form.materials
        .filter(r => r.mat && r.qty)
        .map(r => ({ mat: r.mat, qty: parseFloat(r.qty) })),
      packaging_cost: parseFloat(form.packaging_cost) || 0,
      price: parseFloat(form.price),
      notes: form.notes.trim(),
    }
    if (editingId) {
      await supabase.from('products').update(payload).eq('id', editingId)
    } else {
      await supabase.from('products').insert(payload)
    }
    await load()
    setSaving(false)
    closeForm()
  }

  async function del(id) {
    if (!confirm('Delete this product?')) return
    await supabase.from('products').delete().eq('id', id)
    await load()
  }

  function productCost(p) {
    return (p.materials || []).reduce((sum, r) => {
      const m = matMap[r.mat]
      return sum + (m ? m.cost * r.qty : 0)
    }, 0) + (p.packaging_cost || 0)
  }

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Products ({products.length})</h2>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
      </div>

      {products.length === 0 ? (
        <div className="card empty-state">No products yet. Add your first product to get started.</div>
      ) : (
        <div className="product-grid">
          {products.map(p => {
            const cost = productCost(p)
            const prof = p.price - cost
            const marg = p.price > 0 ? (prof / p.price) * 100 : 0
            return (
              <div
                key={p.id}
                className={`product-card${selectedId === p.id ? ' selected' : ''}`}
                onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
              >
                <div className="product-card-info">
                  <div className="product-name">{p.name}</div>
                  <div className="product-sub">
                    {(p.materials || []).map(m => `${m.mat} ×${m.qty}`).join(' · ')}
                  </div>
                </div>

                <div className="product-card-margin">
                  <div style={{ fontSize: 11, color: '#a8a29e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                    Margin
                  </div>
                  <div className="margin-bar-wrap">
                    <div className="margin-bar">
                      <div
                        className="margin-bar-fill"
                        style={{ width: `${Math.min(100, Math.max(0, marg))}%` }}
                      />
                    </div>
                    <span className="margin-pct">{marg.toFixed(0)}%</span>
                  </div>
                </div>

                <div className="product-card-price">
                  <div style={{ fontSize: 11, color: '#a8a29e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Price</div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>${p.price.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>+${prof.toFixed(2)}</div>
                </div>

                {selectedId === p.id && (
                  <div className="product-card-actions">
                    <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); openEdit(p) }}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); del(p.id) }}>Delete</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="form-overlay" onClick={e => e.target === e.currentTarget && closeForm()}>
          <div className="form-card">
            <div className="form-title">{editingId ? 'Edit Product' : 'New Product'}</div>

            <div className="form-row-2">
              <div className="form-group">
                <label>Product Name *</label>
                <input
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="e.g. Mixed Metal A"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Selling Price *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={e => setField('price', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="form-group" style={{ maxWidth: 180 }}>
              <label>Packaging Cost</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.packaging_cost}
                onChange={e => setField('packaging_cost', e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>Materials (up to {MAX_MATS})</label>
              {form.materials.map((row, i) => (
                <div key={i} className="mat-row">
                  <select
                    value={row.mat}
                    onChange={e => updateRow(i, 'mat', e.target.value)}
                  >
                    <option value="">Select material…</option>
                    {materials.map(m => (
                      <option key={m.id} value={m.name}>
                        {m.name} (${m.cost.toFixed(2)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Qty"
                    value={row.qty}
                    onChange={e => updateRow(i, 'qty', e.target.value)}
                  />
                  <button className="mat-remove" onClick={() => removeRow(i)} title="Remove">×</button>
                </div>
              ))}
              {form.materials.length < MAX_MATS && (
                <button className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginTop: 6 }}>
                  + Add material
                </button>
              )}
            </div>

            <div className="calc-box">
              <div>
                <div className="calc-label">Material Cost</div>
                <div className="calc-value">${preview.matCost.toFixed(2)}</div>
              </div>
              <div>
                <div className="calc-label">Total Cost</div>
                <div className="calc-value">${preview.total.toFixed(2)}</div>
              </div>
              <div>
                <div className="calc-label">Profit · Margin</div>
                <div
                  className="calc-value"
                  style={{ color: preview.profit >= 0 ? '#16a34a' : '#dc2626' }}
                >
                  ${preview.profit.toFixed(2)} · {preview.margin.toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Optional notes"
              />
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={closeForm}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={saving || !form.name.trim() || !form.price}
              >
                {saving ? 'Saving…' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
