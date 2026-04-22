import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({ product: '', minutes: '', date: today(), notes: '' })

export default function TimeTracker() {
  const [entries, setEntries] = useState([])
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(emptyForm())
  const [logging, setLogging] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: ents }, { data: prods }] = await Promise.all([
      supabase.from('time_entries').select('*').order('worked_at', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('products').select('name').order('name'),
    ])
    setEntries(ents || [])
    setProducts(prods || [])
  }

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function logEntry() {
    if (!form.product || !form.minutes) return
    setLogging(true)
    await supabase.from('time_entries').insert({
      product_name: form.product,
      time_minutes: parseInt(form.minutes),
      notes: form.notes.trim() || null,
      worked_at: form.date,
    })
    await load()
    setForm(f => ({ ...emptyForm(), product: f.product, date: f.date }))
    setLogging(false)
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this time entry?')) return
    await supabase.from('time_entries').delete().eq('id', id)
    await load()
  }

  const totalMinutes = useMemo(() => entries.reduce((s, e) => s + e.time_minutes, 0), [entries])

  const byProduct = useMemo(() => {
    const map = {}
    entries.forEach(e => {
      if (!map[e.product_name]) map[e.product_name] = { name: e.product_name, minutes: 0, sessions: 0 }
      map[e.product_name].minutes += e.time_minutes
      map[e.product_name].sessions += 1
    })
    return Object.values(map).sort((a, b) => b.minutes - a.minutes)
  }, [entries])

  const topProduct = byProduct[0]

  function fmtTime(mins) {
    if (mins < 60) return `${mins}m`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m ? `${h}h ${m}m` : `${h}h`
  }

  return (
    <div>
      {/* Log Entry */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Log Time</h2>
        </div>
        <div className="time-log-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Product</label>
            <select value={form.product} onChange={e => set('product', e.target.value)}>
              <option value="">Select product…</option>
              {products.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Minutes</label>
            <input
              type="number"
              min="1"
              value={form.minutes}
              onChange={e => set('minutes', e.target.value)}
              placeholder="e.g. 45"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 2 }}>
            <label>Notes</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
          </div>
          <button
            className="btn btn-primary"
            onClick={logEntry}
            disabled={!form.product || !form.minutes || logging}
            style={{ alignSelf: 'flex-end' }}
          >
            {logging ? 'Saving…' : 'Log'}
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="metrics-row" style={{ marginBottom: 22 }}>
        <div className="metric-card">
          <div className="metric-label">Total Time</div>
          <div className="metric-value">{fmtTime(totalMinutes)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Sessions</div>
          <div className="metric-value">{entries.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Most Time On</div>
          <div className="metric-value" style={{ fontSize: 15 }}>{topProduct ? topProduct.name : '—'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg Session</div>
          <div className="metric-value">{entries.length ? fmtTime(Math.round(totalMinutes / entries.length)) : '—'}</div>
        </div>
      </div>

      {/* By Product */}
      {byProduct.length > 0 && (
        <div className="card" style={{ marginBottom: 22 }}>
          <h2 className="section-title" style={{ marginBottom: 16 }}>By Product</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Sessions</th>
                  <th>Total Time</th>
                  <th>Avg / Session</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map(row => (
                  <tr key={row.name}>
                    <td style={{ fontWeight: 500 }}>{row.name}</td>
                    <td>{row.sessions}</td>
                    <td>{fmtTime(row.minutes)}</td>
                    <td style={{ color: '#78716c' }}>{fmtTime(Math.round(row.minutes / row.sessions))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log */}
      <div className="card">
        <h2 className="section-title" style={{ marginBottom: 16 }}>Time Log</h2>
        {entries.length === 0 ? (
          <div className="empty-state">No time logged yet. Log your first session above.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Time</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="row-tappable" onClick={() => deleteEntry(e.id)}>
                    <td style={{ color: '#78716c', whiteSpace: 'nowrap' }}>
                      {new Date(e.worked_at + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style={{ fontWeight: 500 }}>{e.product_name}</td>
                    <td>{fmtTime(e.time_minutes)}</td>
                    <td style={{ color: '#78716c' }}>{e.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
