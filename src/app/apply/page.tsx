"use client"
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = createClient('https://ckouxkqwkhaubamepsnb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrb3V4a3F3a2hhdWJhbWVwc25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjY2MzAsImV4cCI6MjEwMDIwMjYzMH0.3OQSyb0TX4wsuDsRK-C1-8ycJKUnBcD0fmTEy4pK7wQ')

export default function ApplyPage() {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', city: '', education: '', father_name: '', gender: 'male', referred_by: '', reason: '' })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name || !form.phone) { alert('Name and Phone required!'); return }
    setLoading(true)
    await sb.from('admissions').insert({ ...form, status: 'pending', applied_at: new Date().toISOString() })
    setSubmitted(true)
    setLoading(false)
  }

  const inp = (label: string, key: string, type = 'text', required = false, placeholder = '') => (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#FFD700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
        {label} {required && <span style={{ color: '#EF4444' }}>*</span>}
      </label>
      <input type={type} required={required} placeholder={placeholder}
        value={(form as Record<string,string>)[key] || ''}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '14px 18px', background: 'rgba(255,255,255,.04)', border: '1.5px solid rgba(255,215,0,.1)', borderRadius: 13, color: '#E5E7EB', fontSize: 14, fontFamily: "'Inter',sans-serif", outline: 'none', transition: 'border-color .3s' }}
        onFocus={e => e.target.style.borderColor = 'rgba(255,215,0,.35)'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,215,0,.1)'}
      />
    </div>
  )

  if (submitted) return (
    <div style={{ minHeight: '100vh', background: '#060608', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif", padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 500, animation: 'fadeIn .5s ease' }}>
        <div style={{ fontSize: 80, marginBottom: 20 }}>🎉</div>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 800, color: '#FFD700', marginBottom: 12 }}>Application Submitted!</h1>
        <p style={{ fontSize: 16, color: '#9CA3AF', lineHeight: 1.8, marginBottom: 30 }}>
          Shukriya {form.full_name}! Aapki application receive ho gayi hai. Hum jald aapse contact karenge.
        </p>
        <a href="/" style={{ display: 'inline-block', padding: '14px 32px', background: 'linear-gradient(135deg,#FFD700,#FFA500)', color: '#000', fontWeight: 700, borderRadius: 12, textDecoration: 'none', fontSize: 14 }}>← Back to Portal</a>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#060608,#0a0a10)', fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 560, background: 'rgba(12,12,14,.85)', border: '1px solid rgba(255,215,0,.08)', borderRadius: 28, padding: 'clamp(28px,5vw,48px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#FFD700,#FFA500)' }} />
        
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 900, letterSpacing: 6, marginBottom: 4 }}>
            <span style={{ color: '#fff' }}>AEM</span><span style={{ color: '#FFD700' }}>T</span><span style={{ color: '#fff' }}>ECH</span>
          </div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,.4)', fontWeight: 700 }}>INSTITUTE</div>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(22px,4vw,28px)', fontWeight: 800, color: '#E5E7EB', marginTop: 20 }}>Apply for Admission</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>Fill the form below to apply</p>
        </div>

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '0 16px' }}>
            {inp('Full Name', 'full_name', 'text', true, 'Your full name')}
            {inp('Phone', 'phone', 'tel', true, '03001234567')}
            {inp('Email', 'email', 'email', false, 'your@email.com')}
            {inp('City', 'city', 'text', false, 'Lahore')}
            {inp('Father Name', 'father_name', 'text', false, 'Father name')}
            {inp('Education', 'education', 'text', false, 'Intermediate')}
          </div>
          
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#FFD700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Gender</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['male', 'female'].map(g => (
                <button type="button" key={g} onClick={() => setForm({ ...form, gender: g })}
                  style={{ flex: 1, padding: '12px 20px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13, border: 'none', transition: 'all .3s', fontFamily: "'Inter',sans-serif",
                    background: form.gender === g ? 'rgba(255,215,0,.1)' : 'rgba(255,255,255,.03)',
                    color: form.gender === g ? '#FFD700' : '#6B7280',
                    borderWidth: 1, borderStyle: 'solid',
                    borderColor: form.gender === g ? 'rgba(255,215,0,.2)' : 'rgba(255,255,255,.05)',
                  }}>{g === 'male' ? '👨 Male' : '👩 Female'}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#FFD700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>How did you hear about us?</label>
            <select value={form.referred_by} onChange={e => setForm({ ...form, referred_by: e.target.value })}
              style={{ width: '100%', padding: '14px 18px', background: 'rgba(255,255,255,.04)', border: '1.5px solid rgba(255,215,0,.1)', borderRadius: 13, color: '#E5E7EB', fontSize: 14, fontFamily: "'Inter',sans-serif", outline: 'none' }}>
              <option value="">Select</option>
              {['Social Media', 'Friend/Family', 'Website', 'WhatsApp', 'Google', 'YouTube', 'Walk-in', 'Other'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#FFD700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Why do you want to join?</label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Tell us about yourself..."
              style={{ width: '100%', padding: '14px 18px', background: 'rgba(255,255,255,.04)', border: '1.5px solid rgba(255,215,0,.1)', borderRadius: 13, color: '#E5E7EB', fontSize: 14, fontFamily: "'Inter',sans-serif", outline: 'none', resize: 'vertical', minHeight: 90 }} />
          </div>

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '16px 32px', background: 'linear-gradient(135deg,#FFD700,#FFA500)', color: '#000', fontWeight: 800, fontSize: 16, border: 'none', borderRadius: 14, cursor: loading ? 'wait' : 'pointer', fontFamily: "'Inter',sans-serif", letterSpacing: .5, opacity: loading ? .7 : 1, transition: 'all .3s' }}>
            {loading ? '⏳ Submitting...' : '🚀 Submit Application'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#1A1A1A' }}>© 2025 AEMTECH Institute — Design the Future</div>
      </div>
    </div>
  )
}
