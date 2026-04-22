import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

export default function PLDashboard() {
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [selProduct, setSelProduct] = useState('')
  const [units, setUnits] = useState('')
  const [logging, setLogging] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: sls }, { data: prods }, { data: mats }] = await Promise.all([
      supabase.from('sales').select('*').order('sold_at', { ascending: false }),
      supabase.from('products').select('*').order('name'),
      supabase.from('materials').select('*'),
    ])
    setSales(sls || [])
    setProducts(prods || [])
    setMaterials(mats || [])
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

  const selectedProduct = products.find(p => p.name === selProduct)
  const previewCost = selectedProduct ? productCost(selectedProduct) : 0
  const previewProfit = selectedProduct ? selectedProduct.price - previewCost : 0
  const unitsNum = parseInt(units) || 0

  async function logSale() {
    if (!selProduct || !units || !selectedProduct) return
    setLogging(true)
    const cost_per_unit = productCost(selectedProduct)
    const price_per_unit = selectedProduct.price
    const profit_per_unit = price_per_unit - cost_per_unit
    await supabase.from('sales').insert({
      product_name: selProduct,
      units: parseInt(units),
      price_per_unit,
      cost_per_unit,
      profit_per_unit,
      sold_at: new Date().toISOString(),
    })
    await load()
    setSelProduct('')
    setUnits('')
    setLogging(false)
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

  return (
    <div>
      {/* Log Sale */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h2 className="section-title">Log a Sale</h2>
        </div>
        <div className="sale-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Product</label>
            <select value={selProduct} onChange={e => setSelProduct(e.target.value)}>
              <option value="">Select product…</option>
              {products.map(p => (
                <option key={p.id} value={p.name}>{p.name} — ${p.price.toFixed(2)}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Units</label>
            <input
              type="number"
              min="1"
              value={units}
              onChange={e => setUnits(e.target.value)}
              placeholder="1"
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={logSale}
            disabled={!selProduct || !units || logging}
            style={{ alignSelf: 'flex-end' }}
          >
            {logging ? 'Logging…' : 'Log Sale'}
          </button>
        </div>

        {selectedProduct && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#78716c', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>Cost/unit: <strong>${previewCost.toFixed(2)}</strong></span>
            <span>Profit/unit: <strong style={{ color: '#16a34a' }}>${previewProfit.toFixed(2)}</strong></span>
            {unitsNum > 0 && (
              <span>Total profit: <strong style={{ color: '#16a34a' }}>${(previewProfit * unitsNum).toFixed(2)}</strong></span>
            )}
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

      {/* Breakdown by product */}
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
                            <div
                              className="margin-bar-fill"
                              style={{ width: `${Math.min(100, Math.max(0, marg))}%` }}
                            />
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
          <div className="empty-state">No sales logged yet. Log your first sale above.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Units</th>
                  <th>Price / Unit</th>
                  <th>Cost / Unit</th>
                  <th>Profit / Unit</th>
                  <th>Total Profit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id}>
                    <td style={{ color: '#78716c', whiteSpace: 'nowrap' }}>
                      {new Date(s.sold_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>
                    <td style={{ fontWeight: 500 }}>{s.product_name}</td>
                    <td>{s.units}</td>
                    <td>${Number(s.price_per_unit).toFixed(2)}</td>
                    <td>${Number(s.cost_per_unit).toFixed(2)}</td>
                    <td style={{ color: '#16a34a' }}>${Number(s.profit_per_unit).toFixed(2)}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>
                      ${(Number(s.profit_per_unit) * s.units).toFixed(2)}
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteSale(s.id)}>
                        Delete
                      </button>
                    </td>
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
