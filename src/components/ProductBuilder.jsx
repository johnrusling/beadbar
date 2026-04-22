import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../supabase'

const MAX_MATS = 8
const emptyRow = () => ({ mat: '', qty: '' })
const emptyForm = () => ({ name: '', materials: [emptyRow()], packaging_cost: '', price: '', notes: '', photo_url: '' })

export default function ProductBuilder() {
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

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
      photo_url: p.photo_url || '',
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

  async function uploadPhoto(file) {
    setUploading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('product-photos').upload(path, file)
    if (error) { alert('Photo upload failed: ' + error.message); setUploading(false); return }
    const { data } = supabase.storage.from('product-photos').getPublicUrl(path)
    setField('photo_url', data.publicUrl)
    setUploading(false)
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
      photo_url: form.photo_url || null,
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

  async function exportEtsy() {
    const [{ data: inv }, { data: sls }] = await Promise.all([
      supabase.from('inventory').select('*'),
      supabase.from('sales').select('*'),
    ])

    const usedMap = {}
    ;(sls || []).forEach(sale => {
      const prod = products.find(p => p.name === sale.product_name)
      if (!prod) return
      ;(prod.materials || []).forEach(m => {
        usedMap[m.mat] = (usedMap[m.mat] || 0) + m.qty * sale.units
      })
    })

    const remainingMap = {}
    ;(inv || []).forEach(i => {
      remainingMap[i.material_name] = Math.max(0, (Number(i.starting_qty) || 0) - (usedMap[i.material_name] || 0))
    })

    const rows = products.map(p => {
      const mats = (p.materials || []).filter(m => m.mat && m.qty)
      let canMake = mats.length ? 999 : 0
      mats.forEach(m => {
        const possible = Math.floor((remainingMap[m.mat] ?? 0) / m.qty)
        canMake = Math.min(canMake, possible)
      })

      const matNames = mats.map(m => m.mat).slice(0, 13).join(',')
      const desc = [
        'Handmade beaded jewelry.',
        mats.length ? `\nMaterials: ${mats.map(m => `${m.mat} ×${m.qty}`).join(', ')}.` : '',
        p.notes ? `\n\n${p.notes}` : '',
      ].join('')

      return {
        TITLE: p.name,
        DESCRIPTION: desc,
        PRICE: Number(p.price).toFixed(2),
        QUANTITY: Math.max(0, canMake),
        SKU: '',
        TAGS: 'handmade jewelry,beaded jewelry,handmade,jewelry,beads,BLB jewelry',
        MATERIALS: matNames,
        WHO_MADE: 'i_did',
        IS_SUPPLY: 'false',
        WHEN_MADE: 'made_to_order',
        TYPE: 'physical',
        SHOULD_AUTO_RENEW: 'true',
        SHOP_SECTION_TITLE: '',
        IMAGE1: p.photo_url || '',
      }
    })

    const headers = Object.keys(rows[0])
    const csv = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `beadbar-etsy-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Products ({products.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {products.length > 0 && (
            <button className="btn btn-secondary" onClick={exportEtsy}>Export for Etsy</button>
          )}
          <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
        </div>
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
                className="product-card"
                onClick={() => openEdit(p)}
              >
                {p.photo_url && (
                  <img src={p.photo_url} alt={p.name} className="product-photo" />
                )}

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

            <div className="form-group">
              <label>Product Photo</label>
              <div className="photo-upload-row">
                {form.photo_url && (
                  <img src={form.photo_url} alt="Product" className="photo-preview" />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileRef.current.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading…' : form.photo_url ? 'Change Photo' : 'Add Photo'}
                  </button>
                  {form.photo_url && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setField('photo_url', '')}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files[0]) uploadPhoto(e.target.files[0]) }}
                />
              </div>
            </div>

            <div className="form-actions">
              {editingId && (
                <button className="btn btn-danger" onClick={() => { del(editingId); closeForm() }}>Delete</button>
              )}
              <button className="btn btn-secondary" onClick={closeForm}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={saving || uploading || !form.name.trim() || !form.price}
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
