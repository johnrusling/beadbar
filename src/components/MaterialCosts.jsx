import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const emptyForm = () => ({ name: '', type: '', size: '', cost: '', supplier: '', notes: '' })

export default function MaterialCosts() {
  const [materials, setMaterials] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('materials').select('*').order('name')
    setMaterials(data || [])
  }

  function openAdd() { setForm(emptyForm()); setEditingId(null); setShowForm(true) }

  function openEdit(m) {
    setForm({ name: m.name, type: m.type || '', size: m.size || '', cost: String(m.cost), supplier: m.supplier || '', notes: m.notes || '' })
    setEditingId(m.id)
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm()) }

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function save() {
    if (!form.name.trim() || !form.cost) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      type: form.type.trim() || null,
      size: form.size.trim() || null,
      cost: parseFloat(form.cost),
      supplier: form.supplier.trim() || null,
      notes: form.notes.trim() || null,
    }
    if (editingId) {
      await supabase.from('materials').update(payload).eq('id', editingId)
    } else {
      await supabase.from('materials').insert(payload)
    }
    await load()
    setSaving(false)
    closeForm()
  }

  async function deleteMaterial(m) {
    if (!window.confirm(`Delete "${m.name}"? This cannot be undone.`)) return
    setDeleting(m.id)
    await supabase.from('materials').delete().eq('id', m.id)
    await load()
    setDeleting(null)
  }

  const totalCost = materials.reduce((s, m) => s + Number(m.cost), 0)

  return (
    <div>
      <div className="metrics-row" style={{ marginBottom: 22 }}>
        <div className="metric-card">
          <div className="metric-label">Materials</div>
          <div className="metric-value">{materials.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg Cost / Unit</div>
          <div className="metric-value">{materials.length ? `$${(totalCost / materials.length).toFixed(2)}` : '—'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Most Expensive</div>
          <div className="metric-value">
            {materials.length ? `$${Math.max(...materials.map(m => Number(m.cost))).toFixed(2)}` : '—'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Material Costs</h2>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Material</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Material Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Cost / Unit</th>
                <th>Supplier</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {materials.map(m => (
                <tr
                  key={m.id}
                  className={`row-tappable${selectedId === m.id ? ' row-selected' : ''}`}
                  onClick={() => setSelectedId(selectedId === m.id ? null : m.id)}
                >
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td style={{ color: '#78716c' }}>{m.type || '—'}</td>
                  <td style={{ color: '#78716c' }}>{m.size || '—'}</td>
                  <td>${Number(m.cost).toFixed(2)}</td>
                  <td style={{ color: '#78716c' }}>{m.supplier || '—'}</td>
                  <td style={{ color: '#78716c', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.notes || '—'}</td>
                  <td style={{ minWidth: 120 }}>
                    {selectedId === m.id && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); openEdit(m) }}>Edit</button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={deleting === m.id}
                          onClick={e => { e.stopPropagation(); deleteMaterial(m) }}
                        >
                          {deleting === m.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {materials.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">No materials yet. Add one to get started.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="form-overlay" onClick={e => { if (e.target === e.currentTarget) closeForm() }}>
          <div className="form-card">
            <div className="form-title">{editingId ? 'Edit Material' : 'Add Material'}</div>

            <div className="form-group">
              <label>Material Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Gold Bead 2mm" disabled={!!editingId} />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label>Type</label>
                <input value={form.type} onChange={e => set('type', e.target.value)} placeholder="e.g. Bead, End Cap, Wire" />
              </div>
              <div className="form-group">
                <label>Size</label>
                <input value={form.size} onChange={e => set('size', e.target.value)} placeholder="e.g. 2mm, 24g" />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label>Cost per Unit ($) *</label>
                <input type="number" min="0" step="0.001" value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Supplier</label>
                <input value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="e.g. Gem Packed" />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. Gold-filled, Smooth no seams" />
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={closeForm}>Cancel</button>
              <button className="btn btn-primary" disabled={saving || !form.name.trim() || !form.cost} onClick={save}>
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Material'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
