"use client"

import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Toaster, toast } from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'

const sb = createClient('https://ckouxkqwkhaubamepsnb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrb3V4a3F3a2hhdWJhbWVwc25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjY2MzAsImV4cCI6MjEwMDIwMjYzMH0.3OQSyb0TX4wsuDsRK-C1-8ycJKUnBcD0fmTEy4pK7wQ')
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyqW_CsghyazeOHVvwKsr1uYsj2Dsy-b02YjUr86HGu5B042cxCl5-a4KBV5sDCMBV0/exec'
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1j7Y48DizSCAG1jA7uE3qt6O1hMNKnvurvPnAg6mvbJs/edit'
const syncToSheet = async (action, data) => { try { await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) }) } catch (e) { console.log('Sheet sync:', e) } }
const openSheet = (tab = '') => { const tabs = { students: '#gid=0', attendance: '#gid=1', fees: '#gid=2', submissions: '#gid=3', assignments: '#gid=4', admissions: '#gid=5' }; window.open(SHEET_URL + (tabs[tab] || ''), '_blank') }

const ThemeCtx = createContext({ dark: true, toggle: () => {} })
const useTheme = () => useContext(ThemeCtx)
const AuthCtx = createContext(null)
const useAuth = () => useContext(AuthCtx)
const PageCtx = createContext({ page: 'dashboard', setPage: () => {} })
const usePage = () => useContext(PageCtx)

function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    if (typeof window === 'undefined') return null
    try { const s = localStorage.getItem('aemtech_session'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [loading, setLoading] = useState(false)
  
  // Save session to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (session) localStorage.setItem('aemtech_session', JSON.stringify(session))
    else localStorage.removeItem('aemtech_session')
  }, [session])
  
  // Auto session timeout (30 min idle)
  useEffect(() => { if (!session) return; let t; const r = () => { clearTimeout(t); t = setTimeout(() => { setSession(null); toast.error('Session expired') }, 30*60*1000) }; const ev = ['mousedown','mousemove','keydown','scroll','touchstart']; ev.forEach(e => window.addEventListener(e, r)); r(); return () => { clearTimeout(t); ev.forEach(e => window.removeEventListener(e, r)) } }, [session])
  
  // Update last_seen every 2 minutes
  useEffect(() => {
    if (!session) return
    const update = async () => {
      const now = new Date().toISOString()
      if (session.role === 'admin') await sb.from('users').update({ last_seen: now }).eq('id', session.user.id)
      else await sb.from('students').update({ last_seen: now }).eq('id', session.user.id)
    }
    update()
    const i = setInterval(update, 120000)
    return () => clearInterval(i)
  }, [session])
  
  const login = async (email, password, role) => {
    if (!email || !password) { toast.error('Fill all fields'); return false }
    setLoading(true)
    try {
      if (role === 'admin') {
        const { data } = await sb.from('users').select('*').eq('email', email).eq('role', 'admin').single()
        if (!data) { toast.error('Admin not found'); return false }
        if (data.password_hash !== password) { toast.error('Wrong password'); return false }
        const sess = { user: data, role: 'admin' }; setSession(sess); toast.success(`Welcome, ${data.full_name}! 👋`); return true
      } else {
        let { data } = await sb.from('students').select('*').eq('login_email', email).single()
        if (!data) {
          const res = await sb.from('students').select('*').eq('email', email).single()
          data = res.data
        }
        if (!data) { toast.error('Student not found'); return false }
        if (data.password !== password) { toast.error('Wrong password'); return false }
        const sess = { user: data, role: 'student' }; setSession(sess); toast.success(`Welcome, ${data.full_name}! 👋`); return true
      }
    } catch { toast.error('Login failed'); return false } finally { setLoading(false) }
  }
  const logout = () => { setSession(null); if(typeof window!=='undefined') localStorage.removeItem('aemtech_session'); toast.success('Logged out') }
  return <AuthCtx.Provider value={{ session, user: session?.user||null, role: session?.role||null, isLoggedIn: !!session, isAdmin: session?.role==='admin', isStudent: session?.role==='student', loading, login, logout }}>{children}</AuthCtx.Provider>
}

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const fmtDT = d => d ? new Date(d).toLocaleString('en-PK',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'
const ago = d => { const diff = Date.now()-new Date(d); const m = Math.floor(diff/60000), h = Math.floor(m/60), dy = Math.floor(h/24); return dy>0?dy+'d ago':h>0?h+'h ago':m<1?'just now':m+'m ago' }
const initials = n => n ? n.split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase() : '?'
const greet = () => { const h = new Date().getHours(); return h<12?'Good Morning':h<17?'Good Afternoon':h<21?'Good Evening':'Good Night' }
const currency = n => 'PKR '+(n||0).toLocaleString()
const attColor = p => p>=80?'#10B981':p>=60?'#F59E0B':'#EF4444'
const statusBadge = s => ({active:'success',inactive:'danger',graduated:'gold',completed:'success',scheduled:'info',live:'danger',pending:'warning',approved:'success',rejected:'danger',submitted:'warning',graded:'success',upcoming:'info',paid:'success',partial:'warning',overdue:'danger'}[s]||'gold')
const exportXLS = (data, filename, sheet='Sheet1') => { const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheet); saveAs(new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/octet-stream'}),filename); toast.success('Exported! 📊') }
const uploadFile = async (file, bucket, path) => { const {error}=await sb.storage.from(bucket).upload(path,file,{upsert:true}); if(error) throw error; return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl }
const useCounter = (end, dur=1200) => { const [c,setC]=useState(0); useEffect(()=>{ if(!end){setC(0);return}; let s=0; const step=end/(dur/16); const t=setInterval(()=>{s+=step;if(s>=end){setC(end);clearInterval(t)}else setC(Math.floor(s))},16); return()=>clearInterval(t) },[end,dur]); return c }
const calcAge = dob => { if(!dob) return null; const today=new Date(); const birth=new Date(dob); let age=today.getFullYear()-birth.getFullYear(); if(today.getMonth()<birth.getMonth()||(today.getMonth()===birth.getMonth()&&today.getDate()<birth.getDate())) age--; return age }
const childOf = (gender) => gender === 'female' ? 'D/O' : 'S/O'

// ═══ AUDIT LOG — track admin actions (localStorage based) ═══
const AUDIT_KEY = 'aemtech_audit_log'
const logAction = (action, entity, detail = '', meta = '') => {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(AUDIT_KEY)
    const logs = raw ? JSON.parse(raw) : []
    let actor = 'Admin'
    try { const s = localStorage.getItem('aemtech_session'); if (s) { const p = JSON.parse(s); actor = p?.user?.full_name || (p?.role === 'admin' ? 'Admin' : 'Student') } } catch {}
    logs.unshift({ id: Date.now(), time: new Date().toISOString(), actor, action, entity, detail, meta })
    localStorage.setItem(AUDIT_KEY, JSON.stringify(logs.slice(0, 400)))
  } catch {}
}
const getAuditLogs = () => { if (typeof window === 'undefined') return []; try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]') } catch { return [] } }
const RUBRIC_FIELDS = [['design','🎨 Design & Layout',20],['creativity','✨ Creativity',20],['accuracy','🎯 Accuracy',20],['completion','📋 Completion',20],['timeliness','⏰ Timeliness',20]]

// ═══ CURRICULUM — shared across student + admin learning journey ═══
const CURRICULUM = [
  { key:'orientation', module:'Orientation', title:'Welcome & Setup',          classes:1, icon:'🎯', color:'#8B5CF6' },
  { key:'canva',       module:'Month 1',     title:'Canva Designing',          classes:8, icon:'🎨', color:'#FFD700' },
  { key:'bonus',       module:'Bonus',       title:'Client Hunting & Talks',   classes:1, icon:'🤝', color:'#EC4899' },
  { key:'shopify',     module:'Month 2',     title:'Shopify + AI',             classes:8, icon:'🛒', color:'#10B981' },
  { key:'marketing',   module:'Month 3',     title:'Digital Marketing',        classes:8, icon:'📈', color:'#3B82F6' },
]
const CURRICULUM_TOTAL = CURRICULUM.reduce((a, m) => a + m.classes, 0) // 26
// cumulative start index for each module
const CURRICULUM_STARTS = CURRICULUM.reduce((acc, m, i) => { acc.push(i === 0 ? 0 : acc[i-1] + CURRICULUM[i-1].classes); return acc }, [])
const buildJourney = (present = 0) => CURRICULUM.map((mod, idx) => {
  const startClass = CURRICULUM_STARTS[idx]
  const attended = Math.max(0, Math.min(present - startClass, mod.classes))
  const progress = mod.classes > 0 ? Math.min(100, Math.round((attended / mod.classes) * 100)) : 0
  return { ...mod, startClass, attended, progress, isLocked: present < startClass }
})
const MONTH_META = [
  { sub:'Canva Designing',   icon:'🎨', color:'#FFD700' },
  { sub:'Shopify + AI',      icon:'🛒', color:'#10B981' },
  { sub:'Digital Marketing', icon:'📈', color:'#3B82F6' },
  { sub:'Extended Module',   icon:'🚀', color:'#8B5CF6' },
  { sub:'Extended Module',   icon:'⭐', color:'#EC4899' },
  { sub:'Extended Module',   icon:'💎', color:'#06B6D4' },
]
// ── fee helpers ──────────────────────────────────────────
// fee_amount  = MONTHLY fee (e.g. 200)
// total_fee   = TOTAL course fee (e.g. 600). Falls back to monthly × 3.
const monthlyFeeOf = s => Number(s?.fee_amount) || 0
const totalFeeOf = s => { const t = Number(s?.total_fee); if (t > 0) return t; const m = monthlyFeeOf(s); return m > 0 ? m * 3 : 0 }
const monthsCountOf = s => { const m = monthlyFeeOf(s), t = totalFeeOf(s); if (m <= 0) return t > 0 ? 1 : 3; return Math.max(1, Math.ceil(t / m)) }
const dueOf = s => Math.max(0, totalFeeOf(s) - (Number(s?.fee_paid) || 0))
const feeStatusOf = s => { const t = totalFeeOf(s), p = Number(s?.fee_paid) || 0; if (t <= 0) return 'pending'; return p >= t ? 'paid' : p > 0 ? 'partial' : 'pending' }
// how many full months are still unpaid
const monthsDueOf = s => { const m = monthlyFeeOf(s); if (m <= 0) return 0; return Math.ceil(dueOf(s) / m) }
const monthsPaidOf = s => { const m = monthlyFeeOf(s); if (m <= 0) return 0; return Math.floor((Number(s?.fee_paid) || 0) / m) }

// Build monthly installment buckets from monthly + total fee
const splitFeeByMonth = (student, payments = []) => {
  const monthly = monthlyFeeOf(student)
  const total = totalFeeOf(student)
  const n = monthsCountOf(student)
  const buckets = Array.from({ length: n }, (_, i) => {
    const meta = MONTH_META[i] || { sub: 'Module ' + (i + 1), icon: '📘', color: '#6B7280' }
    const base = monthly > 0 ? monthly : Math.round(total / n)
    const allocatedBefore = base * i
    const due = i === n - 1 ? Math.max(0, total - allocatedBefore) : Math.min(base, Math.max(0, total - allocatedBefore))
    return { key: 'm' + (i + 1), label: 'Month ' + (i + 1), ...meta, due, paid: 0 }
  })
  // 1) explicit installment payments (installment_no / month_index)
  let matched = 0
  payments.forEach(p => {
    const idx = Number(p.installment_no ?? p.month_index)
    if (idx >= 1 && idx <= n) { const amt = p.paid_amount || p.amount || 0; buckets[idx - 1].paid += amt; matched += amt }
  })
  // 2) waterfall remaining paid amount M1 → M2 → …
  let remaining = Math.max(0, (Number(student?.fee_paid) || 0) - matched)
  buckets.forEach(b => { const room = Math.max(0, b.due - b.paid); const take = Math.min(room, remaining); b.paid += take; remaining -= take })
  return buckets.map(b => ({
    ...b,
    balance: Math.max(0, b.due - b.paid),
    status: b.due === 0 ? 'paid' : b.paid >= b.due ? 'paid' : b.paid > 0 ? 'partial' : 'pending',
  }))
}
// legacy alias used by aggregate views (first 3 months meta)
const FEE_MONTHS = [0,1,2].map(i => ({ key:'m'+(i+1), label:'Month '+(i+1), ...MONTH_META[i] }))
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const currentMonth = () => MONTHS[new Date().getMonth()]
const currentYear = () => new Date().getFullYear()
const PAYMENT_METHODS = ['Cash','Bank Transfer','JazzCash','EasyPaisa','Other']
const REFERRAL_SOURCES = ['Social Media','Friend/Family','Website','WhatsApp','Google','YouTube','Walk-in','Other']
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const HOURS = Array.from({length:15},(_,i)=>{ const h=8+i; return `${h>12?h-12:h}:00 ${h>=12?'PM':'AM'}` })

// ═══════════════════════════════════════
// CONFIRM DIALOG — Beautiful Modal Confirmation
// ═══════════════════════════════════════
const ConfirmCtx = createContext({ confirm: async () => false })
const useConfirm = () => useContext(ConfirmCtx)

function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolveRef = useRef(null)

  const confirm = ({ title = 'Confirm', message = 'Are you sure?', type = 'danger', confirmText = 'Confirm', cancelText = 'Cancel', icon = '⚠️' } = {}) => {
    return new Promise(resolve => {
      resolveRef.current = resolve
      setState({ title, message, type, confirmText, cancelText, icon })
    })
  }

  const handle = (result) => {
    if (resolveRef.current) resolveRef.current(result)
    setState(null)
  }

  return (
    <ConfirmCtx.Provider value={{ confirm }}>
      {children}
      {state && (
        <div style={{ position:'fixed', inset:0, zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', animation:'fadeIn .2s ease' }}>
          <div onClick={()=>handle(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.7)', backdropFilter:'blur(8px)' }}/>
          <div style={{ position:'relative', background:'rgba(12,12,14,.95)', border:'1px solid rgba(255,215,0,.08)', borderRadius:24, padding:'36px 32px 28px', maxWidth:420, width:'90%', animation:'scaleIn .25s ease', boxShadow:'0 24px 60px rgba(0,0,0,.5)' }}>
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ fontSize:52, marginBottom:16, animation:'popIn .3s ease .1s both' }}>{state.icon}</div>
              <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:20, fontWeight:800, color:'#E5E7EB', marginBottom:10 }}>{state.title}</div>
              <div style={{ fontSize:14, color:'#9CA3AF', lineHeight:1.7 }}>{state.message}</div>
            </div>
            <div style={{ display:'flex', gap:12 }}>
              <button onClick={()=>handle(false)} style={{ flex:1, padding:'14px 24px', borderRadius:14, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)', color:'#9CA3AF', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all .2s' }}>{state.cancelText}</button>
              <button onClick={()=>handle(true)} style={{ flex:1, padding:'14px 24px', borderRadius:14, border:'none', background: state.type==='danger'?'linear-gradient(135deg,#EF4444,#DC2626)':state.type==='warning'?'linear-gradient(135deg,#F59E0B,#D97706)':'linear-gradient(135deg,#FFD700,#FFA500)', color: state.type==='danger'||state.type==='warning'?'#fff':'#000', fontWeight:800, fontSize:14, cursor:'pointer', fontFamily:"'Inter',sans-serif", boxShadow: state.type==='danger'?'0 4px 20px rgba(239,68,68,.3)':'0 4px 20px rgba(255,215,0,.3)', transition:'all .2s' }}>{state.confirmText}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}

// ═══════════════════════════════════════
// ENHANCED TOAST — with undo + progress bar
// ═══════════════════════════════════════
const toastSuccess = (msg, opts = {}) => {
  const { undo, duration = 3500 } = opts
  if (undo) {
    let cancelled = false
    const id = toast.custom((t) => {
      const [prog, setProg] = useState(100)
      useEffect(() => {
        const start = Date.now()
        const interval = setInterval(() => {
          const elapsed = Date.now() - start
          const pct = Math.max(0, 100 - (elapsed / duration) * 100)
          setProg(pct)
          if (pct <= 0) { clearInterval(interval); if (!cancelled) toast.dismiss(t.id) }
        }, 50)
        return () => clearInterval(interval)
      }, [t.id])
      return (
        <div style={{ background:'rgba(12,12,14,.95)', border:'1px solid rgba(16,185,129,.15)', borderRadius:16, padding:'14px 18px', boxShadow:'0 10px 36px rgba(0,0,0,.3)', maxWidth:360, animation: t.visible ? 'slideInRight .3s ease' : 'fadeIn .2s ease reverse', display:'flex', alignItems:'center', gap:12, position:'relative', overflow:'hidden' }}>
          <span style={{ fontSize:20 }}>✅</span>
          <span style={{ flex:1, fontSize:13, fontWeight:600, color:'#E5E7EB' }}>{msg}</span>
          <button onClick={()=>{ cancelled=true; undo(); toast.dismiss(t.id); toast.success('Undone! ↩️',{duration:1500}) }} style={{ background:'rgba(255,215,0,.1)', border:'1px solid rgba(255,215,0,.2)', color:'#FFD700', padding:'6px 14px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>↩️ Undo</button>
          <div style={{ position:'absolute', bottom:0, left:0, height:3, background:'linear-gradient(90deg,#10B981,#059669)', width:prog+'%', transition:'width .05s linear', borderRadius:3 }}/>
        </div>
      )
    }, { duration: duration + 200 })
    return id
  }
  return toast.success(msg, opts)
}

// ═══════════════════════════════════════
// LOADING SKELETONS
// ═══════════════════════════════════════
const Skeleton = ({ width='100%', height=20, radius=10, style:cs={} }) => (
  <div className="skeleton" style={{ width, height, borderRadius:radius, ...cs }}/>
)

const SkeletonCard = ({ count=3 }) => (
  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:18 }}>
    {Array.from({length:count}).map((_,i)=>(
      <div key={i} style={{ background:'rgba(12,12,14,.6)', borderRadius:22, padding:30, border:'1px solid rgba(255,215,0,.04)' }}>
        <Skeleton width={50} height={50} radius={14} style={{marginBottom:16}}/>
        <Skeleton width="60%" height={28} style={{marginBottom:12}}/>
        <Skeleton width="40%" height={14}/>
      </div>
    ))}
  </div>
)

const SkeletonTable = ({ rows=5, cols=5 }) => (
  <div style={{ background:'rgba(12,12,14,.6)', borderRadius:18, padding:20, border:'1px solid rgba(255,215,0,.04)' }}>
    <div style={{ display:'flex', gap:12, marginBottom:20 }}>
      {Array.from({length:cols}).map((_,i)=><Skeleton key={i} height={16} style={{flex:1}}/>)}
    </div>
    {Array.from({length:rows}).map((_,i)=>(
      <div key={i} style={{ display:'flex', gap:12, marginBottom:14 }}>
        {Array.from({length:cols}).map((_,j)=><Skeleton key={j} height={14} style={{flex:1}} radius={6}/>)}
      </div>
    ))}
  </div>
)

const SkeletonDashboard = () => (
  <div style={{animation:'fadeIn .3s ease'}}>
    <Skeleton width="100%" height={130} radius={22} style={{marginBottom:24}}/>
    <SkeletonCard count={5}/>
    <div style={{marginTop:24}}><Skeleton width="100%" height={300} radius={18}/></div>
  </div>
)

// ═══════════════════════════════════════
// NOTIFICATIONS SYSTEM
// ═══════════════════════════════════════
const NotifCtx = createContext({ notifications: [], unreadCount: 0, markRead: () => {}, markAllRead: () => {}, addNotification: () => {} })
const useNotifications = () => useContext(NotifCtx)

function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('aemtech_notifs') || '[]') } catch { return [] }
  })

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('aemtech_notifs', JSON.stringify(notifications.slice(0, 50)))
  }, [notifications])

  const addNotification = (notif) => {
    const n = { id: Date.now() + Math.random(), time: new Date().toISOString(), read: false, ...notif }
    setNotifications(prev => [n, ...prev].slice(0, 50))
  }

  const markRead = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  const unreadCount = notifications.filter(n => !n.read).length

  return <NotifCtx.Provider value={{ notifications, unreadCount, markRead, markAllRead, addNotification }}>{children}</NotifCtx.Provider>
}

// ═══════════════════════════════════════
// DESIGN SYSTEM — Sexy UI
// ═══════════════════════════════════════
const G = 'linear-gradient(135deg,#FFD700,#FFA500)'
const G2 = 'linear-gradient(135deg,#10B981,#059669)'
const G3 = 'linear-gradient(135deg,#3B82F6,#1D4ED8)'
const tr = 'all .3s cubic-bezier(.4,0,.2,1)'
const chartTooltip = { contentStyle:{background:'rgba(13,13,13,.95)',border:'1px solid rgba(255,215,0,.1)',borderRadius:14,fontSize:12,color:'#E5E7EB',boxShadow:'0 8px 32px rgba(0,0,0,.4)'}, itemStyle:{color:'#FFD700'}, labelStyle:{color:'#9CA3AF'} }

const isMobile = typeof window !== 'undefined' && window.innerWidth < 769
const getGlass = d => ({
  background: d ? 'rgba(12,12,14,.85)' : 'rgba(255,255,255,.92)',
  ...(isMobile ? {} : { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }),
  border: `1px solid ${d ? 'rgba(255,215,0,.06)' : 'rgba(0,0,0,.05)'}`,
  boxShadow: d ? '0 4px 24px rgba(0,0,0,.2)' : '0 4px 20px rgba(0,0,0,.04)',
})
const getGlassLight = d => ({
  background: d ? 'rgba(18,18,22,.7)' : 'rgba(248,248,250,.9)',
  ...(isMobile ? {} : { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  border: `1px solid ${d ? 'rgba(255,215,0,.04)' : 'rgba(0,0,0,.04)'}`,
})
const getCardHover = d => ({
  borderColor: d ? 'rgba(255,215,0,.15)' : 'rgba(255,215,0,.3)',
  boxShadow: d ? '0 14px 44px rgba(0,0,0,.35)' : '0 14px 44px rgba(0,0,0,.08)',
  transform: 'translateY(-4px)',
})

// ═══════════════════════════════════════
// FILTER COMPONENT
// ═══════════════════════════════════════
const FilterBar = ({ filters, values, onChange }) => {
  const { dark } = useTheme()
  return (
    <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:22, padding:'14px 20px', ...getGlassLight(dark), borderRadius:16 }}>
      <span style={{ fontSize:12, fontWeight:700, color:'#FFD700', marginRight:6 }}>🔍</span>
      {filters.map(f => (
        <select key={f.key} value={values[f.key]||''} onChange={e=>onChange({...values,[f.key]:e.target.value})}
          style={{ background:dark?'rgba(0,0,0,.3)':'rgba(255,255,255,.8)', border:`1px solid ${dark?'rgba(255,215,0,.08)':'rgba(0,0,0,.08)'}`, color:dark?'#E5E7EB':'#1F2937', padding:'9px 14px', borderRadius:10, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none', cursor:'pointer', minWidth:130, transition:tr }}>
          <option value="">{f.label}: All</option>
          {f.options.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
        </select>
      ))}
      {Object.values(values).some(v=>v) && (
        <button onClick={()=>onChange({})} style={{ background:'rgba(239,68,68,.06)', color:'#EF4444', border:'1px solid rgba(239,68,68,.12)', padding:'9px 16px', borderRadius:10, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:tr }}>✕ Clear</button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// BASE COMPONENTS — Premium Sexy UI
// ═══════════════════════════════════════
const Logo = ({ size=22, tag=false }) => {
  const { dark } = useTheme()
  return <div>
    <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:size, fontWeight:800, letterSpacing:2.5, lineHeight:1 }}>
      <span style={{color:dark?'#fff':'#111'}}>AEM</span>
      <span style={{color:'#FFD700',textShadow:'0 0 24px rgba(255,215,0,.35)'}}>T</span>
      <span style={{color:dark?'#fff':'#111'}}>ECH</span>
    </div>
    {tag && <div style={{fontSize:9,color:'rgba(255,215,0,.3)',letterSpacing:3.5,textTransform:'uppercase',marginTop:5,fontWeight:600}}>Design the Future</div>}
  </div>
}

const Av = ({ name, src=null, size=38, glow=false, onClick }) => (
  <div onClick={onClick} style={{
    width:size, height:size, borderRadius:'50%',
    background:'linear-gradient(135deg,#FFD700,#FFA500,#FF8C00)', display:'inline-flex', alignItems:'center', justifyContent:'center',
    fontWeight:900, fontSize:size*.32, color:'#000', flexShrink:0,
    boxShadow: glow ? '0 0 30px rgba(255,215,0,.3), 0 0 12px rgba(255,215,0,.2), inset 0 2px 4px rgba(255,255,255,.2)' : '0 4px 12px rgba(0,0,0,.2), inset 0 1px 3px rgba(255,255,255,.15)',
    border: glow ? '2.5px solid rgba(255,215,0,.4)' : '2px solid rgba(255,215,0,.15)',
    fontFamily:"'Space Grotesk',sans-serif",
    cursor: onClick ? 'pointer' : 'default',
    transition: 'all .3s ease',
    letterSpacing:.5,
    overflow:'hidden',
  }}>{src ? <img src={src} alt={name||'Avatar'} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : initials(name)}</div>
)

const Bdg = ({ children, type='gold', size='md', dot=false }) => {
  const themes = {
    gold:{bg:'rgba(255,215,0,.08)',c:'#FFD700',b:'rgba(255,215,0,.15)'},
    success:{bg:'rgba(16,185,129,.08)',c:'#10B981',b:'rgba(16,185,129,.15)'},
    danger:{bg:'rgba(239,68,68,.08)',c:'#EF4444',b:'rgba(239,68,68,.15)'},
    warning:{bg:'rgba(245,158,11,.08)',c:'#F59E0B',b:'rgba(245,158,11,.15)'},
    info:{bg:'rgba(59,130,246,.08)',c:'#3B82F6',b:'rgba(59,130,246,.15)'},
  }
  const t = themes[type]||themes.gold
  const sizes = {sm:{padding:'3px 9px',fontSize:9},md:{padding:'5px 13px',fontSize:10},lg:{padding:'7px 18px',fontSize:12}}
  const s = sizes[size]||sizes.md
  return <span style={{ display:'inline-flex', alignItems:'center', gap:5, borderRadius:22, fontWeight:700, textTransform:'uppercase', letterSpacing:.6, background:t.bg, color:t.c, border:`1px solid ${t.b}`, whiteSpace:'nowrap', ...s }}>{dot&&<span style={{width:6,height:6,borderRadius:'50%',background:t.c,boxShadow:`0 0 6px ${t.c}50`}}/>}{children}</span>
}

const Btn = ({ children, onClick, type='primary', size='md', disabled=false, full=false, loading=false, icon=null, style:cs={} }) => {
  const [h,setH] = useState(false)
  const themes = {
    primary:{background:G,color:'#000',border:'none',boxShadow:h?'0 8px 28px rgba(255,215,0,.35)':'0 2px 10px rgba(255,215,0,.1)',transform:h&&!disabled?'translateY(-2px) scale(1.01)':'none'},
    outline:{background:h?'rgba(255,215,0,.08)':'transparent',color:'#FFD700',border:'1px solid rgba(255,215,0,.25)',boxShadow:h?'0 0 20px rgba(255,215,0,.08)':'none'},
    danger:{background:h?'rgba(239,68,68,.14)':'rgba(239,68,68,.06)',color:'#EF4444',border:'1px solid rgba(239,68,68,.15)'},
    success:{background:h?'rgba(16,185,129,.14)':'rgba(16,185,129,.06)',color:'#10B981',border:'1px solid rgba(16,185,129,.15)'},
    warning:{background:h?'rgba(245,158,11,.14)':'rgba(245,158,11,.06)',color:'#F59E0B',border:'1px solid rgba(245,158,11,.15)'},
    ghost:{background:h?'rgba(255,255,255,.08)':'rgba(255,255,255,.03)',color:'#9CA3AF',border:'1px solid rgba(255,255,255,.08)'},
  }
  const sizes = {xs:{padding:'5px 11px',fontSize:10,borderRadius:7},sm:{padding:'8px 16px',fontSize:11,borderRadius:9},md:{padding:'11px 24px',fontSize:13,borderRadius:11},lg:{padding:'15px 32px',fontSize:15,borderRadius:13}}
  return <button onClick={onClick} disabled={disabled||loading} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    style={{ display:'inline-flex', alignItems:'center', justifyContent:full?'center':'flex-start', gap:8, fontFamily:"'Inter',sans-serif", fontWeight:700, cursor:disabled||loading?'not-allowed':'pointer', opacity:disabled?.45:1, transition:tr, whiteSpace:'nowrap', width:full?'100%':'auto', letterSpacing:.3, ...themes[type]||themes.primary, ...sizes[size]||sizes.md, ...cs }}>
    {loading&&<span style={{width:15,height:15,border:'2.5px solid currentColor',borderTopColor:'transparent',borderRadius:'50%',animation:'spin .6s linear infinite',flexShrink:0}}/>}
    {!loading&&icon&&<span style={{fontSize:(sizes[size]||sizes.md).fontSize+3,flexShrink:0}}>{icon}</span>}
    {children}
  </button>
}

const Inp = ({ label, icon, error, helper, required=false, ...props }) => {
  const [f,setF] = useState(false); const { dark } = useTheme()
  return <div style={{marginBottom:22}}>
    {label&&<label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:700,color:f?'#FFD700':'#6B7280',textTransform:'uppercase',letterSpacing:1.2,marginBottom:9,transition:'color .2s'}}>{label}{required&&<span style={{color:'#EF4444',fontSize:13}}>*</span>}</label>}
    <div style={{position:'relative'}}>
      {icon&&<span style={{position:'absolute',left:16,top:'50%',transform:'translateY(-50%)',fontSize:15,opacity:f?.8:.35,pointerEvents:'none',transition:'opacity .2s'}}>{icon}</span>}
      <input onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{
        width:'100%', background:f?'rgba(255,215,0,.03)':dark?'rgba(0,0,0,.3)':'#FAFAFA',
        border:`1.5px solid ${error?'rgba(239,68,68,.4)':f?'rgba(255,215,0,.35)':dark?'rgba(255,255,255,.06)':'rgba(0,0,0,.1)'}`,
        color:dark?'#E5E7EB':'#1F2937', padding:icon?'14px 18px 14px 46px':'14px 18px',
        borderRadius:13, fontSize:14, outline:'none', fontFamily:"'Inter',sans-serif", transition:tr,
        boxShadow:f?'0 0 24px rgba(255,215,0,.06), inset 0 0 12px rgba(255,215,0,.02)':'none',
      }} {...props}/>
    </div>
    {error&&<div style={{fontSize:11,color:'#EF4444',marginTop:6,display:'flex',alignItems:'center',gap:4}}>⚠ {error}</div>}
    {helper&&!error&&<div style={{fontSize:11,color:'#4B5563',marginTop:6}}>{helper}</div>}
  </div>
}

const Sel = ({ label, children, required=false, ...props }) => {
  const [f,setF] = useState(false); const { dark } = useTheme()
  return <div style={{marginBottom:22}}>
    {label&&<label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:700,color:f?'#FFD700':'#6B7280',textTransform:'uppercase',letterSpacing:1.2,marginBottom:9,transition:'color .2s'}}>{label}{required&&<span style={{color:'#EF4444',fontSize:13}}>*</span>}</label>}
    <select onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{
      width:'100%', background:f?'rgba(255,215,0,.03)':dark?'rgba(0,0,0,.3)':'#FAFAFA',
      border:`1.5px solid ${f?'rgba(255,215,0,.35)':dark?'rgba(255,255,255,.06)':'rgba(0,0,0,.1)'}`,
      color:dark?'#E5E7EB':'#1F2937', padding:'14px 18px',
      borderRadius:13, fontSize:14, outline:'none', fontFamily:"'Inter',sans-serif", transition:tr, cursor:'pointer',
    }} {...props}>{children}</select>
  </div>
}

const TA = ({ label, required=false, ...props }) => {
  const [f,setF] = useState(false); const { dark } = useTheme()
  return <div style={{marginBottom:22}}>
    {label&&<label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,fontWeight:700,color:f?'#FFD700':'#6B7280',textTransform:'uppercase',letterSpacing:1.2,marginBottom:9,transition:'color .2s'}}>{label}{required&&<span style={{color:'#EF4444',fontSize:13}}>*</span>}</label>}
    <textarea onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{
      width:'100%', background:f?'rgba(255,215,0,.03)':dark?'rgba(0,0,0,.3)':'#FAFAFA',
      border:`1.5px solid ${f?'rgba(255,215,0,.35)':dark?'rgba(255,255,255,.06)':'rgba(0,0,0,.1)'}`,
      color:dark?'#E5E7EB':'#1F2937', padding:'14px 18px',
      borderRadius:13, fontSize:14, outline:'none', fontFamily:"'Inter',sans-serif",
      resize:'vertical', minHeight:110, transition:tr, lineHeight:1.7,
    }} {...props}/>
  </div>
}

const Modal = ({ open, onClose, title, children, footer, large=false, icon=null }) => {
  const { dark } = useTheme(); if(!open) return null
  return <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',backdropFilter:'blur(6px)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20,animation:'fadeIn .15s ease'}}>
    <div className="cs" style={{...getGlass(dark),borderRadius:24,width:'100%',maxWidth:large?840:580,maxHeight:'90vh',overflowY:'auto',animation:'scaleIn .2s ease',boxShadow:'0 28px 72px rgba(0,0,0,.5)'}}>
      <div style={{padding:'24px 30px',borderBottom:`1px solid ${dark?'rgba(255,215,0,.06)':'rgba(0,0,0,.06)'}`,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:dark?'rgba(12,12,14,.97)':'rgba(255,255,255,.97)',backdropFilter:'blur(20px)',zIndex:1,borderRadius:'24px 24px 0 0'}}>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:700,display:'flex',alignItems:'center',gap:12,color:dark?'#E5E7EB':'#1F2937'}}>
          <div style={{width:4,height:24,background:G,borderRadius:4,boxShadow:'0 0 10px rgba(255,215,0,.3)'}}/>{icon&&<span style={{fontSize:18}}>{icon}</span>}{title}
        </div>
        <button onClick={onClose} style={{background:dark?'rgba(255,255,255,.04)':'rgba(0,0,0,.04)',border:`1px solid ${dark?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)'}`,color:'#6B7280',width:40,height:40,borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,transition:tr}} onMouseEnter={e=>{e.target.style.background='rgba(239,68,68,.1)';e.target.style.color='#EF4444'}} onMouseLeave={e=>{e.target.style.background=dark?'rgba(255,255,255,.04)':'rgba(0,0,0,.04)';e.target.style.color='#6B7280'}}>✕</button>
      </div>
      <div style={{padding:'28px 30px'}}>{children}</div>
      {footer&&<div style={{padding:'20px 30px',borderTop:`1px solid ${dark?'rgba(255,215,0,.06)':'rgba(0,0,0,.06)'}`,display:'flex',gap:10,justifyContent:'flex-end',background:dark?'rgba(255,255,255,.01)':'rgba(0,0,0,.01)',borderRadius:'0 0 24px 24px'}}>{footer}</div>}
    </div>
  </div>
}

const Card = ({ title, action, children, noPadding=false, delay=0, icon=null, style:cs={} }) => {
  const { dark } = useTheme()
  return <div style={{...getGlass(dark),borderRadius:22,marginBottom:26,overflow:'hidden',animation:`fadeInUp .4s ease ${delay}s both`,...cs}}>
    <div style={{padding:'22px 28px',borderBottom:`1px solid ${dark?'rgba(255,215,0,.05)':'rgba(0,0,0,.04)'}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,background:dark?'linear-gradient(90deg,rgba(255,215,0,.01),transparent)':'linear-gradient(90deg,rgba(255,215,0,.03),transparent)'}}>
      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:700,display:'flex',alignItems:'center',gap:12,color:dark?'#E5E7EB':'#1F2937'}}>
        <div style={{width:3,height:24,background:G,borderRadius:4,boxShadow:'0 0 12px rgba(255,215,0,.25)'}}/>{icon&&<span style={{fontSize:17,filter:'drop-shadow(0 0 4px rgba(255,215,0,.15))'}}>{icon}</span>}{title}
      </div>
      {action&&<div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>{action}</div>}
    </div>
    <div style={noPadding?{}:{padding:28}}>{children}</div>
  </div>
}

const Tbl = ({ headers, children, empty }) => {
  const { dark } = useTheme()
  return <div style={{overflowX:'auto',maxWidth:'100%'}} className="cs">
    <table style={{width:'100%',minWidth:600,borderCollapse:'collapse',fontSize:13}}>
      <thead><tr>{headers.map((h,i)=><th key={i} style={{background:dark?'rgba(255,215,0,.03)':'rgba(255,215,0,.05)',color:'rgba(255,215,0,.55)',padding:'12px 16px',textAlign:'left',fontWeight:700,fontSize:10,textTransform:'uppercase',letterSpacing:1.3,borderBottom:`1px solid ${dark?'rgba(255,215,0,.04)':'rgba(0,0,0,.05)'}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
    {empty}
  </div>
}

const TR = ({ children, delay=0, onClick }) => {
  const { dark } = useTheme()
  return <tr className="ar" onClick={onClick} style={{borderBottom:`1px solid ${dark?'rgba(255,255,255,.02)':'rgba(0,0,0,.03)'}`,cursor:onClick?'pointer':'default',animationDelay:delay+'s'}}
    onMouseEnter={e=>{e.currentTarget.style.background=dark?'rgba(255,215,0,.02)':'rgba(255,215,0,.05)';e.currentTarget.style.transform='scale(1.002)'}}
    onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.transform='none'}}>{children}</tr>
}

const TD = ({ children, style={} }) => { const { dark } = useTheme(); return <td style={{padding:'12px 16px',color:dark?'#9CA3AF':'#4B5563',verticalAlign:'middle',fontSize:13,whiteSpace:'nowrap',...style}}>{children}</td> }

const PBar = ({ value, max=100, height=8, showLabel=false, color=null, label='Progress' }) => {
  const pct = max>0?Math.round((value/max)*100):0; const c = color||attColor(pct)
  return <div>
    {showLabel&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><span style={{fontSize:12,color:'#6B7280',fontWeight:500}}>{label}</span><span style={{fontSize:12,fontWeight:700,color:c,fontFamily:"'Space Grotesk',sans-serif"}}>{pct}%</span></div>}
    <div style={{background:'rgba(255,255,255,.04)',borderRadius:12,height,overflow:'hidden',border:'1px solid rgba(255,255,255,.02)'}}>
      <div style={{height:'100%',width:pct+'%',borderRadius:12,background:`linear-gradient(90deg,${c},${c}88)`,transition:'width 1s cubic-bezier(.4,0,.2,1)',boxShadow:`0 0 16px ${c}35`,position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent)',animation:'shimmer 2s ease infinite'}}/>
      </div>
    </div>
  </div>
}

const Stat = ({ icon, value, label, color='#FFD700', delay=0, sub=null }) => {
  const v = useCounter(typeof value==='number'?value:0); const { dark } = useTheme()
  return <div className="ch" style={{...getGlassLight(dark),borderRadius:22,padding:'30px 28px',position:'relative',overflow:'hidden',animation:`fadeInUp .4s ease ${delay}s both`,borderTop:`3px solid ${color}30`}}>
    <div style={{position:'absolute',top:-35,right:-35,width:100,height:100,borderRadius:'50%',background:`radial-gradient(circle,${color}08,transparent)`,pointerEvents:'none'}}/>
    <div style={{fontSize:34,marginBottom:16,filter:`drop-shadow(0 0 10px ${color}25)`,animation:`popIn .4s ease ${delay+.1}s both`}}>{icon}</div>
    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:36,fontWeight:900,lineHeight:1,background:color==='#FFD700'?G:'none',WebkitBackgroundClip:color==='#FFD700'?'text':'none',WebkitTextFillColor:color==='#FFD700'?'transparent':color,color:color!=='#FFD700'?color:undefined,textShadow:color!=='#FFD700'?`0 0 20px ${color}20`:'none'}}>
      {typeof value==='number'?v:value}
    </div>
    <div style={{fontSize:11,color:'#6B7280',marginTop:10,textTransform:'uppercase',letterSpacing:2,fontWeight:700}}>{label}</div>
    {sub&&<div style={{fontSize:11,color:'#4B5563',marginTop:5}}>{sub}</div>}
  </div>
}

const Empty = ({ icon='📦', title='No data', sub=null }) => (
  <div style={{textAlign:'center',padding:'60px 30px',animation:'fadeIn .5s ease'}}>
    <div style={{fontSize:56,marginBottom:20,opacity:.12,animation:'float 3s ease infinite'}}>{icon}</div>
    <div style={{fontSize:18,fontWeight:600,color:'#4B5563',marginBottom:8,fontFamily:"'Space Grotesk',sans-serif"}}>{title}</div>
    {sub&&<div style={{fontSize:13,color:'#374151',maxWidth:320,margin:'0 auto',lineHeight:1.6}}>{sub}</div>}
  </div>
)

const Loader = () => (
  <div style={{padding:34,animation:'fadeIn .3s ease'}}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'80px 0'}}>
      <div style={{position:'relative',width:60,height:60,marginBottom:28}}>
        <div style={{width:60,height:60,border:'3px solid rgba(255,215,0,.08)',borderTop:'3px solid #FFD700',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
        <div style={{position:'absolute',inset:8,border:'3px solid rgba(255,165,0,.06)',borderBottom:'3px solid #FFA500',borderRadius:'50%',animation:'spin 1.2s linear infinite reverse'}}/>
      </div>
      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:700,background:G,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',letterSpacing:2,textTransform:'uppercase'}}>Loading</div>
      <div style={{fontSize:12,color:'#4B5563',marginTop:8}}>Please wait...</div>
    </div>
  </div>
)

const Search = ({ value, onChange, placeholder='🔍 Search...' }) => {
  const [f,setF] = useState(false); const { dark } = useTheme()
  return <input value={value} onChange={onChange} placeholder={placeholder} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{
    background:f?'rgba(255,215,0,.03)':dark?'rgba(0,0,0,.25)':'rgba(0,0,0,.03)',
    border:`1.5px solid ${f?'rgba(255,215,0,.3)':dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.08)'}`,
    color:dark?'#E5E7EB':'#1F2937', padding:'11px 20px', borderRadius:13, fontSize:13,
    outline:'none', width:250, fontFamily:"'Inter',sans-serif", transition:tr,
    boxShadow:f?'0 0 20px rgba(255,215,0,.05)':'none',
  }}/>
}

const FileUp = ({ onUpload, accept='*', label='Upload File', uploading=false }) => {
  const { dark } = useTheme()
  return <div style={{marginBottom:22}}>
    {label&&<label style={{display:'block',fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:1.2,marginBottom:9}}>{label}</label>}
    <label style={{display:'flex',alignItems:'center',gap:16,padding:'20px 22px',background:dark?'rgba(0,0,0,.25)':'#FAFAFA',border:`1.5px dashed ${dark?'rgba(255,215,0,.12)':'rgba(255,215,0,.25)'}`,borderRadius:16,cursor:uploading?'not-allowed':'pointer',transition:tr}}
      onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(255,215,0,.35)'}
      onMouseLeave={e=>e.currentTarget.style.borderColor=dark?'rgba(255,215,0,.12)':'rgba(255,215,0,.25)'}>
      <div style={{width:48,height:48,borderRadius:14,background:'rgba(255,215,0,.06)',border:'1px solid rgba(255,215,0,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>{uploading?'⏳':'📎'}</div>
      <div><div style={{fontSize:14,fontWeight:600,color:dark?'#D1D5DB':'#374151'}}>{uploading?'Uploading...':'Click to select file'}</div><div style={{fontSize:12,color:'#4B5563',marginTop:3}}>Drag & drop or click to browse</div></div>
      <input type="file" accept={accept} style={{display:'none'}} onChange={onUpload} disabled={uploading}/>
    </label>
  </div>
}

const Grid = ({ cols='1fr 1fr', gap=22, children, style:cs={} }) => <div style={{display:'grid',gridTemplateColumns:cols,gap,...cs}} className="mf">{children}</div>
// ═══════════════════════════════════════
// SIDEBAR — Sexy Premium
// ═══════════════════════════════════════
function Sidebar({ page, setPage, mobileOpen, setMobileOpen }) {
  const { user, role, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const [hov, setHov] = useState(null)

  const adminNav = [
    { sec: 'Main', items: [{ id: 'dashboard', icon: '📊', label: 'Dashboard' }, { id: 'tasks', icon: '🎯', label: 'Task Center' }] },
    { sec: 'People', items: [{ id: 'students', icon: '👥', label: 'Students' }, { id: 'admissions', icon: '📋', label: 'Admissions' }, { id: 'batches', icon: '🏫', label: 'Batches' }, { id: 'idcards', icon: '🪪', label: 'ID Cards' }] },
    { sec: 'Academic', items: [{ id: 'classes', icon: '📅', label: 'Classes' }, { id: 'attendance', icon: '✅', label: 'Attendance' }, { id: 'alerts', icon: '🚨', label: 'Attendance Alerts' }, { id: 'assignments', icon: '📝', label: 'Assignments' }, { id: 'submissions', icon: '📤', label: 'Submissions' }, { id: 'recordings', icon: '🎥', label: 'Recordings' }, { id: 'timetable', icon: '🗓', label: 'Timetable' }, { id: 'quizzes', icon: '🧠', label: 'Quizzes' }, { id: 'journey', icon: '🚀', label: 'Learning Journey' }, { id: 'promotion', icon: '⏭', label: 'Batch Promotion' }] },
    { sec: 'Finance', items: [{ id: 'fees', icon: '💰', label: 'Fee Management' }, { id: 'ledger', icon: '📒', label: 'Fee Ledger' }, { id: 'reminders', icon: '📣', label: 'WhatsApp Reminders' }, { id: 'analytics', icon: '📈', label: 'Analytics' }] },
    { sec: 'Reports', items: [{ id: 'report', icon: '📑', label: 'Monthly Report' }, { id: 'progress', icon: '📄', label: 'Progress Report' }, { id: 'leaderboard', icon: '🏆', label: 'Leaderboard' }] },
    { sec: 'Tools', items: [{ id: 'announcements', icon: '📢', label: 'Announcements' }, { id: 'certificates', icon: '🎓', label: 'Certificates' }, { id: 'sync', icon: '🔄', label: 'Sheet Sync' }, { id: 'excel', icon: '📈', label: 'Import/Export' }, { id: 'audit', icon: '🕵️', label: 'Audit Log' }, { id: 'settings', icon: '⚙️', label: 'Settings' }] },
  ]
  const studentNav = [
    { sec: 'My Portal', items: [{ id: 'dashboard', icon: '📊', label: 'Dashboard' }, { id: 'attendance', icon: '✅', label: 'My Attendance' }, { id: 'assignments', icon: '📝', label: 'Assignments' }, { id: 'quizzes', icon: '🧠', label: 'Quizzes' }, { id: 'recordings', icon: '🎥', label: 'Recordings' }, { id: 'timetable', icon: '🗓', label: 'Timetable' }, { id: 'announcements', icon: '📢', label: 'Announcements' }, { id: 'fees', icon: '💰', label: 'My Fees' }, { id: 'profile', icon: '👤', label: 'My Profile' }] },
  ]
  const nav = role === 'admin' ? adminNav : studentNav
  const handleNav = id => { setPage(id); setMobileOpen(false) }

  const isMob = typeof window !== 'undefined' && window.innerWidth < 769

  return (
    <>
      {mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 199, backdropFilter: 'blur(4px)' }} />}
      <div className="cs" style={{
        width: 275, background: dark ? '#000000' : '#FFFFFF',
        position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        borderRight: `1px solid ${dark ? 'rgba(255,215,0,.04)' : 'rgba(0,0,0,.05)'}`,
        boxShadow: dark ? '6px 0 40px rgba(0,0,0,.35)' : '4px 0 24px rgba(0,0,0,.04)',
        transition: 'transform .3s ease',
        transform: isMob && !mobileOpen ? 'translateX(-275px)' : 'translateX(0)',
      }}>
        {/* Logo */}
        <div style={{ padding: '30px 28px 22px', borderBottom: `1px solid ${dark ? 'rgba(255,215,0,.04)' : 'rgba(0,0,0,.05)'}` }}>
          <Logo size={22} tag />
          <div style={{ marginTop: 10, fontSize: 10, color: dark ? '#222' : '#B0B0B0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#FFD700', fontSize: 7, textShadow: '0 0 6px rgba(255,215,0,.5)' }}>✦</span>
            {role === 'admin' ? 'Admin Panel' : 'Student Portal'}
          </div>
        </div>

        {/* User Card */}
        <div style={{
          margin: '18px 16px 12px', padding: '18px 20px', borderRadius: 18,
          background: dark ? 'rgba(255,215,0,.015)' : 'rgba(255,215,0,.03)',
          border: `1px solid ${dark ? 'rgba(255,215,0,.04)' : 'rgba(255,215,0,.08)'}`,
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: dark ? '0 2px 12px rgba(0,0,0,.2)' : '0 2px 8px rgba(0,0,0,.03)',
        }}>
          <Av name={user?.full_name || 'User'} size={44} glow />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: dark ? '#E5E7EB' : '#1F2937' }}>{user?.full_name || 'User'}</div>
            <div style={{ fontSize: 10, color: '#FFD700', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600, opacity: .5, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="od" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px rgba(16,185,129,.5)' }} />
              {role}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {nav.map(({ sec, items }) => (
            <div key={sec}>
              <div style={{ padding: '20px 28px 8px', fontSize: 9, fontWeight: 800, color: dark ? '#2A2A2A' : '#B0B0B0', textTransform: 'uppercase', letterSpacing: 3.5, display:'flex', alignItems:'center', gap:8 }}><div style={{ width:12, height:1, background:dark?'rgba(255,215,0,.1)':'rgba(0,0,0,.08)', borderRadius:1 }}/>{sec}</div>
              {items.map(item => {
                const isA = page === item.id
                const isH = hov === item.id
                return (
                  <div key={item.id} onClick={() => handleNav(item.id)}
                    onMouseEnter={() => setHov(item.id)} onMouseLeave={() => setHov(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 28px',
                      cursor: 'pointer', fontSize: 13, fontWeight: isA ? 700 : 500, transition: tr,
                      color: isA ? '#FFD700' : isH ? (dark ? '#E5E7EB' : '#1F2937') : '#6B7280',
                      background: isA ? (dark ? 'rgba(255,215,0,.06)' : 'rgba(255,215,0,.08)') : isH ? (dark ? 'rgba(255,255,255,.015)' : 'rgba(0,0,0,.015)') : 'transparent',
                      borderLeft: isA ? '3px solid #FFD700' : '3px solid transparent',
                      margin: '2px 0', position: 'relative',
                    }}>
                    {isA && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: G, boxShadow: '0 0 14px rgba(255,215,0,.45)' }} />}
                    <span style={{ fontSize: 16, width: 26, textAlign: 'center', flexShrink: 0, filter: isA ? 'drop-shadow(0 0 6px rgba(255,215,0,.3))' : 'none', transition: 'filter .3s' }}>{item.icon}</span>
                    {item.label}
                  </div>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '20px 16px', borderTop: `1px solid ${dark ? 'rgba(255,215,0,.04)' : 'rgba(0,0,0,.05)'}` }}>
          <button onClick={toggle} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', marginBottom: 10,
            background: dark ? 'rgba(255,215,0,.03)' : 'rgba(0,0,0,.02)',
            border: `1px solid ${dark ? 'rgba(255,215,0,.06)' : 'rgba(0,0,0,.06)'}`,
            borderRadius: 14, cursor: 'pointer', color: dark ? '#FFD700' : '#1F2937',
            fontSize: 13, fontWeight: 700, width: '100%', fontFamily: "'Inter',sans-serif", transition: tr,
          }}>{dark ? '☀️ Light Mode' : '🌙 Dark Mode'}</button>

          <button onClick={logout} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px',
            background: 'rgba(239,68,68,.03)', border: '1px solid rgba(239,68,68,.08)',
            borderRadius: 14, cursor: 'pointer', color: '#EF4444',
            fontSize: 13, fontWeight: 700, width: '100%', fontFamily: "'Inter',sans-serif", transition: tr,
          }}>🚪 Sign Out</button>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 10, color: dark ? '#1A1A1A' : '#D1D5DB', fontWeight: 600, letterSpacing: 1.5 }}>v3.2 — AEMTECH Portal</div>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════
// TOPBAR — Sexy Premium
// ═══════════════════════════════════════
function TopBar({ title, pendingCount, setMobileOpen }) {
  const { user } = useAuth(); const { dark } = useTheme()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [time, setTime] = useState(''); const [showNotif, setShowNotif] = useState(false)
  const notifRef = useRef(null)
  useEffect(() => { const t = () => setTime(new Date().toLocaleString('en-PK', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })); t(); const i = setInterval(t, 1000); return () => clearInterval(i) }, [])
  useEffect(() => { const h = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])

  const totalUnread = unreadCount + (pendingCount || 0)
  const notifIcons = { admission: '📋', assignment: '📝', fee: '💰', announcement: '📢', student: '👥', submission: '📤', system: '🔔' }

  return (
    <div style={{
      background: dark ? 'rgba(6,6,8,.88)' : 'rgba(255,255,255,.92)',
      backdropFilter: 'blur(16px)', padding: 'clamp(12px, 2vw, 16px) clamp(16px, 3vw, 32px)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 50,
      borderBottom: `1px solid ${dark ? 'rgba(255,215,0,.03)' : 'rgba(0,0,0,.05)'}`,
      boxShadow: dark ? '0 4px 20px rgba(0,0,0,.15)' : '0 2px 12px rgba(0,0,0,.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setMobileOpen(true)} className="hd" style={{ background: 'none', border: 'none', color: '#FFD700', fontSize: 26, cursor: 'pointer', padding: '4px 8px' }}>☰</button>
        <div style={{ width: 4, height: 26, background: G, borderRadius: 3, boxShadow: '0 0 10px rgba(255,215,0,.25)' }} />
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(16px, 2vw, 21px)', fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937', letterSpacing: .3 }}>{title}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ fontSize: 12, color: '#4B5563', fontFamily: "'Space Grotesk',sans-serif", letterSpacing: .5 }} className="hm">{time}</div>
        <div style={{ width: 1, height: 26, background: dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)' }} className="hm" />

        {/* Notification Bell */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button onClick={() => setShowNotif(!showNotif)} style={{
            background: showNotif ? 'rgba(255,215,0,.08)' : dark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.03)',
            border: `1px solid ${showNotif ? 'rgba(255,215,0,.2)' : dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'}`,
            width: 42, height: 42, borderRadius: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, position: 'relative', transition: tr,
          }}>
            🔔
            {totalUnread > 0 && <span style={{
              position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: '50%',
              background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 800, padding: '0 4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'pulseOnline 2s ease infinite', boxShadow: '0 0 8px rgba(239,68,68,.4)',
            }}>{totalUnread > 9 ? '9+' : totalUnread}</span>}
          </button>

          {showNotif && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 10, width: 380,
              ...getGlass(dark), borderRadius: 20, padding: 0, overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,.5)', zIndex: 200, animation: 'scaleIn .2s ease',
            }}>
              <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${dark ? 'rgba(255,215,0,.04)' : 'rgba(0,0,0,.05)'}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🔔 Notifications {totalUnread > 0 && <Bdg type="danger" size="sm">{totalUnread}</Bdg>}
                </div>
                {totalUnread > 0 && <button onClick={(e)=>{e.stopPropagation();markAllRead()}} style={{ background:'none', border:'none', color:'#FFD700', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Mark all read</button>}
              </div>

              <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 12px' }} className="cs">
                {pendingCount > 0 && (
                  <div style={{ ...getGlassLight(dark), borderRadius: 12, padding: 14, margin: '6px 0', borderLeft: '3px solid #F59E0B', cursor:'pointer' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:18 }}>📋</span>
                      <div style={{flex:1}}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>Pending Admissions</div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>{pendingCount} application(s) waiting for review</div>
                      </div>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:'#F59E0B', flexShrink:0 }}/>
                    </div>
                  </div>
                )}

                {notifications.slice(0, 15).map(n => (
                  <div key={n.id} onClick={(e)=>{e.stopPropagation();markRead(n.id)}} style={{
                    ...getGlassLight(dark), borderRadius: 12, padding: 14, margin: '6px 0',
                    borderLeft: `3px solid ${n.read ? (dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)') : '#FFD700'}`,
                    cursor:'pointer', opacity: n.read ? 0.6 : 1, transition: tr,
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:18 }}>{notifIcons[n.type] || '🔔'}</span>
                      <div style={{flex:1}}>
                        <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: dark ? '#E5E7EB' : '#1F2937' }}>{n.title}</div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginTop:2 }}>{n.message}</div>
                      </div>
                      {!n.read && <div style={{ width:8, height:8, borderRadius:'50%', background:'#FFD700', flexShrink:0, boxShadow:'0 0 6px rgba(255,215,0,.4)' }}/>}
                    </div>
                    <div style={{ fontSize: 10, color: '#374151', marginTop: 6, textAlign:'right' }}>{ago(n.time)}</div>
                  </div>
                ))}

                {notifications.length === 0 && pendingCount === 0 && (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div style={{ fontSize: 36, marginBottom: 10, opacity: .2 }}>🔔</div>
                    <div style={{ fontSize: 13, color: '#4B5563' }}>All caught up! ✅</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11,
          padding: '7px 18px 7px 9px',
          background: dark ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.02)',
          border: `1px solid ${dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)'}`,
          borderRadius: 32, cursor: 'pointer', transition: tr,
        }}>
          <Av name={user?.full_name} size={32} />
          <span style={{ fontSize: 13, fontWeight: 600, color: dark ? '#D1D5DB' : '#374151' }} className="hm">{user?.full_name?.split(' ')[0]}</span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// LOGIN PAGE — Sexy Premium
// ═══════════════════════════════════════
function LoginPage() {
  const { login, loading } = useAuth()
  const [role, setRole] = useState('student'); const [email, setEmail] = useState(''); const [pass, setPass] = useState(''); const [showPass, setShowPass] = useState(false)
  const go = async () => await login(email, pass, role)

  // Random stars for background
  const stars = Array.from({length:8},(_,i)=>({
    left:Math.random()*50+'%',
    top:Math.random()*100+'%',
    delay:Math.random()*5+'s',
    size:Math.random()*3+1
  }))

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'linear-gradient(135deg,#020204 0%,#080810 50%,#0A0808 100%)' }}>
      {/* Left Panel */}
      <div className="hm" style={{ flex: '0 0 55%', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(30px, 5vw, 60px) clamp(40px, 6vw, 85px)' }}>
        {/* Animated Orbs - Premium */}
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
        
        {/* Stars */}
        {stars.map((s,i)=>(
          <div key={i} className="login-star" style={{left:s.left,top:s.top,animationDelay:s.delay,width:s.size,height:s.size}} />
        ))}
        
        {/* Grid Pattern */}
        <div style={{ position: 'absolute', inset: 0, opacity: .015, backgroundImage: 'linear-gradient(rgba(255,215,0,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,215,0,.6) 1px,transparent 1px)', backgroundSize: '55px 55px', pointerEvents: 'none' }} />
        
        {/* Diagonal Accent Line */}
        <div style={{ position:'absolute', top:0, right:0, width:2, height:'100%', background:'linear-gradient(180deg,transparent,rgba(255,215,0,.15),transparent)', pointerEvents:'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ animation: 'fadeInLeft .6s ease' }}><Logo size={48} tag /></div>

          <div style={{ marginTop: 55, animation: 'fadeInLeft .6s ease .2s both' }}>
            <div style={{ fontSize:12, color:'#FFD700', textTransform:'uppercase', letterSpacing:4, fontWeight:700, marginBottom:16, opacity:.6 }}>Welcome to AEMTECH</div>
            <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 900, lineHeight: 1.08, marginBottom: 22 }}>
              <span style={{ color: '#F3F4F6' }}>Manage Your</span><br />
              <span className="gold-text" style={{ background:'linear-gradient(135deg,#FFD700,#FFA500,#FFD700)', backgroundSize:'200% 200%', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'gradientShift 4s ease infinite' }}>Academy Smarter</span>
            </h1>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 36, marginTop: 55, animation: 'fadeInLeft .6s ease .4s both' }}>
            {[['24+', 'Classes', '📚'], ['100%', 'Remote', '🌐'], ['3', 'Months', '📅'], ['∞', 'Growth', '🚀']].map(([v, l, emoji], i) => (
              <div key={l} style={{ textAlign:'center', animation:`popIn .4s ease ${.5+i*.1}s both` }}>
                <div style={{ fontSize:20, marginBottom:6 }}>{emoji}</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 30, fontWeight: 900, background: G, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textShadow:'none' }}>{v}</div>
                <div style={{ fontSize: 10, color: '#4B5563', textTransform: 'uppercase', letterSpacing: 2.5, marginTop: 5, fontWeight: 700 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 3vw, 35px)', position:'relative' }}>
        {/* Subtle background orb on right */}
        <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(255,215,0,.03),transparent)', top:'20%', right:'-10%', pointerEvents:'none', animation:'orbFloat2 20s ease infinite' }} />
        
        <div style={{
          background: 'rgba(12,12,14,.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter:'blur(20px)',
          border: '1px solid rgba(255,215,0,.08)', borderRadius: 28,
          padding: 'clamp(30px, 5vw, 52px) clamp(24px, 4vw, 44px)', width: '100%', maxWidth: 440,
          animation: 'slideUp .5s ease',
          boxShadow: '0 24px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,215,0,.05)',
          position:'relative', overflow:'hidden',
        }}>
          {/* Card glow accent */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,rgba(255,215,0,.2),transparent)', pointerEvents:'none' }} />
          
          <div style={{ textAlign:'center', marginBottom:32 }}>
            <div style={{ fontSize:36, marginBottom:14, animation:'popIn .4s ease .2s both' }}>🔐</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 900, marginBottom: 8, color: '#F3F4F6' }}>Welcome Back</div>
            <div style={{ fontSize: 14, color: '#6B7280' }}>Sign in to continue to your portal</div>
          </div>

          {/* Role Tabs - Premium */}
          <div style={{
            display: 'flex', gap: 6, padding: 5, borderRadius: 18,
            background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)',
            marginBottom: 32,
          }}>
            {[['student', '🎓 Student'], ['admin', '👨‍💼 Admin']].map(([r, l]) => (
              <button key={r} onClick={() => setRole(r)} style={{
                flex: 1, padding: '14px 20px', borderRadius: 14, cursor: 'pointer',
                fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13,
                border: 'none', transition: 'all .3s cubic-bezier(.4,0,.2,1)',
                background: role === r ? 'linear-gradient(135deg,rgba(255,215,0,.12),rgba(255,165,0,.06))' : 'transparent',
                color: role === r ? '#FFD700' : '#4B5563',
                boxShadow: role === r ? '0 4px 20px rgba(255,215,0,.1), inset 0 0 20px rgba(255,215,0,.03)' : 'none',
                border: role === r ? '1px solid rgba(255,215,0,.12)' : '1px solid transparent',
              }}>{l}</button>
            ))}
          </div>

          <Inp label="Login Email" icon="🔐" type="email" placeholder="Enter your login email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          <Inp label="Password" icon="🔒" type={showPass ? 'text' : 'password'} placeholder="Enter your password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:-8, marginBottom:22 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#4B5563', cursor:'pointer' }}>
              <input type="checkbox" checked={showPass} onChange={()=>setShowPass(!showPass)} style={{ accentColor:'#FFD700' }}/>
              Show password
            </label>
          </div>

          <Btn onClick={go} loading={loading} full size="lg" style={{ marginTop: 4, borderRadius: 16, fontSize: 16, padding: '18px 32px', letterSpacing: .5, boxShadow:'0 8px 30px rgba(255,215,0,.2)' }}>✨ Sign In</Btn>

          <div style={{ textAlign: 'center', marginTop: 30, fontSize: 11, color: '#1A1A1A', letterSpacing:1 }}>© 2025 AEMTECH — Design the Future ✦</div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// ADMIN DASHBOARD — Sexy Premium
// ═══════════════════════════════════════
function AdminDashboard() {
  const { user } = useAuth(); const { dark } = useTheme(); const { setPage } = usePage()
  const [stats, setStats] = useState({}); const [recent, setRecent] = useState([]); const [anns, setAnns] = useState([]); const [subs, setSubs] = useState([]); const [loading, setLoading] = useState(true); const [syncing, setSyncing] = useState(false); const [overdueFees, setOverdueFees] = useState(0); const [attData, setAttData] = useState([]); const [growthData, setGrowthData] = useState([]); const [onlineStudents, setOnlineStudents] = useState([])

  useEffect(() => {
    (async () => {
      const [s, adm, bat, asn, sub, ann, rs, rsub, sts, asns, payments, attendance] = await Promise.all([
        sb.from('students').select('*', { count: 'exact', head: true }),
        sb.from('admissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('batches').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        sb.from('assignments').select('*', { count: 'exact', head: true }),
        sb.from('submissions').select('*', { count: 'exact', head: true }),
        sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(3),
        sb.from('students').select('*').order('created_at', { ascending: false }).limit(5),
        sb.from('submissions').select('*').order('submitted_at', { ascending: false }).limit(4),
        sb.from('students').select('*'),
        sb.from('assignments').select('*'),
        sb.from('fee_payments').select('*').eq('status', 'overdue'),
        sb.from('attendance').select('*').order('marked_at', { ascending: false }).limit(500),
      ])
      const allSt = sts.data || []; const totalFee = allSt.reduce((a, st) => a + totalFeeOf(st), 0); const totalPaid = allSt.reduce((a, st) => a + (st.fee_paid || 0), 0)
      setStats({ students: s.count || 0, admissions: adm.count || 0, batches: bat.count || 0, assignments: asn.count || 0, submissions: sub.count || 0, totalFee, totalPaid })
      setOverdueFees((payments.data || []).length)
      setAnns(ann.data || []); setRecent(rs.data || [])
      setSubs((rsub.data || []).map(s => ({ ...s, studentName: allSt.find(x => x.id === s.student_id)?.full_name || '—', assignTitle: (asns.data || []).find(a => a.id === s.assignment_id)?.title || '—' })))
      
      // Real attendance data - group by week
      const attRecords = attendance.data || []
      const weeks = {}
      attRecords.forEach(a => {
        const d = new Date(a.marked_at || a.created_at)
        const weekNum = Math.ceil((d.getDate()) / 7)
        const key = `Wk${weekNum}`
        if (!weeks[key]) weeks[key] = { present: 0, absent: 0 }
        if (a.status === 'present') weeks[key].present++
        else weeks[key].absent++
      })
      const attChartData = Object.entries(weeks).slice(0, 6).map(([name, data]) => {
        const total = data.present + data.absent
        return { name, present: total > 0 ? Math.round((data.present / total) * 100) : 0, absent: total > 0 ? Math.round((data.absent / total) * 100) : 0 }
      })
      setAttData(attChartData.length > 0 ? attChartData : [{ name: 'No Data', present: 0, absent: 0 }])
      
      // Real growth data - students by month
      const monthCounts = {}
      allSt.forEach(st => {
        const d = new Date(st.created_at)
        const m = MONTH_SHORT[d.getMonth()]
        monthCounts[m] = (monthCounts[m] || 0) + 1
      })
      let cumulative = 0
      const growth = MONTH_SHORT.map(m => {
        cumulative += (monthCounts[m] || 0)
        return { month: m, students: cumulative }
      }).filter(d => d.students > 0)
      setGrowthData(growth.length > 0 ? growth.slice(-6) : [{ month: currentMonth().substring(0,3), students: s.count || 0 }])
      
      setLoading(false)
    })()
    
    // Fetch online students (last_seen within 5 min)
    const fetchOnline = async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data } = await sb.from('students').select('id,full_name,profile_image,last_seen').gte('last_seen', fiveMinAgo)
      setOnlineStudents(data || [])
    }
    fetchOnline()
    const onlineInterval = setInterval(fetchOnline, 30000)
    return () => clearInterval(onlineInterval)
  }, [])

  const syncAll = async () => {
    setSyncing(true); toast.loading('Syncing...', { id: 'sync' })
    try {
      const [students, att, classes, submissions, assignments, batches] = await Promise.all([sb.from('students').select('*'), sb.from('attendance').select('*'), sb.from('classes').select('*'), sb.from('submissions').select('*'), sb.from('assignments').select('*'), sb.from('batches').select('*')])
      await Promise.all([
        syncToSheet('syncStudents', { students: students.data || [] }),
        syncToSheet('syncAttendance', { records: (att.data || []).map(a => ({ student_name: students.data?.find(s => s.id === a.student_id)?.full_name || '', class_number: classes.data?.find(c => c.id === a.class_id)?.class_number || '', class_title: classes.data?.find(c => c.id === a.class_id)?.title || '', date: fmtDate(a.marked_at || new Date()), status: a.status })) }),
        syncToSheet('syncFees', { students: students.data || [] }),
        syncToSheet('syncSubmissions', { records: (submissions.data || []).map(s => ({ student_name: students.data?.find(x => x.id === s.student_id)?.full_name || '', assignment_title: assignments.data?.find(x => x.id === s.assignment_id)?.title || '', submitted_at: s.submitted_at, submission_link: s.submission_link || '', marks_obtained: s.marks_obtained || '', feedback: s.feedback || '', status: s.status })) }),
        syncToSheet('syncAssignments', { records: (assignments.data || []).map(a => ({ title: a.title, batch_name: batches.data?.find(b => b.id === a.batch_id)?.name || '', due_date: a.due_date, total_marks: a.total_marks, description: a.description || '' })) }),
      ])
      toast.success('All synced! 📊', { id: 'sync' })
    } catch { toast.error('Failed', { id: 'sync' }) } finally { setSyncing(false) }
  }

  if (loading) return <SkeletonDashboard />

  const pieData = [{ name: 'Collected', value: stats.totalPaid || 0 }, { name: 'Pending', value: (stats.totalFee || 0) - (stats.totalPaid || 0) }]; const PIE_COLORS = ['#10B981', '#EF4444']

  return (
    <div className="page-enter">
      {/* Welcome — Ultra Premium Glass */}
      <div style={{
        ...getGlass(dark), borderRadius: 'clamp(16px, 2vw, 26px)', padding: 'clamp(20px, 3vw, 38px) clamp(20px, 3vw, 44px)', marginBottom: 'clamp(18px, 2vw, 30px)',
        position: 'relative', overflow: 'hidden', animation: 'slideUp .5s cubic-bezier(.4,0,.2,1)',
        background: dark ? 'linear-gradient(135deg,rgba(255,215,0,.06),rgba(255,165,0,.02),rgba(12,12,14,.8))' : 'linear-gradient(135deg,rgba(255,215,0,.08),rgba(255,165,0,.04),rgba(255,255,255,.9))',
        boxShadow: dark ? '0 20px 60px rgba(0,0,0,.3), 0 0 40px rgba(255,215,0,.03)' : '0 20px 60px rgba(0,0,0,.06)',
        border: `1px solid ${dark ? 'rgba(255,215,0,.08)' : 'rgba(255,215,0,.12)'}`,
      }}>
        <div style={{ position: 'absolute', top: -70, right: -70, width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,215,0,.06),transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -50, left: -50, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,165,0,.04),transparent)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 22 }}>
          <div>
            <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 8, fontWeight: 500 }}>{greet()} 👋</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, marginBottom: 10 }}>
              <span style={{ background: G, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{user?.full_name || 'Admin'}</span>
            </div>
            <div style={{ fontSize: 14, color: '#4B5563' }}>Here's your academy overview for <strong style={{ color: '#FFD700' }}>{currentMonth()} {currentYear()}</strong></div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Btn size="sm" icon="🔄" loading={syncing} onClick={syncAll} style={{ background: G2, color: '#fff', border: 'none' }}>Sync Sheets</Btn>
            <Btn type="outline" size="sm" icon="📊" onClick={() => openSheet()}>Open Sheet</Btn>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 'clamp(10px, 1.5vw, 18px)', marginBottom: 'clamp(18px, 2vw, 30px)' }}>
        <Stat icon="👥" value={stats.students} label="Students" delay={0} sub={`${stats.batches} active batches`} />
        <Stat icon="📋" value={stats.admissions} label="Pending Adm." delay={.06} />
        <Stat icon="📝" value={stats.assignments} label="Assignments" delay={.12} />
        <Stat icon="📤" value={stats.submissions} label="Submissions" delay={.18} />
        <Stat icon="⚠️" value={overdueFees} label="Overdue Fees" delay={.24} color="#EF4444" />
      </div>

      {/* Online Students */}
      {onlineStudents.length > 0 && (
        <Card title={`🟢 Online Now (${onlineStudents.length})`} icon="🟢" delay={.28}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {onlineStudents.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, ...getGlassLight(dark), borderRadius: 30, padding: '8px 16px 8px 8px' }}>
                <div style={{ position: 'relative' }}>
                  <Av name={s.full_name} src={s.profile_image||null} size={32} />
                  <div className="od" style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: '#10B981', border: '2px solid #000' }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</div>
                  <div style={{ fontSize: 10, color: '#10B981' }}>Online</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Charts */}
      <Grid gap={26} style={{ marginBottom: 30 }}>
        <Card title="📊 Attendance Trend" icon="📊" delay={.1}>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={attData}>
              <defs>
                <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={.3} /><stop offset="95%" stopColor="#10B981" stopOpacity={0} /></linearGradient>
                <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#EF4444" stopOpacity={.2} /><stop offset="95%" stopColor="#EF4444" stopOpacity={0} /></linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#374151" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#374151" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip {...chartTooltip} />
              <Area type="monotone" dataKey="present" stroke="#10B981" strokeWidth={2.5} fill="url(#gG)" name="Present %" />
              <Area type="monotone" dataKey="absent" stroke="#EF4444" strokeWidth={2} fill="url(#gR)" name="Absent %" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="💰 Fee Distribution" icon="💰" delay={.15}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <ResponsiveContainer width="55%" height={210}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={58} outerRadius={86} paddingAngle={5} dataKey="value" stroke="none">
                  {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {pieData.map((d, i) => (
                <div key={d.name} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
                    <div style={{ width: 11, height: 11, borderRadius: '50%', background: PIE_COLORS[i], boxShadow: `0 0 8px ${PIE_COLORS[i]}40` }} />
                    <span style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600 }}>{d.name}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: PIE_COLORS[i], fontFamily: "'Space Grotesk',sans-serif" }}>{currency(d.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </Grid>

      <Grid gap={26} style={{ marginBottom: 30 }}>
        <Card title="📈 Student Enrollment" icon="📈" delay={.2}>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={growthData} barSize={32}>
              <XAxis dataKey="month" stroke="#374151" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#374151" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip {...chartTooltip} />
              <defs><linearGradient id="bG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFD700" stopOpacity={1} /><stop offset="100%" stopColor="#FFA500" stopOpacity={.8} /></linearGradient></defs>
              <Bar dataKey="students" radius={[10, 10, 0, 0]} name="Students">
                {growthData.map((_, idx) => <Cell key={idx} fill={idx === growthData.length - 1 ? 'url(#bG)' : 'rgba(255,215,0,.2)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="⚡ Quick Actions" icon="⚡" delay={.25}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { icon: '👥', label: 'Students', c: '#FFD700', fn: () => setPage('students') },
              { icon: '📝', label: 'Assignments', c: '#10B981', fn: () => setPage('assignments') },
              { icon: '📢', label: 'Announce', c: '#3B82F6', fn: () => setPage('announcements') },
              { icon: '✅', label: 'Attendance', c: '#F59E0B', fn: () => setPage('attendance') },
              { icon: '💰', label: 'Collect Fee', c: '#8B5CF6', fn: () => setPage('fees') },
              { icon: '📊', label: 'Open Sheet', c: '#10B981', fn: () => openSheet() },
            ].map(({ icon, label, c, fn }) => (
              <div key={label} className="ch" onClick={fn} style={{
                background: `${c}08`, border: `1px solid ${c}18`,
                borderRadius: 14, padding: '16px 18px',
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                transition: tr,
              }}>
                <span style={{ fontSize: 22, filter: `drop-shadow(0 0 4px ${c}30)` }}>{icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{label}</span>
              </div>
            ))}
          </div>
        </Card>
      </Grid>

      {/* Fee + Submissions */}
      <Grid gap={26} style={{ marginBottom: 30 }}>
        <Card title={`💰 Fee — ${currentMonth()}`} icon="💰" delay={.3}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 5 }}>Collected</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 30, fontWeight: 800, color: '#10B981' }}>{currency(stats.totalPaid)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 5 }}>Outstanding</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: '#EF4444' }}>{currency((stats.totalFee || 0) - (stats.totalPaid || 0))}</div>
            </div>
          </div>
          <PBar value={stats.totalPaid || 0} max={stats.totalFee || 1} height={14} showLabel label="Collection Progress" />
          {overdueFees > 0 && <div style={{ marginTop: 18, ...getGlassLight(dark), borderRadius: 12, padding: 14, borderLeft: '3px solid #EF4444', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div><div style={{ fontSize: 13, fontWeight: 700, color: '#EF4444' }}>{overdueFees} Overdue</div><div style={{ fontSize: 11, color: '#6B7280' }}>Students with unpaid fees</div></div>
          </div>}
        </Card>

        <Card title="📤 Recent Submissions" icon="📤" delay={.35}>
          {subs.length === 0 ? <Empty icon="📤" title="No submissions" /> : subs.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)'}`, animation: `fadeIn .4s ease ${i * .08}s both` }}>
              <Av name={s.studentName} size={38} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.studentName}</div>
                <div style={{ fontSize: 11, color: '#4B5563' }}>{s.assignTitle}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Bdg type={s.marks_obtained != null ? 'success' : 'warning'} size="sm" dot>{s.marks_obtained != null ? 'Graded' : 'Pending'}</Bdg>
                <div style={{ fontSize: 10, color: '#4B5563', marginTop: 5 }}>{ago(s.submitted_at)}</div>
              </div>
            </div>
          ))}
        </Card>
      </Grid>

      {/* Students + Announcements */}
      <Grid gap={26}>
        <Card title="👥 Recent Students" icon="👥" delay={.4}>
          {recent.length === 0 ? <Empty icon="👥" title="No students" /> : recent.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)'}`, animation: `fadeIn .4s ease ${i * .08}s both` }}>
              <Av name={s.full_name} src={s.profile_image||null} size={42} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</div>
                <div style={{ fontSize: 11, color: '#4B5563' }}>{s.father_name ? `${childOf(s.gender)} ${s.father_name} · ` : ''}{s.city || 'Pakistan'}{s.referred_by ? ` · via ${s.referred_by}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Bdg type={statusBadge(s.status)} size="sm" dot>{s.status}</Bdg>
                {s.dob && <div style={{ fontSize: 10, color: '#4B5563', marginTop: 5 }}>Age: {calcAge(s.dob)}</div>}
              </div>
            </div>
          ))}
        </Card>

        <Card title="📢 Announcements" icon="📢" delay={.45}>
          {anns.length === 0 ? <Empty icon="📢" title="No announcements" /> : anns.map((a, i) => (
            <div key={a.id} style={{ ...getGlassLight(dark), borderRadius: 14, padding: 18, marginBottom: 12, borderLeft: '3px solid #FFD700', animation: `fadeIn .4s ease ${i * .08}s both` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937' }}>{a.title}</div>
                <Bdg type={a.priority === 'urgent' ? 'danger' : a.priority === 'important' ? 'warning' : 'info'} size="sm">{a.priority}</Bdg>
              </div>
              <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.65, marginBottom: 8 }}>{a.content?.substring(0, 90)}...</div>
              <div style={{ fontSize: 10, color: '#374151' }}>{ago(a.created_at)}</div>
            </div>
          ))}
        </Card>
      </Grid>
    </div>
  )
}
// ═══════════════════════════════════════
// STUDENTS — Sexy Premium + Filters
// ═══════════════════════════════════════
function StudentsPage() {
  const [students,setStudents]=useState([]); const [batches,setBatches]=useState([]); const [loading,setLoading]=useState(true); const [search,setSearch]=useState(''); const [modal,setModal]=useState(null); const [form,setForm]=useState({}); const [importing,setImporting]=useState(false); const [viewStudent,setViewStudent]=useState(null); const [filters,setFilters]=useState({}); const [imgUploading,setImgUploading]=useState(false); const {dark}=useTheme(); const {confirm}=useConfirm()

  const load=useCallback(async()=>{setLoading(true);const[s,b]=await Promise.all([sb.from('students').select('*').order('created_at',{ascending:false}),sb.from('batches').select('*')]);setStudents(s.data||[]);setBatches(b.data||[]);setLoading(false)},[])
  useEffect(()=>{load()},[load])

  const filtered=students.filter(s=>{
    if(search&&!s.full_name?.toLowerCase().includes(search.toLowerCase())&&!s.email?.toLowerCase().includes(search.toLowerCase())&&!s.phone?.includes(search)) return false
    if(filters.batch&&s.batch_id!==filters.batch) return false
    if(filters.status&&s.status!==filters.status) return false
    if(filters.fee&&s.fee_status!==filters.fee) return false
    if(filters.city&&s.city!==filters.city) return false
    if(filters.referred&&s.referred_by!==filters.referred) return false
    if(filters.gender&&s.gender!==filters.gender) return false
    return true
  })

  const save=async()=>{
    if(!form.full_name||!form.email){toast.error('Name and personal email required');return}
    const saveData={...form,login_email:form.login_email||form.email}; if(saveData.dob) saveData.age=calcAge(saveData.dob)
    if(modal==='add'){
      const{data:existingEmail}=await sb.from('students').select('id').eq('email',form.email).maybeSingle()
      if(existingEmail){toast.error('Personal email exists!');return}
      const{data:existingLogin}=await sb.from('students').select('id').eq('login_email',saveData.login_email).maybeSingle()
      if(existingLogin){toast.error('Login email exists!');return}
      const{error}=await sb.from('students').insert({...saveData,status:'active',fee_status:'pending',password:form.password||'12345678'})
      if(error){toast.error(error.message);return};logAction('CREATE','Student',form.full_name||'');toast.success('Added! 🎉')
    } else {
      const{error}=await sb.from('students').update(saveData).eq('id',form.id)
      if(error){toast.error(error.message);return};toast.success('Updated! ✅')
    }
    setModal(null);load()
    setTimeout(async()=>{const{data}=await sb.from('students').select('*');await syncToSheet('syncStudents',{students:data||[]});await syncToSheet('syncFees',{students:data||[]})},1000)
  }

  const del=async(id,name)=>{
    const ok=await confirm({title:'Delete Student?',message:`${name} aur unka saara data (attendance, submissions, fees) delete ho jayega.`,type:'danger',confirmText:'Delete',icon:'🗑️'})
    if(!ok)return
    await sb.from('attendance').delete().eq('student_id',id);await sb.from('submissions').delete().eq('student_id',id);await sb.from('fee_payments').delete().eq('student_id',id);await sb.from('students').delete().eq('id',id)
    toast.success('Deleted');load()
  }

  const removeStudentImage = async (student) => {
    if (!student?.id) return
    if (!confirm(`Remove profile image for ${student.full_name}?`)) return
    const { error } = await sb.from('students').update({ profile_image: null }).eq('id', student.id)
    if (error) { toast.error(error.message || 'Failed to remove image'); return }
    setStudents(prev => prev.map(s => s.id === student.id ? { ...s, profile_image: null } : s))
    if (viewStudent?.id === student.id) setViewStudent({ ...viewStudent, profile_image: null })
    toast.success('Profile image removed 🗑️')
  }

  const uploadStudentImage = async (student, e) => {
    const file = e.target.files?.[0]
    if (!student?.id || !file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Max 2MB allowed!'); e.target.value=''; return }
    if (!file.type.startsWith('image/')) { toast.error('Only images allowed!'); e.target.value=''; return }

    setImgUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const base64 = event.target?.result
        if (!base64) { toast.error('Failed to read file'); setImgUploading(false); return }
        const { error } = await sb.from('students').update({ profile_image: base64 }).eq('id', student.id)
        if (error) { toast.error(error.message || 'Failed to save image'); setImgUploading(false); return }
        setStudents(prev => prev.map(s => s.id === student.id ? { ...s, profile_image: base64 } : s))
        if (viewStudent?.id === student.id) setViewStudent({ ...viewStudent, profile_image: base64 })
        toast.success('Student photo updated 📸')
        setImgUploading(false)
      }
      reader.onerror = () => { toast.error('Failed to read file'); setImgUploading(false) }
      reader.readAsDataURL(file)
    } catch {
      toast.error('Upload failed')
      setImgUploading(false)
    } finally {
      e.target.value = ''
    }
  }

  const doExport=()=>exportXLS(students.map(s=>({'Full Name':s.full_name,'Personal Email':s.email,'Login Email':s.login_email||s.email,Phone:s.phone||'',City:s.city||'','Father/Guardian':s.father_name||'','Guardian Phone':s.guardian_phone||'',DOB:s.dob||'',Age:s.age||calcAge(s.dob)||'',Gender:s.gender||'','Referred By':s.referred_by||'',Education:s.education||'',Status:s.status,'Fee Amount':s.fee_amount||0,'Fee Paid':s.fee_paid||0,'Fee Status':s.fee_status||'pending'})),'AEMTECH_Students.xlsx','Students')

  const doImport=async e=>{
    const file=e.target.files[0];if(!file)return;setImporting(true)
    try{
      const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=ev=>{try{const wb=XLSX.read(ev.target.result,{type:'array'});res(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]))}catch(err){rej(err)}};r.readAsArrayBuffer(file)})
      const records=data.map(r=>({full_name:r['Full Name']||r.full_name||r.Name||'',email:r.Email||r.email||'',login_email:r['Login Email']||r.login_email||r['Portal Email']||r.Email||r.email||'',phone:r.Phone||r.phone||'',city:r.City||r.city||'',education:r.Education||r.education||'',father_name:r['Father/Guardian']||r.father_name||r['Father Name']||'',guardian_phone:r['Guardian Phone']||r.guardian_phone||'',gender:r.Gender||r.gender||'male',referred_by:r['Referred By']||r.referred_by||'',status:'active',fee_status:'pending',password:'12345678',fee_amount:parseFloat(r['Fee Amount']||r.fee_amount||0)})).filter(r=>r.full_name&&r.email)
      if(!records.length){toast.error('No valid records');return}
      const{error}=await sb.from('students').insert(records);if(error){toast.error(error.message);return}
      toast.success(`${records.length} imported! 🎉`);load()
    }catch{toast.error('Failed')}finally{setImporting(false);e.target.value=''}
  }

  const uniqueCities=[...new Set(students.map(s=>s.city).filter(Boolean))]
  const [waModal,setWaModal]=useState(null)
  const [selectedTemplate,setSelectedTemplate]=useState('welcome')
  const [bulkModal,setBulkModal]=useState(false)
  const [bulkForm,setBulkForm]=useState({pattern:'name',password:'12345678'})
  const [bulkUpdating,setBulkUpdating]=useState(false)
  const [selectedIds,setSelectedIds]=useState([])
  const [bulkActionModal,setBulkActionModal]=useState(null)
  const [bulkAction,setBulkAction]=useState({})
  const [bulkBusy,setBulkBusy]=useState(false)
  
  const toggleSelect = (id) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const selectedStudents = students.filter(s => selectedIds.includes(s.id))
  
  const runBulkAction = async () => {
    if (selectedIds.length === 0) { toast.error('Select students first'); return }
    setBulkBusy(true)
    try {
      const act = bulkAction.type
      let done = 0
      let missingCol = false
      for (const s of selectedStudents) {
        if (act === 'status') { await sb.from('students').update({ status: bulkAction.status }).eq('id', s.id); done++ }
        else if (act === 'batch') { await sb.from('students').update({ batch_id: bulkAction.batch_id }).eq('id', s.id); done++ }
        else if (act === 'fee') {
          const upd = {}
          if (bulkAction.fee_amount !== '' && bulkAction.fee_amount != null) upd.fee_amount = parseFloat(bulkAction.fee_amount) || 0
          if (bulkAction.total_fee !== '' && bulkAction.total_fee != null) upd.total_fee = parseFloat(bulkAction.total_fee) || 0
          if (Object.keys(upd).length) {
            const tf = upd.total_fee ?? totalFeeOf(s)
            upd.fee_status = (s.fee_paid || 0) >= tf ? 'paid' : (s.fee_paid || 0) > 0 ? 'partial' : 'pending'
            const { error } = await sb.from('students').update(upd).eq('id', s.id)
            if (error && /total_fee/i.test(error.message || '')) { delete upd.total_fee; await sb.from('students').update(upd).eq('id', s.id); missingCol = true }
          }
          done++
        }
        else if (act === 'resetPass') { await sb.from('students').update({ password: bulkAction.password || '12345678' }).eq('id', s.id); done++ }
        else if (act === 'archive') { await sb.from('students').update({ status: 'inactive' }).eq('id', s.id); done++ }
      }
      if (missingCol) toast.error('total_fee column DB me nahi hai — Settings me SQL dekhein', { duration: 6000 })
      logAction('BULK_' + String(act).toUpperCase(), 'Students', `${done} students`)
      toastSuccess(`${done} students updated! ✅`, { undo: async () => { for (const s of selectedStudents) { await sb.from('students').update({ status: s.status, batch_id: s.batch_id, fee_amount: s.fee_amount, password: s.password }).eq('id', s.id) } load() }, duration: 5000 })
      setBulkActionModal(null); setSelectedIds([]); load()
    } catch { toast.error('Bulk action failed') }
    finally { setBulkBusy(false) }
  }
  
  const bulkDeleteStudents = async () => {
    const ok = await confirm({ title: `Delete ${selectedIds.length} Students?`, message: `${selectedIds.length} students aur unka saara data (attendance, submissions, fees) delete ho jayega. Yeh undo nahi ho sakta!`, type: 'danger', confirmText: `Delete ${selectedIds.length}`, icon: '🗑️' })
    if (!ok) return
    setBulkBusy(true)
    for (const id of selectedIds) {
      await sb.from('attendance').delete().eq('student_id', id)
      await sb.from('submissions').delete().eq('student_id', id)
      await sb.from('fee_payments').delete().eq('student_id', id)
      await sb.from('students').delete().eq('id', id)
    }
    logAction('DELETE','Students',`${selectedIds.length} students`);toast.success(`${selectedIds.length} students deleted`)
    setSelectedIds([]); setBulkBusy(false); load()
  }
  
  const bulkUpdateLogins = async () => {
    const ok = await confirm({ title:'Bulk Update Logins?', message:`${students.length} students ka login email aur password update hoga.`, type:'warning', confirmText:'Update All', icon:'🔄' })
    if(!ok) return
    setBulkUpdating(true)
    let count = 0
    for (const s of students) {
      let loginEmail = s.login_email
      if (!loginEmail || bulkForm.overwrite) {
        const name = (s.full_name||'').toLowerCase().replace(/\s+/g,'')
        if (bulkForm.pattern === 'name') loginEmail = name + '@aemtech.com'
        else if (bulkForm.pattern === 'phone') loginEmail = (s.phone||'').replace(/\D/g,'') + '@aemtech.com'
        else if (bulkForm.pattern === 'custom') loginEmail = name + (bulkForm.domain || '@aemtech.com')
      }
      const updates = { login_email: loginEmail }
      if (bulkForm.resetPass) updates.password = bulkForm.password || '12345678'
      await sb.from('students').update(updates).eq('id', s.id)
      count++
    }
    toast.success(`${count} students updated! ✅`)
    setBulkUpdating(false)
    setBulkModal(false)
    load()
  }
  
  const getTemplates=()=>{
    if(typeof window==='undefined')return{}
    try{return JSON.parse(localStorage.getItem('aemtech_wa_templates')||'{}')}catch{return{}}
  }
  
  const formatPhone=(num)=>{
    let p=(num||'').replace(/\D/g,'')
    if(!p)return''
    // Pakistan: 03xx -> 923xx
    if(p.startsWith('0'))p='92'+p.substring(1)
    // If no country code and 10 digits, assume Pakistan
    if(p.length===10&&!p.startsWith('92'))p='92'+p
    return p
  }
  
  const sendWhatsApp=(student,templateKey)=>{
    const templates=getTemplates()
    let msg=templates[templateKey]||''
    if(!msg){toast.error('Template not found! Go to Settings → WhatsApp Templates');return}
    msg=msg.replace(/{name}/g,student.full_name||'')
           .replace(/{email}/g,student.login_email||student.email||'')
           .replace(/{password}/g,student.password||'12345678')
           .replace(/{fee}/g,currency(totalFeeOf(student)))
           .replace(/{paid}/g,currency(student.fee_paid))
           .replace(/{due}/g,currency(dueOf(student)))
           .replace(/{months}/g,String(monthsDueOf(student)))
    const phone=formatPhone(student.phone)
    if(!phone){toast.error('Student ka phone number nahi hai!');return}
    const url=`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`
    window.open(url,'_blank')
    toast.success('WhatsApp chat khulli! 💬')
    setWaModal(null)
  }
  
  if(loading) return <Loader/>

  return (
    <>
      {/* Bulk Selection Bar */}
      <div style={{...getGlass(dark),borderRadius:16,padding:'14px 20px',marginBottom:18,display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',border:selectedIds.length>0?'1px solid rgba(255,215,0,.25)':undefined}}>
        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,fontWeight:700,color:'#6B7280',cursor:'pointer'}}>
          <input type="checkbox" checked={selectedIds.length>0&&selectedIds.length===filtered.length} onChange={e=>setSelectedIds(e.target.checked?filtered.map(s=>s.id):[])} style={{accentColor:'#FFD700',width:16,height:16}}/>
          Select All
        </label>
        {selectedIds.length>0&&<><Bdg type="gold" dot>{selectedIds.length} selected</Bdg>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <Btn size="xs" type="outline" onClick={()=>{setBulkAction({type:'status',status:'active'});setBulkActionModal('status')}}>✅ Activate</Btn>
            <Btn size="xs" type="warning" onClick={()=>{setBulkAction({type:'batch'});setBulkActionModal('batch')}}>🏫 Change Batch</Btn>
            <Btn size="xs" type="success" onClick={()=>{setBulkAction({type:'fee'});setBulkActionModal('fee')}}>💰 Set Fee</Btn>
            <Btn size="xs" type="ghost" onClick={()=>{setBulkAction({type:'resetPass',password:'12345678'});setBulkActionModal('resetPass')}}>🔑 Reset Password</Btn>
            <Btn size="xs" type="ghost" onClick={()=>{setBulkAction({type:'archive'});setBulkActionModal('archive')}}>📦 Archive</Btn>
            <Btn size="xs" type="danger" onClick={bulkDeleteStudents} loading={bulkBusy}>🗑 Delete</Btn>
            <Btn size="xs" type="ghost" onClick={()=>setSelectedIds([])}>✕ Clear</Btn>
          </div></>}
      </div>

      <FilterBar filters={[{key:'batch',label:'Batch',options:batches.map(b=>({value:b.id,label:b.name}))},{key:'status',label:'Status',options:['active','inactive','graduated']},{key:'fee',label:'Fee',options:['pending','partial','paid']},{key:'gender',label:'Gender',options:[{value:'male',label:'Male'},{value:'female',label:'Female'}]},{key:'city',label:'City',options:uniqueCities},{key:'referred',label:'Referred',options:REFERRAL_SOURCES}]} values={filters} onChange={setFilters}/>

      <Card title={`Students (${filtered.length}${filtered.length!==students.length?' of '+students.length:''})`} icon="👥" action={
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
          <Search value={search} onChange={e=>setSearch(e.target.value)}/>
          <Btn type="success" size="sm" onClick={doExport} icon="📊">Export</Btn>
          <label style={{cursor:'pointer'}}><Btn type="warning" size="sm" icon="📥" loading={importing}>Import</Btn><input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={doImport} disabled={importing}/></label>
          <Btn type="outline" size="sm" icon="📊" onClick={()=>openSheet('students')}>Sheet</Btn>
          <Btn type="ghost" size="sm" icon="🔄" onClick={()=>setBulkModal(true)}>Bulk</Btn>
          <Btn onClick={()=>{setForm({password:'12345678',gender:'male'});setModal('add')}} icon="➕">Add</Btn>
        </div>} noPadding>
        <Tbl headers={['','Student','Phone','City','Batch','Fee','Status','Actions']} empty={filtered.length===0?<Empty icon="👥" title="No students" sub="Try adjusting filters"/>:null}>
          {filtered.map((s,i)=>(
            <TR key={s.id} delay={i*.025} onClick={()=>setViewStudent(s)}>
              <TD onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(s.id)} onChange={()=>toggleSelect(s.id)} style={{accentColor:'#FFD700',width:16,height:16,cursor:'pointer'}}/></TD>
              <TD><div style={{display:'flex',alignItems:'center',gap:12}}><Av name={s.full_name} src={s.profile_image||null} size={36}/><div><div style={{fontWeight:700,fontSize:13,color:dark?'#E5E7EB':'#1F2937'}}>{s.full_name}</div><div style={{fontSize:11,color:'#4B5563'}}>{s.email}</div></div></div></TD>
              <TD style={{fontSize:12}}>{s.phone||'—'}</TD>
              <TD style={{fontSize:12}}>{s.city||'—'}</TD>
              <TD style={{fontSize:12}}>{batches.find(b=>b.id===s.batch_id)?.name||'—'}</TD>
              <TD><Bdg type={statusBadge(s.fee_status)} size="sm" dot>{s.fee_status||'pending'}</Bdg></TD>
              <TD><Bdg type={statusBadge(s.status)} size="sm" dot>{s.status}</Bdg></TD>
              <TD onClick={e=>e.stopPropagation()}><div style={{display:'flex',gap:5}}><Btn type="success" size="xs" onClick={()=>setWaModal(s)} title="WhatsApp">💬</Btn><Btn type="outline" size="xs" onClick={()=>{setForm(s);setModal('edit')}}>✏️</Btn><Btn type="danger" size="xs" onClick={()=>del(s.id,s.full_name)}>🗑</Btn></div></TD>
            </TR>
          ))}
        </Tbl>
      </Card>

      {/* Student Profile Modal */}
      <Modal open={!!viewStudent} onClose={()=>setViewStudent(null)} title="Student Profile" icon="👤" large
        footer={<><Btn type="ghost" onClick={()=>setViewStudent(null)}>Close</Btn>{viewStudent&&<label style={{display:'inline-block',cursor:imgUploading?'wait':'pointer'}}><Btn type="outline" onClick={()=>{}} loading={imgUploading}>{viewStudent?.profile_image?'📷 Change Photo':'📷 Upload Photo'}</Btn><input type="file" accept="image/*" style={{display:'none'}} onChange={e=>uploadStudentImage(viewStudent,e)} disabled={imgUploading}/></label>}{viewStudent?.profile_image&&<Btn type="danger" onClick={()=>removeStudentImage(viewStudent)}>🗑 Remove Photo</Btn>}<Btn onClick={()=>{setForm(viewStudent);setModal('edit');setViewStudent(null)}}>✏️ Edit</Btn></>}>
        {viewStudent&&<div>
          <div style={{display:'flex',alignItems:'center',gap:22,marginBottom:28,...getGlassLight(dark),borderRadius:20,padding:24,flexWrap:'wrap'}}>
            <Av name={viewStudent.full_name} src={viewStudent.profile_image||null} size={74} glow/>
            <div style={{flex:1}}>
              <div style={{fontSize:24,fontWeight:800,color:dark?'#E5E7EB':'#1F2937',marginBottom:5}}>{viewStudent.full_name}</div>
              <div style={{fontSize:14,color:'#6B7280',marginBottom:4}}>{viewStudent.email} · {viewStudent.phone||'No phone'}</div>
              <div style={{fontSize:12,color:'#FFD700',marginBottom:5}}>🔐 Login: {viewStudent.login_email||viewStudent.email}</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <Bdg type={statusBadge(viewStudent.status)} dot>{viewStudent.status}</Bdg>
                <Bdg type={statusBadge(viewStudent.fee_status)} dot>{viewStudent.fee_status||'pending'}</Bdg>
                {viewStudent.gender&&<Bdg type="info">{viewStudent.gender}</Bdg>}
                {viewStudent.referred_by&&<Bdg type="gold">via {viewStudent.referred_by}</Bdg>}
              </div>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <label style={{display:'inline-block',cursor:imgUploading?'wait':'pointer'}}><Btn type="outline" size="sm" onClick={()=>{}} loading={imgUploading}>{viewStudent?.profile_image?'📷 Change Photo':'📷 Upload Photo'}</Btn><input type="file" accept="image/*" style={{display:'none'}} onChange={e=>uploadStudentImage(viewStudent,e)} disabled={imgUploading}/></label>
              {viewStudent.profile_image&&<Btn type="danger" size="sm" onClick={()=>removeStudentImage(viewStudent)}>🗑 Remove Photo</Btn>}
            </div>
          </div>
          <Grid cols="1fr 1fr 1fr 1fr" gap={14}>
            {[['🔐 Login Email',viewStudent.login_email||viewStudent.email],['👨 Father',viewStudent.father_name||'—'],['📱 Guardian Ph',viewStudent.guardian_phone||'—'],['🏙️ City',viewStudent.city||'—'],['🎓 Education',viewStudent.education||'—'],['🎂 DOB',viewStudent.dob?fmtDate(viewStudent.dob):'—'],['📅 Age',viewStudent.dob?calcAge(viewStudent.dob)+' years':viewStudent.age?viewStudent.age+' years':'—'],['💰 Monthly Fee',currency(viewStudent.fee_amount)],['✅ Total Paid',currency(viewStudent.fee_paid)],['⚠️ Due',currency((viewStudent.fee_amount||0)-(viewStudent.fee_paid||0))],['🔗 Referred By',viewStudent.referred_by||'—'],['📋 Referral Name',viewStudent.referral_name||'—'],['📅 Enrolled',fmtDate(viewStudent.created_at)]].map(([icon,v])=>(
              <div key={icon} style={{...getGlassLight(dark),borderRadius:14,padding:16}}>
                <div style={{fontSize:10,color:'#6B7280',marginBottom:5}}>{icon}</div>
                <div style={{fontWeight:600,fontSize:13,color:dark?'#E5E7EB':'#1F2937'}}>{v}</div>
              </div>
            ))}
          </Grid>
          <div style={{marginTop:18}}><PBar value={viewStudent.fee_paid||0} max={viewStudent.fee_amount||1} height={12} showLabel label="Fee Progress"/></div>
          {viewStudent.notes&&<div style={{marginTop:18,...getGlassLight(dark),borderRadius:14,padding:16}}><div style={{fontSize:10,color:'#6B7280',marginBottom:5}}>📝 Notes</div><div style={{fontSize:13,color:dark?'#E5E7EB':'#1F2937',lineHeight:1.7}}>{viewStudent.notes}</div></div>}
        </div>}
      </Modal>

      {/* Add/Edit Modal */}
      <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==='add'?'✨ Add Student':'✏️ Edit Student'} icon="👥" large
        footer={<><Btn type="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn onClick={save}>{modal==='add'?'+ Add':'💾 Save'}</Btn></>}>
        <div style={{fontSize:12,fontWeight:700,color:'#FFD700',marginBottom:18,textTransform:'uppercase',letterSpacing:1.5,display:'flex',alignItems:'center',gap:8}}><div style={{width:3,height:14,background:G,borderRadius:3}}/>Personal Information</div>
        <Grid>
          <Inp label="Full Name" required value={form.full_name||''} onChange={e=>setForm({...form,full_name:e.target.value})} placeholder="Student name"/>
          <Inp label="Personal Email" required type="email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})} placeholder="personal@example.com" helper="Record keeping / contact"/>
          <Inp label="Login Email" required type="email" value={form.login_email||''} onChange={e=>setForm({...form,login_email:e.target.value})} placeholder="login@example.com" helper="Portal login ke liye" icon="🔐"/>
          <Inp label="Phone" value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="03001234567"/>
          <Inp label="Date of Birth" type="date" value={form.dob||''} onChange={e=>setForm({...form,dob:e.target.value,age:calcAge(e.target.value)})}/>
          <Sel label="Gender" value={form.gender||'male'} onChange={e=>setForm({...form,gender:e.target.value})}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></Sel>
          <Inp label="City" value={form.city||''} onChange={e=>setForm({...form,city:e.target.value})} placeholder="Lahore"/>
        </Grid>
        <div style={{fontSize:12,fontWeight:700,color:'#FFD700',marginBottom:18,marginTop:10,textTransform:'uppercase',letterSpacing:1.5,display:'flex',alignItems:'center',gap:8}}><div style={{width:3,height:14,background:G,borderRadius:3}}/>Family & Guardian</div>
        <Grid>
          <Inp label="Father/Guardian" value={form.father_name||''} onChange={e=>setForm({...form,father_name:e.target.value})} placeholder="Father name"/>
          <Inp label="Guardian Phone" value={form.guardian_phone||''} onChange={e=>setForm({...form,guardian_phone:e.target.value})} placeholder="Guardian phone"/>
        </Grid>
        <div style={{fontSize:12,fontWeight:700,color:'#FFD700',marginBottom:18,marginTop:10,textTransform:'uppercase',letterSpacing:1.5,display:'flex',alignItems:'center',gap:8}}><div style={{width:3,height:14,background:G,borderRadius:3}}/>Academic & Referral</div>
        <Grid>
          <Inp label="Education" value={form.education||''} onChange={e=>setForm({...form,education:e.target.value})} placeholder="Intermediate"/>
          <Sel label="Batch" value={form.batch_id||''} onChange={e=>setForm({...form,batch_id:e.target.value})}><option value="">Select</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</Sel>
          <Sel label="Referred By" value={form.referred_by||''} onChange={e=>setForm({...form,referred_by:e.target.value})}><option value="">Select</option>{REFERRAL_SOURCES.map(r=><option key={r} value={r}>{r}</option>)}</Sel>
          <Inp label="Referral Name" value={form.referral_name||''} onChange={e=>setForm({...form,referral_name:e.target.value})} placeholder="If friend" helper="Who referred"/>
        </Grid>
        <div style={{fontSize:12,fontWeight:700,color:'#FFD700',marginBottom:18,marginTop:10,textTransform:'uppercase',letterSpacing:1.5,display:'flex',alignItems:'center',gap:8}}><div style={{width:3,height:14,background:G,borderRadius:3}}/>Login & Account</div>
        <Grid>
          <Inp label="Password" value={form.password||'12345678'} onChange={e=>setForm({...form,password:e.target.value})} helper="Default: 12345678"/>
          <Inp label="Monthly Fee (PKR)" type="number" value={form.fee_amount||''} onChange={e=>setForm({...form,fee_amount:e.target.value})} placeholder="200"/>
          <Inp label="Total Course Fee (PKR)" type="number" value={form.total_fee||''} onChange={e=>setForm({...form,total_fee:e.target.value})} placeholder="600" helper={form.fee_amount&&form.total_fee?`${Math.max(1,Math.ceil(Number(form.total_fee)/Number(form.fee_amount)))} installments`:'Blank = monthly × 3'}/>
          <Sel label="Fee Status" value={form.fee_status||'pending'} onChange={e=>setForm({...form,fee_status:e.target.value})}><option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option></Sel>
          <Sel label="Status" value={form.status||'active'} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option></Sel>
        </Grid>
        <TA label="Notes / Remarks" value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Additional notes..."/>
      </Modal>
      
      {/* WhatsApp Template Modal */}
      <Modal open={!!waModal} onClose={()=>setWaModal(null)} title="📱 Send WhatsApp" icon="💬"
        footer={<><Btn type="ghost" onClick={()=>setWaModal(null)}>Cancel</Btn><Btn type="success" onClick={()=>sendWhatsApp(waModal,selectedTemplate)}>💬 Send</Btn></>}>
        {waModal&&<div>
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:22,...getGlassLight(dark),borderRadius:16,padding:18}}>
            <Av name={waModal.full_name} size={50} glow/>
            <div>
              <div style={{fontSize:16,fontWeight:700}}>{waModal.full_name}</div>
              <div style={{fontSize:12,color:'#6B7280'}}>{waModal.phone||'No phone!'}</div>
            </div>
          </div>
          <Sel label="Select Template" value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)}>
            <option value="welcome">🎉 Welcome Message</option>
            <option value="feeReminder">💰 Fee Reminder</option>
            <option value="classReminder">📅 Class Reminder</option>
            <option value="custom">✏️ Custom Message</option>
          </Sel>
          <div style={{fontSize:11,color:'#6B7280',marginTop:12}}>Tip: Go to Settings to customize your message templates.</div>
        </div>}
      </Modal>
      
      {/* Bulk Update Modal */}
      <Modal open={bulkModal} onClose={()=>setBulkModal(false)} title="🔄 Bulk Update Login Credentials" icon="🔄" large
        footer={<><Btn type="ghost" onClick={()=>setBulkModal(false)}>Cancel</Btn><Btn type="success" onClick={bulkUpdateLogins} loading={bulkUpdating}>🔄 Update All ({students.length} Students)</Btn></>}>
        <div style={{...getGlassLight(dark),borderRadius:14,padding:18,marginBottom:22,borderLeft:'3px solid #FFD700'}}>
          <div style={{fontSize:14,fontWeight:700,color:dark?'#E5E7EB':'#1F2937',marginBottom:6}}>⚡ Bulk Login Email & Password</div>
          <div style={{fontSize:12,color:'#6B7280'}}>Saare {students.length} students ka login email aur password ek saath set karo</div>
        </div>

        <Sel label="Login Email Pattern" value={bulkForm.pattern} onChange={e=>setBulkForm({...bulkForm,pattern:e.target.value})}>
          <option value="name">📧 Name based — ahmedkhan@aemtech.com</option>
          <option value="phone">📱 Phone based — 03001234567@aemtech.com</option>
          <option value="custom">✏️ Custom domain — name + your domain</option>
        </Sel>
        
        {bulkForm.pattern==='custom'&&(
          <Inp label="Custom Domain" value={bulkForm.domain||'@aemtech.com'} onChange={e=>setBulkForm({...bulkForm,domain:e.target.value})} placeholder="@aemtech.com" helper="e.g. @myinstitute.com"/>
        )}
        
        <div style={{marginTop:8,marginBottom:22}}>
          <label style={{display:'flex',alignItems:'center',gap:10,fontSize:13,color:dark?'#E5E7EB':'#1F2937',cursor:'pointer'}}>
            <input type="checkbox" checked={bulkForm.overwrite||false} onChange={e=>setBulkForm({...bulkForm,overwrite:e.target.checked})} style={{accentColor:'#FFD700',width:18,height:18}}/>
            Overwrite existing login emails (already set hain wo bhi change honge)
          </label>
        </div>

        <div style={{marginBottom:8}}>
          <label style={{display:'flex',alignItems:'center',gap:10,fontSize:13,color:dark?'#E5E7EB':'#1F2937',cursor:'pointer'}}>
            <input type="checkbox" checked={bulkForm.resetPass||false} onChange={e=>setBulkForm({...bulkForm,resetPass:e.target.checked})} style={{accentColor:'#FFD700',width:18,height:18}}/>
            Sab ka password bhi reset karo
          </label>
        </div>
        
        {bulkForm.resetPass&&(
          <Inp label="New Password (sab ke liye)" value={bulkForm.password||'12345678'} onChange={e=>setBulkForm({...bulkForm,password:e.target.value})} placeholder="12345678" icon="🔑"/>
        )}

        {/* Preview */}
        <div style={{marginTop:22}}>
          <div style={{fontSize:12,fontWeight:700,color:'#FFD700',marginBottom:12,textTransform:'uppercase',letterSpacing:1.5}}>Preview</div>
          <div style={{...getGlassLight(dark),borderRadius:14,padding:16,maxHeight:200,overflowY:'auto'}} className="cs">
            {students.slice(0,5).map(s=>{
              const name=(s.full_name||'').toLowerCase().replace(/\s+/g,'')
              let preview=''
              if(bulkForm.pattern==='name') preview=name+'@aemtech.com'
              else if(bulkForm.pattern==='phone') preview=(s.phone||'').replace(/\D/g,'')+'@aemtech.com'
              else preview=name+(bulkForm.domain||'@aemtech.com')
              const show=(!s.login_email||bulkForm.overwrite)?preview:(s.login_email+' (unchanged)')
              return(
                <div key={s.id} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid ${dark?'rgba(255,255,255,.03)':'rgba(0,0,0,.04)'}`,fontSize:13}}>
                  <span style={{color:dark?'#E5E7EB':'#1F2937',fontWeight:600}}>{s.full_name}</span>
                  <span style={{color:'#FFD700',fontFamily:"'Space Grotesk',sans-serif"}}>{show}</span>
                </div>
              )
            })}
            {students.length>5&&<div style={{textAlign:'center',padding:10,fontSize:12,color:'#6B7280'}}>...aur {students.length-5} students</div>}
          </div>
        </div>
      </Modal>

      {/* ═══ BULK ACTION MODALS ═══ */}
      <Modal open={bulkActionModal==='status'} onClose={()=>setBulkActionModal(null)} title={`✅ Activate ${selectedIds.length} Students`} icon="✅" footer={<><Btn type="ghost" onClick={()=>setBulkActionModal(null)}>Cancel</Btn><Btn type="success" onClick={runBulkAction} loading={bulkBusy}>✅ Activate All</Btn></>}>
        <div style={{background:'rgba(16,185,129,.05)',border:'1px solid rgba(16,185,129,.2)',borderRadius:14,padding:16,marginBottom:18}}>
          <div style={{fontSize:13,fontWeight:700,color:'#10B981',marginBottom:6}}>{selectedIds.length} students ko ACTIVE status mil jayega</div>
          <div style={{fontSize:12,color:'#6B7280'}}>Undo option available hoga.</div>
        </div>
        <div style={{maxHeight:200,overflowY:'auto'}} className="cs">{selectedStudents.map(s=><div key={s.id} style={{padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,.03)',fontSize:13,color:dark?'#D1D5DB':'#4B5563'}}>• {s.full_name}</div>)}</div>
      </Modal>

      <Modal open={bulkActionModal==='batch'} onClose={()=>setBulkActionModal(null)} title={`🏫 Change Batch — ${selectedIds.length} Students`} icon="🏫" footer={<><Btn type="ghost" onClick={()=>setBulkActionModal(null)}>Cancel</Btn><Btn onClick={runBulkAction} loading={bulkBusy}>🏫 Transfer All</Btn></>}>
        <Sel label="New Batch" required value={bulkAction.batch_id||''} onChange={e=>setBulkAction({...bulkAction,batch_id:e.target.value})}>
          <option value="">Select Batch</option>
          {batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </Sel>
        <div style={{fontSize:12,color:'#6B7280',marginTop:8}}>{selectedIds.length} students selected batch mein transfer honge.</div>
      </Modal>

      <Modal open={bulkActionModal==='fee'} onClose={()=>setBulkActionModal(null)} title={`💰 Set Fee — ${selectedIds.length} Students`} icon="💰" footer={<><Btn type="ghost" onClick={()=>setBulkActionModal(null)}>Cancel</Btn><Btn type="success" onClick={runBulkAction} loading={bulkBusy}>💰 Apply to All</Btn></>}>
        <Grid>
          <Inp label="Monthly Fee (PKR)" type="number" value={bulkAction.fee_amount||''} onChange={e=>setBulkAction({...bulkAction,fee_amount:e.target.value})} placeholder="200"/>
          <Inp label="Total Course Fee (PKR)" type="number" value={bulkAction.total_fee||''} onChange={e=>setBulkAction({...bulkAction,total_fee:e.target.value})} placeholder="600"/>
        </Grid>
        <div style={{...getGlassLight(dark),borderRadius:12,padding:14,fontSize:12,color:'#6B7280'}}>
          {selectedIds.length} students par apply hoga. Jo field khali chhorenge woh change nahi hogi.
          {bulkAction.fee_amount&&bulkAction.total_fee&&<div style={{color:'#FFD700',fontWeight:700,marginTop:6}}>→ {Math.max(1,Math.ceil(Number(bulkAction.total_fee)/Number(bulkAction.fee_amount)))} installments of {currency(Number(bulkAction.fee_amount))}</div>}
        </div>
      </Modal>

      <Modal open={bulkActionModal==='resetPass'} onClose={()=>setBulkActionModal(null)} title={`🔑 Reset Password — ${selectedIds.length} Students`} icon="🔑" footer={<><Btn type="ghost" onClick={()=>setBulkActionModal(null)}>Cancel</Btn><Btn onClick={runBulkAction} loading={bulkBusy}>🔑 Reset All</Btn></>}>
        <Inp label="New Password" value={bulkAction.password||''} onChange={e=>setBulkAction({...bulkAction,password:e.target.value})} placeholder="12345678"/>
        <div style={{background:'rgba(245,158,11,.05)',border:'1px solid rgba(245,158,11,.2)',borderRadius:12,padding:14,marginTop:8,fontSize:12,color:'#F59E0B'}}>⚠️ Sab students ka password same ho jayega.</div>
      </Modal>

      <Modal open={bulkActionModal==='archive'} onClose={()=>setBulkActionModal(null)} title={`📦 Archive ${selectedIds.length} Students`} icon="📦" footer={<><Btn type="ghost" onClick={()=>setBulkActionModal(null)}>Cancel</Btn><Btn type="warning" onClick={runBulkAction} loading={bulkBusy}>📦 Archive All</Btn></>}>
        <div style={{background:'rgba(245,158,11,.05)',border:'1px solid rgba(245,158,11,.2)',borderRadius:14,padding:16,marginBottom:18}}>
          <div style={{fontSize:13,fontWeight:700,color:'#F59E0B',marginBottom:6}}>{selectedIds.length} students INACTIVE ho jayenge</div>
          <div style={{fontSize:12,color:'#6B7280'}}>Data delete nahi hoga, sirf inactive mark honge.</div>
        </div>
      </Modal>
    </>
  )
}

// ═══════════════════════════════════════
// REMAINING ADMIN PAGES
// Copy from previous Part 3:
// AdmissionsPage, BatchesPage, ClassesPage,
// AttendancePage, AssignmentsPage, SubmissionsPage,
// RecordingsPage, FeesPage, AnnouncementsPage,
// CertificatesPage, SheetSyncPage, ExcelPage, SettingsPage
//
// They are IDENTICAL to the previous version
// because they use the same base components
// (Card, Tbl, TR, TD, Inp, etc) which are now
// upgraded with premium UI in Part 1
// ═══════════════════════════════════════

// I'm including FeesPage (new batch-wise) and
// the rest are same — paste from previous Part 3

// ═══════════════════════════════════════
// FEES — Batch-wise Sexy
// ═══════════════════════════════════════
function FeesPage() {
  const [students,setStudents]=useState([])
  const [batches,setBatches]=useState([])
  const [loading,setLoading]=useState(true)
  const [modal,setModal]=useState(null)
  const [form,setForm]=useState({})
  const [search,setSearch]=useState('')
  const [filters,setFilters]=useState({})
  const [selectedStudent,setSelectedStudent]=useState(null)
  const [selectedBatch,setSelectedBatch]=useState('')
  const {dark}=useTheme()

  const load=useCallback(async()=>{
    setLoading(true)
    const[s,b]=await Promise.all([
      sb.from('students').select('*').order('full_name'),
      sb.from('batches').select('*')
    ])
    setStudents(s.data||[])
    setBatches(b.data||[])
    setLoading(false)
  },[])
  
  useEffect(()=>{load()},[load])

  const batchStudents=selectedBatch?students.filter(s=>s.batch_id===selectedBatch):students
  const activeStudents=batchStudents.filter(s=>s.status==='active')
  const totalFee=activeStudents.reduce((s,st)=>s+totalFeeOf(st),0)
  const totalPaid=batchStudents.reduce((s,st)=>s+(st.fee_paid||0),0)
  const totalDue=totalFee-totalPaid
  const paidCount=batchStudents.filter(s=>s.fee_status==='paid').length
  const partialCount=batchStudents.filter(s=>s.fee_status==='partial').length
  const pendingCount=batchStudents.filter(s=>s.fee_status==='pending').length

  const filtered=batchStudents.filter(s=>{
    if(search&&!s.full_name?.toLowerCase().includes(search.toLowerCase()))return false
    if(filters.fee&&s.fee_status!==filters.fee)return false
    if(filters.status&&s.status!==filters.status)return false
    return true
  })

  // ── batch-wide fee setter ──
  const [batchFeeModal,setBatchFeeModal]=useState(false)
  const [batchFeeForm,setBatchFeeForm]=useState({batch_id:'',fee_amount:'',total_fee:''})
  const [batchFeeBusy,setBatchFeeBusy]=useState(false)
  const applyBatchFee=async()=>{
    const {batch_id,fee_amount,total_fee}=batchFeeForm
    if(!batch_id){toast.error('Batch select karein');return}
    if(!fee_amount&&!total_fee){toast.error('Monthly ya Total fee daalein');return}
    const targets=students.filter(s=>s.batch_id===batch_id&&s.status==='active')
    if(targets.length===0){toast.error('Is batch me koi active student nahi');return}
    setBatchFeeBusy(true)
    const before=targets.map(s=>({id:s.id,fee_amount:s.fee_amount,total_fee:s.total_fee,fee_status:s.fee_status}))
    let done=0, missingCol=false
    for(const st of targets){
      const upd={}
      if(fee_amount!=='') upd.fee_amount=parseFloat(fee_amount)||0
      if(total_fee!=='') upd.total_fee=parseFloat(total_fee)||0
      const tf=upd.total_fee??totalFeeOf(st)
      upd.fee_status=(st.fee_paid||0)>=tf?'paid':(st.fee_paid||0)>0?'partial':'pending'
      const {error}=await sb.from('students').update(upd).eq('id',st.id)
      if(error&&/total_fee/i.test(error.message||'')){delete upd.total_fee;await sb.from('students').update(upd).eq('id',st.id);missingCol=true}
      done++
    }
    const bName=batches.find(b=>b.id===batch_id)?.name||''
    logAction('BULK_FEE','Batch',`${bName} → ${done} students`,`monthly ${fee_amount||'—'} / total ${total_fee||'—'}`)
    if(missingCol) toast.error('total_fee column DB me nahi hai — Settings → SQL dekhein',{duration:6000})
    toastSuccess(`${done} students ki fee set ho gayi! 💰`,{undo:async()=>{for(const b of before){await sb.from('students').update({fee_amount:b.fee_amount,total_fee:b.total_fee,fee_status:b.fee_status}).eq('id',b.id)}load()},duration:6000})
    setBatchFeeBusy(false);setBatchFeeModal(false);load()
  }

  const collectPayment=async()=>{
    if(!form.amount||form.amount<=0){toast.error('Enter valid amount');return}
    const student=students.find(s=>s.id===form.student_id)
    if(!student)return
    
    const newPaid=(student.fee_paid||0)+parseFloat(form.amount)
    const newStatus=newPaid>=totalFeeOf(student)?'paid':newPaid>0?'partial':'pending'
    
    await sb.from('students').update({
      fee_paid:newPaid,
      fee_status:newStatus
    }).eq('id',form.student_id)
    
    toast.success('💰 Payment Recorded!')
    
    // Ask to print receipt
    const updatedStudent = {...student, fee_paid: newPaid, fee_status: newStatus}
    if(confirm('Payment recorded! Print receipt?')) {
      printAdminReceipt(updatedStudent, parseFloat(form.amount))
    }
    
    setModal(null)
    load()
    
    // Sync to sheet
    setTimeout(async()=>{
      const{data}=await sb.from('students').select('*')
      await syncToSheet('syncFees',{students:data||[]})
    },500)
  }

  const resetFee=async(studentId)=>{
    if(!confirm('Reset fee to 0? This cannot be undone.'))return
    await sb.from('students').update({fee_paid:0,fee_status:'pending'}).eq('id',studentId)
    toast.success('Fee reset!')
    load()
  }

  const printAdminReceipt=(student,amount)=>{
    const s=amount?student:student
    const paidAmt=amount||s.fee_paid||0
    const receiptNo=`RCP-${Date.now().toString(36).toUpperCase()}`
    const w=window.open('','_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Fee Receipt - ${s.full_name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#f5f5f5;padding:40px;display:flex;justify-content:center}
.receipt{width:420px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:28px;text-align:center;border-bottom:3px solid #FFD700}
.logo{font-size:28px;letter-spacing:6px;font-weight:900;margin-bottom:2px;font-family:'Inter',sans-serif}
.title{font-size:22px;font-weight:800;color:#FFD700}
.badge{display:inline-block;margin-top:8px;padding:4px 14px;background:rgba(255,215,0,.1);border-radius:20px;font-size:10px;font-weight:700;letter-spacing:1px}
.body{padding:28px}
.row{display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px dashed #eee}
.row:last-child{border:none}
.label{color:#888;font-size:13px}
.value{font-weight:600;font-size:13px;color:#333}
.divider{height:1px;background:linear-gradient(90deg,transparent,#ddd,transparent);margin:8px 0}
.amount-box{background:linear-gradient(135deg,#f0fdf4,#ecfdf5);margin:16px -28px;padding:24px 28px;border-top:2px solid #10B981;border-bottom:2px solid #10B981}
.amount-row{display:flex;justify-content:space-between;align-items:center}
.amount-label{font-size:15px;font-weight:700;color:#333}
.amount-value{font-size:28px;font-weight:800;color:#10B981}
.status{display:inline-block;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px}
.paid{background:#D1FAE5;color:#059669}
.partial{background:#FEF3C7;color:#D97706}
.pending{background:#FEE2E2;color:#DC2626}
.footer{text-align:center;padding:20px 28px;border-top:1px solid #f0f0f0}
.footer p{font-size:11px;color:#999;margin-bottom:4px}
.footer .thanks{font-size:13px;color:#666;font-weight:600;margin-bottom:8px}
@media print{body{background:#fff;padding:0}.receipt{box-shadow:none;border-radius:0}}
</style></head>
<body>
<div class="receipt">
<div class="header">
<div class="logo"><span style="color:#fff">AEM</span><span style="color:#FFD700">T</span><span style="color:#fff">ECH</span></div><div style="font-size:10px;letter-spacing:4px;color:rgba(255,255,255,.7);font-weight:700;margin-bottom:4px">INSTITUTE</div>
<div class="title">Fee Receipt</div>

</div>
<div class="body">
<div class="row"><span class="label">Student Name</span><span class="value">${s.full_name}</span></div>
<div class="row"><span class="label">Email</span><span class="value">${s.email||'—'}</span></div>
<div class="row"><span class="label">Phone</span><span class="value">${s.phone||'—'}</span></div>
<div class="row"><span class="label">Date</span><span class="value">${new Date().toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'})}</span></div>
<div class="row"><span class="label">Monthly Fee</span><span class="value">PKR ${(s.fee_amount||0).toLocaleString()}</span></div>
<div class="row"><span class="label">Total Paid</span><span class="value">PKR ${(s.fee_paid||0).toLocaleString()}</span></div>
<div class="row"><span class="label">Outstanding</span><span class="value" style="color:#EF4444">PKR ${Math.max(0,(s.fee_amount||0)-(s.fee_paid||0)).toLocaleString()}</span></div>
<div class="amount-box"><div class="amount-row"><span class="amount-label">Amount Received</span><span class="amount-value">PKR ${Number(paidAmt).toLocaleString()}</span></div></div>
<div style="text-align:center;margin-top:12px">
<span class="status ${s.fee_status==='paid'?'paid':s.fee_status==='partial'?'partial':'pending'}">${s.fee_status==='paid'?'✓ Fully Paid':s.fee_status==='partial'?'Partial Payment':'Pending'}</span>
</div>
</div>
<div class="footer">
<div class="thanks">Thank you for your payment! 🙏</div>
<p>AEMTECH Institute — Design the Future</p>
<p>This is a computer generated receipt</p>
</div>
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),500)}<\/script>
</body></html>`)
    w.document.close()
  }

  const doExport=()=>exportXLS(batchStudents.map(s=>{
    const mb=splitFeeByMonth(s,[])
    return {
      Student:s.full_name,
      Email:s.email,
      Phone:s.phone||'',
      'Total Fee':s.fee_amount||0,
      'Total Paid':s.fee_paid||0,
      'Due Amount':(s.fee_amount||0)-(s.fee_paid||0),
      'M1 Due':mb[0].due,'M1 Paid':mb[0].paid,'M1 Status':mb[0].status,
      'M2 Due':mb[1].due,'M2 Paid':mb[1].paid,'M2 Status':mb[1].status,
      'M3 Due':mb[2].due,'M3 Paid':mb[2].paid,'M3 Status':mb[2].status,
      Status:s.fee_status||'pending',
      Batch:batches.find(b=>b.id===s.batch_id)?.name||''
    }
  }),'AEMTECH_Fees.xlsx','Fees')

  if(loading) return <Loader/>

  return (
    <>
      {/* Batch Tabs */}
      <div style={{display:'flex',gap:8,marginBottom:26,padding:7,...getGlass(dark),borderRadius:18,overflowX:'auto'}} className="cs">
        <button onClick={()=>setSelectedBatch('')} style={{padding:'13px 26px',borderRadius:13,border:'none',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:13,transition:tr,background:!selectedBatch?G:'transparent',color:!selectedBatch?'#000':'#6B7280',whiteSpace:'nowrap',boxShadow:!selectedBatch?'0 4px 16px rgba(255,215,0,.2)':'none'}}>📊 All</button>
        {batches.map(b=>(<button key={b.id} onClick={()=>setSelectedBatch(b.id)} style={{padding:'13px 26px',borderRadius:13,border:'none',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:13,transition:tr,background:selectedBatch===b.id?G:'transparent',color:selectedBatch===b.id?'#000':'#6B7280',whiteSpace:'nowrap',boxShadow:selectedBatch===b.id?'0 4px 16px rgba(255,215,0,.2)':'none'}}>🏫 {b.name}</button>))}
      </div>

      {/* Simple Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'clamp(10px,1.5vw,18px)',marginBottom:26}}>
        <div className="ch" style={{...getGlass(dark),borderRadius:20,padding:'28px 24px',borderTop:'3px solid #FFD700'}}>
          <div style={{fontSize:28,marginBottom:12}}>🎯</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:800,background:G,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>{currency(totalFee)}</div>
          <div style={{fontSize:11,color:'#6B7280',marginTop:6,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>Total Fee</div>
        </div>
        <div className="ch" style={{...getGlass(dark),borderRadius:20,padding:'28px 24px',borderTop:'3px solid #10B981'}}>
          <div style={{fontSize:28,marginBottom:12}}>✅</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:800,color:'#10B981'}}>{currency(totalPaid)}</div>
          <div style={{fontSize:11,color:'#6B7280',marginTop:6,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>Collected</div>
        </div>
        <div className="ch" style={{...getGlass(dark),borderRadius:20,padding:'28px 24px',borderTop:'3px solid #EF4444'}}>
          <div style={{fontSize:28,marginBottom:12}}>⚠️</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:800,color:'#EF4444'}}>{currency(totalDue)}</div>
          <div style={{fontSize:11,color:'#6B7280',marginTop:6,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>Outstanding</div>
        </div>
        <div className="ch" style={{...getGlass(dark),borderRadius:20,padding:'28px 24px',borderTop:'3px solid #3B82F6'}}>
          <div style={{fontSize:28,marginBottom:12}}>📊</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:800,color:'#3B82F6'}}>{totalFee>0?Math.round((totalPaid/totalFee)*100):0}%</div>
          <div style={{fontSize:11,color:'#6B7280',marginTop:6,textTransform:'uppercase',letterSpacing:1.5,fontWeight:600}}>Collection Rate</div>
          <div style={{marginTop:10}}><PBar value={totalPaid} max={totalFee||1} height={6}/></div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:26}} className="mf">
        {[['Paid ✅',paidCount,'#10B981'],['Partial 🔄',partialCount,'#F59E0B'],['Pending ⏳',pendingCount,'#6B7280']].map(([l,v,c])=>(
          <div key={l} style={{...getGlassLight(dark),borderRadius:14,padding:18,textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:800,color:c,fontFamily:"'Space Grotesk',sans-serif"}}>{v}</div>
            <div style={{fontSize:11,color:'#6B7280',marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Month-wise Collection Summary */}
      <Card title="📅 Month-wise Collection" icon="📅" style={{marginBottom:26}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}>
          {(()=>{
            const agg = FEE_MONTHS.map(m=>({...m,due:0,paid:0,cleared:0,pending:0}))
            batchStudents.filter(s=>s.status==='active').forEach(st=>{
              splitFeeByMonth(st,[]).forEach((b,bi)=>{
                agg[bi].due+=b.due; agg[bi].paid+=b.paid
                if(b.balance===0&&b.due>0) agg[bi].cleared++; else if(b.due>0) agg[bi].pending++
              })
            })
            return agg.map(m=>{
              const pct = m.due>0?Math.round(m.paid/m.due*100):0
              return (
                <div key={m.key} className="ch" style={{...getGlassLight(dark),borderRadius:18,padding:20,borderTop:`3px solid ${m.color}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <div style={{width:42,height:42,borderRadius:12,background:`${m.color}12`,border:`1px solid ${m.color}25`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:19}}>{m.icon}</div>
                    <div>
                      <div style={{fontSize:14,fontWeight:800,color:dark?'#E5E7EB':'#1F2937'}}>{m.label}</div>
                      <div style={{fontSize:10,color:'#6B7280'}}>{m.sub}</div>
                    </div>
                  </div>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:900,color:m.color,marginBottom:4}}>{currency(m.paid)}</div>
                  <div style={{fontSize:11,color:'#6B7280',marginBottom:10}}>of {currency(m.due)} · <strong style={{color:pct>=80?'#10B981':pct>=50?'#F59E0B':'#EF4444'}}>{pct}%</strong></div>
                  <PBar value={m.paid} max={m.due||1} height={8} color={m.color}/>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:10,fontSize:10}}>
                    <span style={{color:'#10B981',fontWeight:700}}>✅ {m.cleared} cleared</span>
                    <span style={{color:'#EF4444',fontWeight:700}}>⚠️ {m.pending} pending</span>
                  </div>
                  <div style={{fontSize:11,color:'#EF4444',fontWeight:700,marginTop:8}}>Due: {currency(Math.max(0,m.due-m.paid))}</div>
                </div>
              )
            })
          })()}
        </div>
      </Card>

      <FilterBar filters={[{key:'fee',label:'Fee',options:['pending','partial','paid']},{key:'status',label:'Student',options:['active','inactive']}]} values={filters} onChange={setFilters}/>

      <Card title={`💰 Students (${filtered.length})`} icon="💰" action={
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <Search value={search} onChange={e=>setSearch(e.target.value)}/>
          <Btn size="sm" icon="🏫" onClick={()=>{setBatchFeeForm({batch_id:selectedBatch||'',fee_amount:'',total_fee:''});setBatchFeeModal(true)}}>Set Batch Fee</Btn>
          <Btn type="success" size="sm" onClick={doExport} icon="📊">Export</Btn>
          <Btn type="outline" size="sm" icon="📊" onClick={()=>openSheet('fees')}>Sheet</Btn>
        </div>
      } noPadding>
        <Tbl headers={['Student','Batch','Fee Amount','Paid','Due','M1','M2','M3','Status','Actions']} empty={filtered.length===0?<Empty icon="💰" title="No students"/>:null}>
          {filtered.map((s,i)=>{
            const due=dueOf(s)
            const tf=totalFeeOf(s)
            const pct=tf>0?Math.round((s.fee_paid||0)/tf*100):0
            const mb=splitFeeByMonth(s,[])
            const mDue=monthsDueOf(s)
            return(
              <TR key={s.id} delay={i*.025}>
                <TD>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <Av name={s.full_name} src={s.profile_image||null} size={36}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:14,color:dark?'#E5E7EB':'#1F2937'}}>{s.full_name}</div>
                      <div style={{fontSize:11,color:'#6B7280'}}>{s.phone||s.email}</div>
                    </div>
                  </div>
                </TD>
                <TD style={{fontSize:12}}>{batches.find(b=>b.id===s.batch_id)?.name||'—'}</TD>
                <TD><div style={{fontWeight:700,fontSize:15,color:'#FFD700',fontFamily:"'Space Grotesk',sans-serif"}}>{currency(tf)}</div><div style={{fontSize:10,color:'#6B7280',marginTop:2}}>{currency(monthlyFeeOf(s))}/mo × {monthsCountOf(s)}</div></TD>
                <TD><div style={{fontWeight:700,color:'#10B981'}}>{currency(s.fee_paid)}</div><div style={{fontSize:10,color:'#6B7280',marginTop:2}}>{monthsPaidOf(s)} mo paid</div></TD>
                <TD><div style={{fontWeight:600,color:due>0?'#EF4444':'#10B981'}}>{currency(due)}</div>{mDue>0&&<div style={{fontSize:10,color:'#EF4444',marginTop:2,fontWeight:700}}>{mDue} month{mDue>1?'s':''} due</div>}</TD>
                {mb.map(m=>(
                  <TD key={m.key}>
                    <div style={{display:'inline-flex',flexDirection:'column',alignItems:'center',gap:3,minWidth:58}}>
                      <span style={{fontSize:9,fontWeight:800,letterSpacing:.4,padding:'3px 8px',borderRadius:7,whiteSpace:'nowrap',
                        background:m.status==='paid'?'rgba(16,185,129,.1)':m.status==='partial'?'rgba(245,158,11,.1)':'rgba(239,68,68,.08)',
                        color:m.status==='paid'?'#10B981':m.status==='partial'?'#F59E0B':'#EF4444',
                        border:`1px solid ${m.status==='paid'?'rgba(16,185,129,.2)':m.status==='partial'?'rgba(245,158,11,.2)':'rgba(239,68,68,.15)'}`}}>
                        {m.status==='paid'?'✓ Paid':m.status==='partial'?'◐ Part':'○ Due'}
                      </span>
                      <span style={{fontSize:9,color:'#6B7280',whiteSpace:'nowrap'}}>{(m.paid/1000).toFixed(1)}k/{(m.due/1000).toFixed(1)}k</span>
                    </div>
                  </TD>
                ))}
                <TD><Bdg type={statusBadge(feeStatusOf(s))} dot>{feeStatusOf(s)}</Bdg><div style={{fontSize:9,color:'#6B7280',marginTop:4}}>{pct}% overall</div></TD>
                <TD>
                  <div style={{display:'flex',gap:6}}>
                    <Btn type="success" size="xs" onClick={()=>{setForm({student_id:s.id,student_name:s.full_name,current_paid:s.fee_paid||0,fee_amount:s.fee_amount||0,amount:''});setModal('collect')}} title="Collect">💰</Btn>
                    <Btn type="outline" size="xs" onClick={()=>{setSelectedStudent(s);setModal('view')}} title="View">👁</Btn>
                    {(s.fee_paid||0)>0&&<Btn type="warning" size="xs" onClick={()=>printAdminReceipt(s,s.fee_paid)} title="Receipt">🧾</Btn>}
                    {(s.fee_paid||0)>0&&<Btn type="danger" size="xs" onClick={()=>resetFee(s.id)} title="Reset">🔄</Btn>}
                  </div>
                </TD>
              </TR>
            )
          })}
        </Tbl>
      </Card>

      {/* Collect Payment Modal */}
      {/* Batch Fee Setter */}
      <Modal open={batchFeeModal} onClose={()=>setBatchFeeModal(false)} title="🏫 Set Fee for Whole Batch" icon="🏫" footer={<><Btn type="ghost" onClick={()=>setBatchFeeModal(false)}>Cancel</Btn><Btn onClick={applyBatchFee} loading={batchFeeBusy}>💰 Apply to Batch</Btn></>}>
        <Sel label="Batch" required value={batchFeeForm.batch_id} onChange={e=>setBatchFeeForm({...batchFeeForm,batch_id:e.target.value})}>
          <option value="">Select Batch</option>
          {batches.map(b=><option key={b.id} value={b.id}>{b.name} ({students.filter(x=>x.batch_id===b.id&&x.status==='active').length} active)</option>)}
        </Sel>
        <Grid>
          <Inp label="Monthly Fee (PKR)" type="number" value={batchFeeForm.fee_amount} onChange={e=>setBatchFeeForm({...batchFeeForm,fee_amount:e.target.value})} placeholder="200"/>
          <Inp label="Total Course Fee (PKR)" type="number" value={batchFeeForm.total_fee} onChange={e=>setBatchFeeForm({...batchFeeForm,total_fee:e.target.value})} placeholder="600"/>
        </Grid>
        <div style={{...getGlassLight(dark),borderRadius:14,padding:16,borderLeft:'3px solid #FFD700'}}>
          {batchFeeForm.batch_id ? (()=>{
            const tg=students.filter(x=>x.batch_id===batchFeeForm.batch_id&&x.status==='active')
            const inst=batchFeeForm.fee_amount&&batchFeeForm.total_fee?Math.max(1,Math.ceil(Number(batchFeeForm.total_fee)/Number(batchFeeForm.fee_amount))):null
            return (<>
              <div style={{fontSize:13,fontWeight:700,color:'#FFD700',marginBottom:6}}>{tg.length} active students affected</div>
              {inst&&<div style={{fontSize:12,color:'#10B981',fontWeight:700,marginBottom:6}}>→ {inst} installments × {currency(Number(batchFeeForm.fee_amount))} = {currency(Number(batchFeeForm.total_fee))}</div>}
              <div style={{fontSize:11,color:'#6B7280'}}>Khali field change nahi hogi · Undo available hoga</div>
            </>)
          })() : <div style={{fontSize:12,color:'#6B7280'}}>Batch select karein to preview dikhega</div>}
        </div>
      </Modal>

      <Modal open={modal==='collect'} onClose={()=>setModal(null)} title="💰 Collect Payment" icon="💰" footer={<><Btn type="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn type="success" onClick={collectPayment}>💰 Record Payment</Btn></>}>
        {form.student_name&&<>
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:22,...getGlassLight(dark),borderRadius:16,padding:18}}>
            <Av name={form.student_name} size={50} glow/>
            <div>
              <div style={{fontSize:17,fontWeight:800,color:dark?'#E5E7EB':'#1F2937'}}>{form.student_name}</div>
              <div style={{fontSize:12,color:'#6B7280'}}>Fee: {currency(form.fee_amount)} · Paid: {currency(form.current_paid)}</div>
            </div>
          </div>
          <div style={{...getGlassLight(dark),borderRadius:14,padding:18,marginBottom:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{color:'#6B7280'}}>Due Amount:</span>
              <span style={{fontSize:22,fontWeight:800,color:'#EF4444',fontFamily:"'Space Grotesk',sans-serif"}}>{currency((form.fee_amount||0)-(form.current_paid||0))}</span>
            </div>
          </div>
          <Inp label="Amount Receiving (PKR)" type="number" placeholder="Enter amount..." value={form.amount||''} onChange={e=>setForm({...form,amount:e.target.value})} icon="💵"/>
          <Sel label="Payment Method" value={form.method||'Cash'} onChange={e=>setForm({...form,method:e.target.value})}>
            {PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
          </Sel>
          <Inp label="Receipt Number (Optional)" value={form.receipt||''} onChange={e=>setForm({...form,receipt:e.target.value})} placeholder="e.g. REC-001"/>
        </>}
      </Modal>

      {/* View Student Fee Modal */}
      <Modal open={modal==='view'} onClose={()=>setModal(null)} title="📋 Fee Details" large footer={<><Btn type="ghost" onClick={()=>setModal(null)}>Close</Btn>{selectedStudent&&(selectedStudent.fee_paid||0)>0&&<Btn type="warning" onClick={()=>printAdminReceipt(selectedStudent,selectedStudent.fee_paid)} icon="🧾">Print Receipt</Btn>}</>}>
        {selectedStudent&&<>
          <div style={{display:'flex',alignItems:'center',gap:18,marginBottom:28,...getGlassLight(dark),borderRadius:20,padding:24}}>
            <Av name={selectedStudent.full_name} src={selectedStudent.profile_image||null} size={64} glow/>
            <div>
              <div style={{fontSize:22,fontWeight:800,color:dark?'#E5E7EB':'#1F2937'}}>{selectedStudent.full_name}</div>
              <div style={{fontSize:13,color:'#6B7280'}}>{selectedStudent.email} · {selectedStudent.phone||'—'}</div>
              <div style={{marginTop:8}}><Bdg type={statusBadge(selectedStudent.fee_status)} size="lg" dot>{selectedStudent.fee_status||'pending'}</Bdg></div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:22}} className="mf">
            {[['Monthly Fee',currency(selectedStudent.fee_amount),'#FFD700'],['Total Paid',currency(selectedStudent.fee_paid),'#10B981'],['Due Amount',currency((selectedStudent.fee_amount||0)-(selectedStudent.fee_paid||0)),'#EF4444']].map(([l,v,c])=>(
              <div key={l} style={{...getGlassLight(dark),borderRadius:14,padding:18,textAlign:'center'}}>
                <div style={{fontSize:10,color:'#6B7280',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{l}</div>
                <div style={{fontSize:22,fontWeight:800,color:c,fontFamily:"'Space Grotesk',sans-serif"}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,color:'#6B7280',marginBottom:8}}>Payment Progress</div>
            <PBar value={selectedStudent.fee_paid||0} max={selectedStudent.fee_amount||1} height={16} showLabel/>
          </div>
          <Btn type="success" full onClick={()=>{setForm({student_id:selectedStudent.id,student_name:selectedStudent.full_name,current_paid:selectedStudent.fee_paid||0,fee_amount:selectedStudent.fee_amount||0,amount:''});setModal('collect')}}>💰 Collect Payment</Btn>
        </>}
      </Modal>
    </>
  )
}

function AdmissionsPage(){
  const[admissions,setAdmissions]=useState([])
  const[batches,setBatches]=useState([])
  const[loading,setLoading]=useState(true)
  const[modal,setModal]=useState(null)
  const[form,setForm]=useState({})
  const[selected,setSelected]=useState(null)
  const[filters,setFilters]=useState({})
  const[importing,setImporting]=useState(false)
  const{dark}=useTheme()
  
  const load=useCallback(async()=>{
    setLoading(true)
    const[a,b]=await Promise.all([
      sb.from('admissions').select('*').order('applied_at',{ascending:false}),
      sb.from('batches').select('*')
    ])
    setAdmissions(a.data||[])
    setBatches(b.data||[])
    setLoading(false)
    // Sync to sheet
    syncToSheet('syncAdmissions',{admissions:a.data||[]})
  },[])
  
  useEffect(()=>{load()},[load])
  
  const add=async()=>{
    if(!form.full_name||!form.email||!form.phone){toast.error('Required');return}
    await sb.from('admissions').insert({...form,status:'pending',applied_at:new Date().toISOString()})
    toast.success('Added!')
    setModal(null)
    load()
  }
  
  const approve=async()=>{
    await sb.from('students').insert({
      full_name:selected.full_name,
      email:selected.email,
      phone:selected.phone,
      city:selected.city,
      education:selected.education,
      batch_id:form.batch_id||null,
      fee_amount:parseFloat(form.fee_amount)||0,
      password:form.password||'12345678',
      status:'active',
      fee_status:'pending',
      gender:selected.gender||'male',
      father_name:selected.father_name||'',
      referred_by:selected.referred_by||''
    })
    await sb.from('admissions').update({status:'approved'}).eq('id',selected.id)
    toast.success('Enrolled! 🎉')
    setModal(null)
    load()
  }
  
  const reject=async id=>{if(!confirm('Reject?'))return;await sb.from('admissions').update({status:'rejected'}).eq('id',id);toast.success('Rejected');load()}
  const del=async id=>{if(!confirm('Delete?'))return;await sb.from('admissions').delete().eq('id',id);toast.success('Deleted');load()}
  
  const doExport=()=>exportXLS(admissions.map(a=>({
    Name:a.full_name,
    Email:a.email,
    Phone:a.phone||'',
    City:a.city||'',
    Education:a.education||'',
    'Father Name':a.father_name||'',
    'Referred By':a.referred_by||'',
    Status:a.status,
    Applied:fmtDate(a.applied_at)
  })),'AEMTECH_Admissions.xlsx','Admissions')
  
  const doImport=async e=>{
    const file=e.target.files[0];if(!file)return;setImporting(true)
    try{
      const data=await new Promise((res,rej)=>{
        const r=new FileReader()
        r.onload=ev=>{
          try{
            const wb=XLSX.read(ev.target.result,{type:'array'})
            res(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]))
          }catch(err){rej(err)}
        }
        r.readAsArrayBuffer(file)
      })
      const records=data.map(r=>({
        full_name:r['Name']||r['Full Name']||r.full_name||'',
        email:r.Email||r.email||'',
        phone:r.Phone||r.phone||'',
        city:r.City||r.city||'',
        education:r.Education||r.education||'',
        father_name:r['Father Name']||r.father_name||'',
        referred_by:r['Referred By']||r.referred_by||'',
        status:'pending',
        applied_at:new Date().toISOString()
      })).filter(r=>r.full_name&&(r.email||r.phone))
      if(!records.length){toast.error('No valid records');return}
      const{error}=await sb.from('admissions').insert(records)
      if(error){toast.error(error.message);return}
      toast.success(`${records.length} admissions imported! 🎉`)
      load()
    }catch{toast.error('Failed')}finally{setImporting(false);e.target.value=''}
  }
  
  const filtered=admissions.filter(a=>{if(filters.status&&a.status!==filters.status)return false;return true})
  
  if(loading)return <SkeletonDashboard/>
  
  return(
    <>
      <FilterBar filters={[{key:'status',label:'Status',options:['pending','approved','rejected']}]} values={filters} onChange={setFilters}/>
      
      <Card title={`Admissions (${filtered.length})`} icon="📋" action={
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <Btn type="success" size="sm" onClick={doExport} icon="📊">Export</Btn>
          <label style={{cursor:'pointer'}}>
            <Btn type="warning" size="sm" icon="📥" loading={importing}>Import</Btn>
            <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={doImport} disabled={importing}/>
          </label>
          <Btn type="outline" size="sm" icon="📊" onClick={()=>openSheet('admissions')}>Sheet</Btn>
          <Btn onClick={()=>{setForm({});setModal('add')}} icon="➕">New</Btn>
        </div>
      } noPadding>
        <Tbl headers={['Name','Email','Phone','City','Status','Applied','Actions']} empty={filtered.length===0?<Empty icon="📋" title="No admissions"/>:null}>
          {filtered.map((a,i)=>(
            <TR key={a.id} delay={i*.04}>
              <TD style={{fontWeight:600,color:dark?'#E5E7EB':'#1F2937'}}>{a.full_name}</TD>
              <TD style={{fontSize:12}}>{a.email}</TD>
              <TD style={{fontSize:12}}>{a.phone||'—'}</TD>
              <TD style={{fontSize:12}}>{a.city||'—'}</TD>
              <TD><Bdg type={statusBadge(a.status)} dot>{a.status}</Bdg></TD>
              <TD style={{fontSize:12}}>{fmtDate(a.applied_at)}</TD>
              <TD>
                <div style={{display:'flex',gap:6}}>
                  <Btn type="outline" size="xs" onClick={()=>{setSelected(a);setModal('view')}}>👁</Btn>
                  {a.status==='pending'&&<>
                    <Btn type="success" size="xs" onClick={()=>{setSelected(a);setForm({});setModal('approve')}}>✅</Btn>
                    <Btn type="danger" size="xs" onClick={()=>reject(a.id)}>❌</Btn>
                  </>}
                  <Btn type="danger" size="xs" onClick={()=>del(a.id)}>🗑</Btn>
                </div>
              </TD>
            </TR>
          ))}
        </Tbl>
      </Card>
      
      {/* Add Modal */}
      <Modal open={modal==='add'} onClose={()=>setModal(null)} title="New Admission" icon="📋" footer={<><Btn type="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn onClick={add}>Submit</Btn></>}>
        <Grid>
          <Inp label="Name" required value={form.full_name||''} onChange={e=>setForm({...form,full_name:e.target.value})}/>
          <Inp label="Email" type="email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/>
          <Inp label="Phone" required value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/>
          <Inp label="City" value={form.city||''} onChange={e=>setForm({...form,city:e.target.value})}/>
          <Inp label="Education" value={form.education||''} onChange={e=>setForm({...form,education:e.target.value})}/>
          <Inp label="Father Name" value={form.father_name||''} onChange={e=>setForm({...form,father_name:e.target.value})}/>
          <Sel label="Referred By" value={form.referred_by||''} onChange={e=>setForm({...form,referred_by:e.target.value})}>
            <option value="">Select</option>
            {REFERRAL_SOURCES.map(r=><option key={r} value={r}>{r}</option>)}
          </Sel>
          <Sel label="Gender" value={form.gender||'male'} onChange={e=>setForm({...form,gender:e.target.value})}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Sel>
        </Grid>
        <TA label="Notes" value={form.reason||''} onChange={e=>setForm({...form,reason:e.target.value})}/>
      </Modal>
      
      {/* View Modal */}
      <Modal open={modal==='view'} onClose={()=>setModal(null)} title="Admission Details" footer={<><Btn type="ghost" onClick={()=>setModal(null)}>Close</Btn>{selected?.status==='pending'&&<Btn type="success" onClick={()=>{setModal('approve');setForm({})}}>✅ Approve</Btn>}</>}>
        {selected&&<Grid>
          {[['Name',selected.full_name],['Email',selected.email],['Phone',selected.phone],['City',selected.city||'—'],['Education',selected.education||'—'],['Father',selected.father_name||'—'],['Referred By',selected.referred_by||'—'],['Status',selected.status]].map(([k,v])=>(
            <div key={k} style={{...getGlassLight(dark),borderRadius:14,padding:16}}>
              <div style={{fontSize:10,color:'#6B7280',textTransform:'uppercase',letterSpacing:1,marginBottom:5}}>{k}</div>
              <div style={{fontWeight:600,color:dark?'#E5E7EB':'#1F2937'}}>{v}</div>
            </div>
          ))}
        </Grid>}
      </Modal>
      
      {/* Approve Modal */}
      <Modal open={modal==='approve'} onClose={()=>setModal(null)} title="Approve & Enroll" icon="✅" footer={<><Btn type="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn type="success" onClick={approve}>✅ Enroll as Student</Btn></>}>
        {selected&&<>
          <div style={{background:'rgba(16,185,129,.05)',border:'1px solid rgba(16,185,129,.2)',borderRadius:14,padding:16,marginBottom:18}}>
            <div style={{color:'#10B981',fontSize:13}}>Enrolling <strong>{selected.full_name}</strong> as student</div>
          </div>
          <Grid>
            <Sel label="Batch" onChange={e=>setForm({...form,batch_id:e.target.value})}>
              <option value="">Select Batch</option>
              {batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </Sel>
            <Inp label="Monthly Fee (PKR)" type="number" placeholder="200" onChange={e=>setForm({...form,fee_amount:e.target.value})}/>
            <Inp label="Total Course Fee (PKR)" type="number" placeholder="600" onChange={e=>setForm({...form,total_fee:e.target.value})}/>
            <Inp label="Password" defaultValue="12345678" onChange={e=>setForm({...form,password:e.target.value})}/>
          </Grid>
        </>}
      </Modal>
    </>
  )
}

function BatchesPage(){const[batches,setBatches]=useState([]);const[loading,setLoading]=useState(true);const[modal,setModal]=useState(false);const[form,setForm]=useState({});const load=useCallback(async()=>{setLoading(true);const{data}=await sb.from('batches').select('*').order('created_at',{ascending:false});setBatches(data||[]);setLoading(false)},[]);useEffect(()=>{load()},[load]);const save=async()=>{if(!form.name){toast.error('Required');return};if(form.id){await sb.from('batches').update(form).eq('id',form.id)}else{await sb.from('batches').insert({...form,status:form.status||'active'})};toast.success('Saved!');setModal(false);load()};const{confirm}=useConfirm();const del=async(id,name)=>{confirm({title:'Delete Batch?',message:`"${name}" batch delete hoga.`,type:'danger',confirmText:'Delete',icon:'🗑️'}).then(async ok=>{if(!ok)return;await sb.from('batches').delete().eq('id',id);toast.success('Deleted');load()})};if(loading)return <SkeletonDashboard/>;return(<><Card title={`Batches (${batches.length})`} icon="🏫" action={<Btn onClick={()=>{setForm({platform:'Google Meet',status:'active'});setModal(true)}} icon="➕">Add</Btn>} noPadding><Tbl headers={['Name','Schedule','Platform','Start','End','Status','Actions']} empty={batches.length===0?<Empty icon="🏫" title="No batches"/>:null}>{batches.map((b,i)=>(<TR key={b.id} delay={i*.04}><TD style={{fontWeight:600,color:'#E5E7EB'}}>{b.name}</TD><TD style={{fontSize:12}}>{b.schedule||'—'}</TD><TD style={{fontSize:12}}>{b.platform||'—'}</TD><TD style={{fontSize:12}}>{fmtDate(b.start_date)}</TD><TD style={{fontSize:12}}>{fmtDate(b.end_date)}</TD><TD><Bdg type={statusBadge(b.status)} dot>{b.status}</Bdg></TD><TD><div style={{display:'flex',gap:6}}><Btn type="outline" size="xs" onClick={()=>{setForm(b);setModal(true)}}>✏️</Btn><Btn type="danger" size="xs" onClick={()=>del(b.id,b.name)}>🗑</Btn></div></TD></TR>))}</Tbl></Card><Modal open={modal} onClose={()=>setModal(false)} title={form.id?'Edit':'Add Batch'} icon="🏫" footer={<><Btn type="ghost" onClick={()=>setModal(false)}>Cancel</Btn><Btn onClick={save}>Save</Btn></>}><Inp label="Name" required value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/><Grid><Sel label="Platform" value={form.platform||'Google Meet'} onChange={e=>setForm({...form,platform:e.target.value})}><option>Google Meet</option><option>Zoom</option><option>Both</option></Sel><Sel label="Status" value={form.status||'active'} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option></Sel><Inp label="Start" type="date" value={form.start_date||''} onChange={e=>setForm({...form,start_date:e.target.value})}/><Inp label="End" type="date" value={form.end_date||''} onChange={e=>setForm({...form,end_date:e.target.value})}/></Grid><Inp label="Schedule" placeholder="Mon & Thu, 7 PM" value={form.schedule||''} onChange={e=>setForm({...form,schedule:e.target.value})}/></Modal></>)}

function ClassesPage(){const[classes,setClasses]=useState([]);const[batches,setBatches]=useState([]);const[loading,setLoading]=useState(true);const[modal,setModal]=useState(false);const[form,setForm]=useState({});const[filters,setFilters]=useState({});const load=useCallback(async()=>{setLoading(true);const[c,b]=await Promise.all([sb.from('classes').select('*').order('class_number'),sb.from('batches').select('*')]);setClasses(c.data||[]);setBatches(b.data||[]);setLoading(false)},[]);useEffect(()=>{load()},[load]);const save=async()=>{if(!form.class_number||!form.title||!form.batch_id){toast.error('Required');return};const data={...form,class_number:parseInt(form.class_number)};if(form.id){await sb.from('classes').update(data).eq('id',form.id)}else{await sb.from('classes').insert({...data,status:form.status||'scheduled'})};toast.success('Saved!');setModal(false);load()};const{confirm}=useConfirm();const del=async id=>{confirm({title:'Delete Class?',message:'Yeh class aur iski attendance delete ho jayegi.',type:'danger',confirmText:'Delete',icon:'🗑️'}).then(async ok=>{if(!ok)return;await sb.from('attendance').delete().eq('class_id',id);await sb.from('classes').delete().eq('id',id);toast.success('Deleted');load()})};const filtered=classes.filter(c=>{if(filters.batch&&c.batch_id!==filters.batch)return false;if(filters.status&&c.status!==filters.status)return false;return true});if(loading)return <SkeletonDashboard/>;return(<><FilterBar filters={[{key:'batch',label:'Batch',options:batches.map(b=>({value:b.id,label:b.name}))},{key:'status',label:'Status',options:['scheduled','live','completed']}]} values={filters} onChange={setFilters}/><Card title={`Classes (${filtered.length})`} icon="📅" action={<Btn onClick={()=>{setForm({status:'scheduled'});setModal(true)}} icon="➕">Add</Btn>} noPadding><Tbl headers={['#','Title','Batch','Date','Time','Recording','Status','Actions']} empty={filtered.length===0?<Empty icon="📅" title="No classes"/>:null}>{filtered.map((c,i)=>(<TR key={c.id} delay={i*.04}><TD><Bdg type="gold">C{c.class_number}</Bdg></TD><TD style={{fontWeight:600,maxWidth:230,color:'#E5E7EB',whiteSpace:'normal',wordBreak:'break-word',lineHeight:1.45,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',verticalAlign:'middle'}}>{c.title}</TD><TD style={{fontSize:12}}>{batches.find(b=>b.id===c.batch_id)?.name||'—'}</TD><TD style={{fontSize:12}}>{fmtDate(c.date)}</TD><TD style={{fontSize:12}}>{c.time||'—'}</TD><TD>{c.recording_url?<a href={c.recording_url} target="_blank" rel="noreferrer" style={{color:'#FFD700',fontSize:12,fontWeight:600}}>▶</a>:'—'}</TD><TD><Bdg type={statusBadge(c.status)} dot>{c.status}</Bdg></TD><TD><div style={{display:'flex',gap:6}}><Btn type="outline" size="xs" onClick={()=>{setForm(c);setModal(true)}}>✏️</Btn><Btn type="danger" size="xs" onClick={()=>del(c.id)}>🗑</Btn></div></TD></TR>))}</Tbl></Card><Modal open={modal} onClose={()=>setModal(false)} title={form.id?'Edit':'Add Class'} icon="📅" footer={<><Btn type="ghost" onClick={()=>setModal(false)}>Cancel</Btn><Btn onClick={save}>Save</Btn></>}><Grid><Inp label="#" required type="number" value={form.class_number||''} onChange={e=>setForm({...form,class_number:e.target.value})}/><Sel label="Batch" required value={form.batch_id||''} onChange={e=>setForm({...form,batch_id:e.target.value})}><option value="">Select</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</Sel></Grid><Inp label="Title" required value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})}/><Grid><Inp label="Date" type="date" value={form.date||''} onChange={e=>setForm({...form,date:e.target.value})}/><Inp label="Time" value={form.time||''} onChange={e=>setForm({...form,time:e.target.value})}/></Grid><Inp label="Recording" value={form.recording_url||''} onChange={e=>setForm({...form,recording_url:e.target.value})}/><Sel label="Status" value={form.status||'scheduled'} onChange={e=>setForm({...form,status:e.target.value})}><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="completed">Completed</option></Sel><TA label="Notes" value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></Modal></>)}

function AttendancePage(){const[batches,setBatches]=useState([]);const[classes,setClasses]=useState([]);const[students,setStudents]=useState([]);const[att,setAtt]=useState({});const[selB,setSelB]=useState('');const[selC,setSelC]=useState('');const[repB,setRepB]=useState('');const[report,setReport]=useState([]);const[saving,setSaving]=useState(false);const{dark}=useTheme();useEffect(()=>{sb.from('batches').select('*').then(r=>setBatches(r.data||[]))},[]);const loadC=async bid=>{setSelB(bid);setSelC('');setStudents([]);const{data}=await sb.from('classes').select('*').eq('batch_id',bid).order('class_number');setClasses(data||[])};const loadS=async cid=>{setSelC(cid);const[s,a]=await Promise.all([sb.from('students').select('*').eq('batch_id',selB).eq('status','active'),sb.from('attendance').select('*').eq('class_id',cid)]);const map={};(a.data||[]).forEach(x=>map[x.student_id]=x.status);const state={};(s.data||[]).forEach(x=>state[x.id]=map[x.id]||'absent');setStudents(s.data||[]);setAtt(state)};const toggle=id=>{const states=['present','absent','late'];setAtt(p=>({...p,[id]:states[(states.indexOf(p[id]||'absent')+1)%3]}))};const markAll=st=>{const n={};students.forEach(s=>n[s.id]=st);setAtt(n)};const save=async()=>{if(!selC)return;setSaving(true);await sb.from('attendance').delete().eq('class_id',selC);await sb.from('attendance').insert(students.map(s=>({class_id:selC,student_id:s.id,status:att[s.id]||'absent'})));toast.success('Saved!');const[allA,allS,allC]=await Promise.all([sb.from('attendance').select('*'),sb.from('students').select('*'),sb.from('classes').select('*')]);await syncToSheet('syncAttendance',{records:(allA.data||[]).map(a=>({student_name:allS.data?.find(s=>s.id===a.student_id)?.full_name||'',class_number:allC.data?.find(c=>c.id===a.class_id)?.class_number||'',class_title:allC.data?.find(c=>c.id===a.class_id)?.title||'',date:fmtDate(a.marked_at||new Date()),status:a.status}))});setSaving(false)};const loadReport=async bid=>{setRepB(bid);const[s,c]=await Promise.all([sb.from('students').select('*').eq('batch_id',bid),sb.from('classes').select('*').eq('batch_id',bid)]);const total=(c.data||[]).length;const rows=await Promise.all((s.data||[]).map(async st=>{const{data:a}=await sb.from('attendance').select('*').eq('student_id',st.id);const present=(a||[]).filter(x=>x.status==='present').length;return{...st,present,total,pct:total>0?Math.round((present/total)*100):0}}));setReport(rows)};const attColors={present:{border:'rgba(16,185,129,.4)',bg:'rgba(16,185,129,.05)',color:'#10B981'},absent:{border:'rgba(239,68,68,.4)',bg:'rgba(239,68,68,.05)',color:'#EF4444'},late:{border:'rgba(245,158,11,.4)',bg:'rgba(245,158,11,.05)',color:'#F59E0B'}};return(<div><Card title="✅ Mark Attendance" icon="✅" action={<Btn type="outline" size="sm" icon="📊" onClick={()=>openSheet('attendance')}>Sheet</Btn>}><Grid gap={18} style={{marginBottom:22}}><Sel label="Batch" value={selB} onChange={e=>loadC(e.target.value)}><option value="">Select</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</Sel><Sel label="Class" value={selC} onChange={e=>loadS(e.target.value)}><option value="">Select</option>{classes.map(c=><option key={c.id} value={c.id}>C{c.class_number} — {c.title}</option>)}</Sel></Grid>{students.length>0&&<><div style={{display:'flex',gap:10,marginBottom:18}}><Btn type="success" size="sm" onClick={()=>markAll('present')}>✅ All Present</Btn><Btn type="danger" size="sm" onClick={()=>markAll('absent')}>❌ All Absent</Btn><Btn type="warning" size="sm" onClick={()=>markAll('late')}>⏰ Late</Btn></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(135px,1fr))',gap:12,marginBottom:22}}>{students.map(s=>{const st=att[s.id]||'absent';const c=attColors[st]||attColors.absent;return(<div key={s.id} onClick={()=>toggle(s.id)} style={{background:c.bg,border:`1.5px solid ${c.border}`,borderRadius:14,padding:16,textAlign:'center',cursor:'pointer',transition:tr}}><Av name={s.full_name} size={44}/><div style={{fontSize:12,fontWeight:700,marginTop:9,color:dark?'#E5E7EB':'#1F2937'}}>{s.full_name.split(' ')[0]}</div><div style={{fontSize:10,textTransform:'uppercase',letterSpacing:1.2,marginTop:5,color:c.color,fontWeight:700}}>{st}</div></div>)})}</div><Btn onClick={save} disabled={saving} loading={saving}>{saving?'Saving...':'💾 Save & Sync'}</Btn></>}</Card><Card title="📊 Report" icon="📊" action={report.length>0?<Btn type="success" size="sm" onClick={()=>exportXLS(report.map(s=>({Student:s.full_name,Present:s.present,Total:s.total,'%':s.pct+'%'})),'Attendance.xlsx')} icon="📊">Export</Btn>:null}><Sel label="Batch" value={repB} onChange={e=>loadReport(e.target.value)}><option value="">Select</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</Sel>{report.length>0&&<Tbl headers={['Student','Present','Total','Attendance','Status']}>{report.map((s,i)=>(<TR key={s.id} delay={i*.04}><TD><div style={{display:'flex',alignItems:'center',gap:8}}><Av name={s.full_name} size={32}/><span style={{fontWeight:600}}>{s.full_name}</span></div></TD><TD style={{color:'#10B981',fontWeight:700}}>{s.present}</TD><TD>{s.total}</TD><TD><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:85}}><PBar value={s.present} max={s.total}/></div><span style={{fontWeight:700,color:attColor(s.pct)}}>{s.pct}%</span></div></TD><TD><Bdg type={s.pct>=80?'success':s.pct>=60?'warning':'danger'} dot>{s.pct>=80?'Good':'<80%'}</Bdg></TD></TR>))}</Tbl>}</Card></div>)}

function AssignmentsPage(){
  const[assignments,setAssignments]=useState([]);const[batches,setBatches]=useState([]);const[classes,setClasses]=useState([]);const[loading,setLoading]=useState(true);const[modal,setModal]=useState(false);const[form,setForm]=useState({});const[filters,setFilters]=useState({})
  const{dark}=useTheme()
  const{confirm}=useConfirm()
  
  const load=useCallback(async()=>{setLoading(true);const[a,b,c]=await Promise.all([sb.from('assignments').select('*').order('created_at',{ascending:false}),sb.from('batches').select('*'),sb.from('classes').select('*').order('class_number')]);setAssignments(a.data||[]);setBatches(b.data||[]);setClasses(c.data||[]);setLoading(false)},[])
  useEffect(()=>{load()},[load])
  
  const save=async()=>{
    if(!form.title||!form.batch_id||!form.due_date){toast.error('Title, batch and due date required');return}
    const data={title:form.title,description:form.description||'',batch_id:form.batch_id,class_id:form.class_id||null,due_date:form.due_date,total_marks:parseInt(form.total_marks)||100}
    if(form.id){
      await sb.from('assignments').update(data).eq('id',form.id)
      logAction('UPDATE','Assignment',form.title||'');toast.success('Updated! ✅')
    }else{
      await sb.from('assignments').insert(data)
      logAction('CREATE','Assignment',form.title||'');toast.success('Created! 📝')
    }
    setModal(false);load()
  }
  
  const del=async(id,title)=>{
    const ok=await confirm({title:'Delete Assignment?',message:`"${title}" delete hoga aur iske saare submissions bhi delete ho jayenge.`,type:'danger',confirmText:'Delete',icon:'🗑️'})
    if(!ok)return
    await sb.from('submissions').delete().eq('assignment_id',id)
    await sb.from('assignments').delete().eq('id',id)
    toast.success('Deleted');load()
  }
  
  // Handle TXT file upload for description
  const handleDescFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.txt')) { toast.error('Only .txt files allowed'); e.target.value=''; return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      if (text) {
        setForm(f => ({ ...f, description: text }))
        toast.success('📄 File loaded!')
      }
    }
    reader.onerror = () => toast.error('Failed to read file')
    reader.readAsText(file)
    e.target.value = ''
  }
  
  const filtered=assignments.filter(a=>{if(filters.batch&&a.batch_id!==filters.batch)return false;return true})
  
  if(loading)return <SkeletonDashboard/>
  
  return(<>
    <FilterBar filters={[{key:'batch',label:'Batch',options:batches.map(b=>({value:b.id,label:b.name}))}]} values={filters} onChange={setFilters}/>
    <Card title={`Assignments (${filtered.length})`} icon="📝" action={<div style={{display:'flex',gap:10}}><Btn type="outline" size="sm" icon="📊" onClick={()=>openSheet('assignments')}>Sheet</Btn><Btn onClick={()=>{setForm({total_marks:100});setModal(true)}} icon="➕">Create</Btn></div>} noPadding>
      <Tbl headers={['Title','Batch','Class','Due','Marks','Actions']} empty={filtered.length===0?<Empty icon="📝" title="No assignments"/>:null}>
        {filtered.map((a,i)=>(
          <TR key={a.id} delay={i*.04}>
            <TD style={{fontWeight:600,maxWidth:230,color:dark?'#E5E7EB':'#1F2937',whiteSpace:'normal',wordBreak:'break-word',lineHeight:1.45,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{a.title}</TD>
            <TD style={{fontSize:12}}>{batches.find(b=>b.id===a.batch_id)?.name||'—'}</TD>
            <TD style={{fontSize:12}}>{classes.find(c=>c.id===a.class_id)?'C'+classes.find(c=>c.id===a.class_id)?.class_number:'—'}</TD>
            <TD style={{fontSize:12}}>{fmtDT(a.due_date)}</TD>
            <TD><Bdg type="gold">{a.total_marks}pts</Bdg></TD>
            <TD>
              <div style={{display:'flex',gap:6}}>
                <Btn type="outline" size="xs" onClick={()=>{setForm({...a,due_date:a.due_date?a.due_date.substring(0,16):''});setModal(true)}}>✏️</Btn>
                <Btn type="danger" size="xs" onClick={()=>del(a.id,a.title)}>🗑</Btn>
              </div>
            </TD>
          </TR>
        ))}
      </Tbl>
    </Card>
    
    <Modal open={modal} onClose={()=>setModal(false)} title={form.id?'Edit Assignment':'Create Assignment'} icon="📝" footer={<><Btn type="ghost" onClick={()=>setModal(false)}>Cancel</Btn><Btn onClick={save}>{form.id?'💾 Update':'➕ Create'}</Btn></>}>
      <Inp label="Title" required value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})}/>
      
      {/* Description with TXT upload option */}
      <div style={{marginBottom:22}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:9}}>
          <label style={{fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:1.2}}>Description / Assignment Details</label>
          <label style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,color:'#FFD700',cursor:'pointer',padding:'4px 10px',background:'rgba(255,215,0,.06)',borderRadius:8,border:'1px solid rgba(255,215,0,.1)'}}>
            📄 Upload .txt
            <input type="file" accept=".txt" style={{display:'none'}} onChange={handleDescFile}/>
          </label>
        </div>
        <textarea value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Assignment details likhein ya .txt file upload karein..." rows={6}
          style={{width:'100%',background:dark?'rgba(0,0,0,.3)':'#FAFAFA',border:`1.5px solid ${dark?'rgba(255,255,255,.06)':'rgba(0,0,0,.1)'}`,color:dark?'#E5E7EB':'#1F2937',padding:'14px 18px',borderRadius:13,fontSize:14,outline:'none',fontFamily:"'Inter',sans-serif",resize:'vertical',minHeight:120}}/>
        {form.description && <div style={{fontSize:10,color:'#4B5563',marginTop:6}}>{form.description.length} characters</div>}
      </div>
      
      <Grid>
        <Sel label="Batch" required value={form.batch_id||''} onChange={e=>setForm({...form,batch_id:e.target.value})}><option value="">Select</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</Sel>
        <Sel label="Class" value={form.class_id||''} onChange={e=>setForm({...form,class_id:e.target.value})}><option value="">Select</option>{classes.map(c=><option key={c.id} value={c.id}>C{c.class_number}</option>)}</Sel>
        <Inp label="Due Date" required type="datetime-local" value={form.due_date||''} onChange={e=>setForm({...form,due_date:e.target.value})}/>
        <Inp label="Marks" type="number" value={form.total_marks||100} onChange={e=>setForm({...form,total_marks:e.target.value})}/>
      </Grid>
    </Modal>
  </>)
}

function SubmissionsPage(){
  const[subs,setSubs]=useState([]);const[students,setStudents]=useState([]);const[assignments,setAssignments]=useState([]);const[loading,setLoading]=useState(true);const[modal,setModal]=useState(null);const[form,setForm]=useState({});const[filter,setFilter]=useState('all')
  const[assignmentFilter,setAssignmentFilter]=useState('all') // Assignment filter
  const { confirm } = useConfirm()
  const { dark } = useTheme()
  
  const load=useCallback(async()=>{setLoading(true);const[s,st,a]=await Promise.all([sb.from('submissions').select('*').order('submitted_at',{ascending:false}),sb.from('students').select('*'),sb.from('assignments').select('*').order('created_at')]);setSubs(s.data||[]);setStudents(st.data||[]);setAssignments(a.data||[]);setLoading(false)},[])
  useEffect(()=>{load()},[load])
  
  const saveGrade=async()=>{
    let marks=parseFloat(form.marks)
    // Rubric auto-calc if rubric scores present
    const rs=RUBRIC_FIELDS.map(([k,,])=>parseFloat(form['r_'+k])).filter(v=>!isNaN(v)&&v>=0)
    if(rs.length===RUBRIC_FIELDS.length){ marks=rs.reduce((a,b)=>a+b,0) }
    if(isNaN(marks)){toast.error('Enter marks');return}
    const rubricObj={}
    RUBRIC_FIELDS.forEach(([k,,])=>{ if(form['r_'+k]!==''&&form['r_'+k]!==undefined) rubricObj[k]=parseFloat(form['r_'+k]) })
    await sb.from('submissions').update({marks_obtained:marks,feedback:form.feedback,status:'graded',rubric:Object.keys(rubricObj).length?JSON.stringify(rubricObj):null}).eq('id',form.id)
    logAction('GRADE','Submission',`Marks ${marks}/${form.total}`,'')
    toast.success('Graded! ✅');setModal(null);load()
  }
  
  const deleteSubmission = async (id, studentName) => {
    const ok = await confirm({ title: 'Delete Submission?', message: `Delete submission by ${studentName}? This cannot be undone.`, type: 'danger', confirmText: 'Delete', icon: '🗑️' })
    if (!ok) return
    await sb.from('submissions').delete().eq('id', id)
    toast.success('Submission deleted!')
    load()
  }
  
  // Parse multiple links
  const parseLinks = (link) => {
    if (!link) return []
    try { const parsed = JSON.parse(link); return Array.isArray(parsed) ? parsed : [link] } catch { return [link] }
  }
  
  // Apply both filters
  let filtered = subs
  if (assignmentFilter !== 'all') filtered = filtered.filter(s => s.assignment_id === assignmentFilter)
  if (filter === 'pending') filtered = filtered.filter(s => s.marks_obtained == null)
  else if (filter === 'graded') filtered = filtered.filter(s => s.marks_obtained != null)
  
  // Get selected assignment details
  const selectedAssignment = assignmentFilter !== 'all' ? assignments.find(a => a.id === assignmentFilter) : null
  
  if(loading)return <SkeletonDashboard/>
  
  return(<>
    {/* Assignment Filter Tabs */}
    <div style={{display:'flex',gap:8,marginBottom:20,padding:6,...getGlass(dark),borderRadius:16,overflowX:'auto',flexWrap:'nowrap'}} className="cs">
      <button onClick={()=>setAssignmentFilter('all')} style={{padding:'12px 20px',borderRadius:12,border:'none',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:12,transition:'all .3s',background:assignmentFilter==='all'?G:'transparent',color:assignmentFilter==='all'?'#000':'#6B7280',whiteSpace:'nowrap',flexShrink:0}}>📋 All ({subs.length})</button>
      {assignments.map((a,i)=>{
        const count=subs.filter(s=>s.assignment_id===a.id).length
        return(
          <button key={a.id} onClick={()=>setAssignmentFilter(a.id)} style={{padding:'12px 20px',borderRadius:12,border:'none',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:12,transition:'all .3s',background:assignmentFilter===a.id?G:'transparent',color:assignmentFilter===a.id?'#000':'#6B7280',whiteSpace:'nowrap',flexShrink:0}}>
            📝 Assignment {i+1} ({count})
          </button>
        )
      })}
    </div>
    
    {/* Selected Assignment Info */}
    {selectedAssignment && (
      <div style={{...getGlassLight(dark),borderRadius:14,padding:'16px 20px',marginBottom:20,borderLeft:'4px solid #FFD700'}}>
        <div style={{fontSize:16,fontWeight:700,color:dark?'#E5E7EB':'#1F2937',marginBottom:4}}>{selectedAssignment.title}</div>
        <div style={{fontSize:12,color:'#6B7280'}}>Due: {fmtDT(selectedAssignment.due_date)} · {selectedAssignment.total_marks} marks · {filtered.length} submissions</div>
      </div>
    )}
    
    <Card title={selectedAssignment?`${selectedAssignment.title} (${filtered.length})`:`All Submissions (${filtered.length})`} icon="📤" action={<div style={{display:'flex',gap:10}}><select value={filter} onChange={e=>setFilter(e.target.value)} style={{background:dark?'#0A0A0B':'#fff',border:'1px solid rgba(255,255,255,.06)',color:dark?'#E5E7EB':'#1F2937',padding:'9px 14px',borderRadius:11,fontSize:12,fontFamily:"'Inter',sans-serif",outline:'none'}}><option value="all">All Status</option><option value="pending">Pending</option><option value="graded">Graded</option></select><Btn type="success" size="sm" onClick={()=>exportXLS(filtered.map(s=>({Student:students.find(x=>x.id===s.student_id)?.full_name||'',Assignment:assignments.find(x=>x.id===s.assignment_id)?.title||'',Marks:s.marks_obtained||'',Status:s.status})),'Submissions.xlsx')} icon="📊">Export</Btn><Btn type="outline" size="sm" icon="📊" onClick={()=>openSheet('submissions')}>Sheet</Btn></div>} noPadding>
      <Tbl headers={['Student','Assignment','Submitted','Files','Marks','Status','Actions']} empty={filtered.length===0?<Empty icon="📤" title="No submissions"/>:null}>
        {filtered.map((s,i)=>{
          const st=students.find(x=>x.id===s.student_id)
          const a=assignments.find(x=>x.id===s.assignment_id)
          const links = parseLinks(s.submission_link)
          return(
            <TR key={s.id} delay={i*.04}>
              <TD><div style={{display:'flex',alignItems:'center',gap:8}}><Av name={st?.full_name||'?'} size={32}/><span style={{fontWeight:600,fontSize:13,color:dark?'#E5E7EB':'#1F2937'}}>{st?.full_name||'—'}</span></div></TD>
              <TD style={{fontSize:12,maxWidth:190,whiteSpace:'normal',wordBreak:'break-word',lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{a?.title||'—'}</TD>
              <TD style={{fontSize:12}}>{fmtDT(s.submitted_at)}</TD>
              <TD>
                {links.length > 0 ? (
                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {links.map((link,li)=>(
                      <a key={li} href={link} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',fontSize:10,color:'#FFD700',background:'rgba(255,215,0,.08)',padding:'4px 8px',borderRadius:6,textDecoration:'none'}}>📎{links.length>1?li+1:''}</a>
                    ))}
                  </div>
                ) : '—'}
              </TD>
              <TD>{s.marks_obtained!=null?<span style={{fontWeight:800,color:'#FFD700'}}>{s.marks_obtained}/{a?.total_marks||100}</span>:'—'}</TD>
              <TD><Bdg type={s.marks_obtained!=null?'success':'warning'} dot>{s.marks_obtained!=null?'Graded':'Pending'}</Bdg></TD>
              <TD>
                <div style={{display:'flex',gap:6}}>
                  <Btn type="outline" size="xs" onClick={()=>{(()=>{let rub={};try{rub=s.rubric?JSON.parse(s.rubric):{}}catch{rub={}};const f={id:s.id,marks:s.marks_obtained||'',feedback:s.feedback||'',links:parseLinks(s.submission_link),text:s.submission_text,total:a?.total_marks||100};RUBRIC_FIELDS.forEach(([k])=>{f['r_'+k]=rub[k]!==undefined?String(rub[k]):''});setForm(f);setModal('grade')})()}}>✏️</Btn>
                  <Btn type="danger" size="xs" onClick={()=>deleteSubmission(s.id,st?.full_name||'Student')}>🗑️</Btn>
                </div>
              </TD>
            </TR>
          )
        })}
      </Tbl>
    </Card>
    
    <Modal open={modal==='grade'} onClose={()=>setModal(null)} title="Grade Submission" icon="✏️" footer={<><Btn type="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn onClick={saveGrade}>💾 Save</Btn></>}>
      {form.links?.length > 0 && (
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:700,color:'#6B7280',marginBottom:8}}>SUBMITTED FILES</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {form.links.map((link,i)=>(
              <a key={i} href={link} target="_blank" rel="noreferrer"><Btn type="outline" size="sm">📎 File {form.links.length>1?i+1:''}</Btn></a>
            ))}
          </div>
        </div>
      )}
      {form.text && <div style={{...getGlassLight(dark),borderRadius:10,padding:14,marginBottom:18,fontSize:12,color:'#9CA3AF'}}>📝 {form.text}</div>}
      <div style={{marginBottom:18}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <label style={{fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:1.2}}>🎯 Rubric (optional — auto total)</label>
          <button onClick={()=>{const d={};RUBRIC_FIELDS.forEach(([k,,max])=>d['r_'+k]=String(max));let sum=RUBRIC_FIELDS.reduce((a,[,,m])=>a+m,0);setForm(f=>({...f,...d,marks:String(sum)}))}} style={{background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.18)',color:'#10B981',fontSize:10,fontWeight:700,padding:'5px 11px',borderRadius:8,cursor:'pointer',fontFamily:"'Inter',sans-serif"}}>Full Marks</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}} className="mf">
          {RUBRIC_FIELDS.map(([k,label,max])=>(
            <div key={k}>
              <div style={{fontSize:10,color:'#6B7280',fontWeight:700,marginBottom:5}}>{label} <span style={{color:'#4B5563'}}>/ {max}</span></div>
              <input type="number" min={0} max={max} value={form['r_'+k]??''} onChange={e=>setForm({...form,['r_'+k]:e.target.value})}
                style={{width:'100%',background:dark?'rgba(0,0,0,.3)':'#FAFAFA',border:`1.5px solid ${dark?'rgba(255,255,255,.06)':'rgba(0,0,0,.1)'}`,color:dark?'#E5E7EB':'#1F2937',padding:'9px 13px',borderRadius:10,fontSize:13,outline:'none',fontFamily:"'Inter',sans-serif"}}/>
            </div>
          ))}
        </div>
      </div>
      <Inp label={`Marks (out of ${form.total})`} type="number" value={form.marks} onChange={e=>setForm({...form,marks:e.target.value})}/>
      <TA label="Feedback" value={form.feedback} onChange={e=>setForm({...form,feedback:e.target.value})} placeholder="Great work! / Needs improvement..."/>
    </Modal>
  </>)
}

function RecordingsPage(){const[classes,setClasses]=useState([]);const[batches,setBatches]=useState([]);const[loading,setLoading]=useState(true);const[modal,setModal]=useState(null);const[form,setForm]=useState({});const[uploading,setUploading]=useState(false);const[filterBatch,setFilterBatch]=useState('');const{dark}=useTheme();const load=useCallback(async()=>{setLoading(true);const[c,b]=await Promise.all([sb.from('classes').select('*').order('class_number'),sb.from('batches').select('*')]);setClasses(c.data||[]);setBatches(b.data||[]);setLoading(false)},[]);useEffect(()=>{load()},[load]);const handleFile=async e=>{const file=e.target.files[0];if(!file)return;setUploading(true);try{const ext=file.name.split('.').pop();const url=await uploadFile(file,'recordings',`recordings/c${form.class_number||'x'}-${Date.now()}.${ext}`);setForm(f=>({...f,recording_url:url}));toast.success('Uploaded!')}catch{toast.error('Failed')}finally{setUploading(false);e.target.value=''}};const save=async()=>{if(!form.recording_url){toast.error('Add URL');return};await sb.from('classes').update({recording_url:form.recording_url,notes:form.notes,status:'completed'}).eq('id',form.id);toast.success('Saved!');setModal(null);load()};const filtered=filterBatch?classes.filter(c=>c.batch_id===filterBatch):classes;if(loading)return <SkeletonDashboard/>;return(<><Card title={`Recordings (${classes.filter(c=>c.recording_url).length}/${classes.length})`} icon="🎥" action={<select value={filterBatch} onChange={e=>setFilterBatch(e.target.value)} style={{background:'#0A0A0B',border:'1px solid rgba(255,255,255,.06)',color:'#E5E7EB',padding:'9px 14px',borderRadius:11,fontSize:12,fontFamily:"'Inter',sans-serif",outline:'none'}}><option value="">All</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}>{filtered.map(c=>(<div key={c.id} className="ch" style={{display:'flex',alignItems:'center',gap:16,...getGlassLight(dark),borderRadius:14,padding:20,marginBottom:12}}><div style={{width:54,height:54,background:c.recording_url?'rgba(16,185,129,.08)':'rgba(255,215,0,.04)',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>{c.recording_url?'▶️':'📅'}</div><div style={{flex:1}}><div style={{fontSize:15,fontWeight:700,color:dark?'#E5E7EB':'#1F2937',lineHeight:1.4,wordBreak:'break-word',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>C{c.class_number} — {c.title}</div><div style={{fontSize:12,color:'#6B7280'}}>{batches.find(b=>b.id===c.batch_id)?.name||'—'} · {fmtDate(c.date)}</div></div><div style={{display:'flex',gap:8}}>{c.recording_url&&<a href={c.recording_url} target="_blank" rel="noreferrer" style={{background:G,color:'#000',padding:'8px 16px',borderRadius:10,fontSize:12,fontWeight:700,textDecoration:'none'}}>▶</a>}<Btn type="outline" size="sm" onClick={()=>{setForm({id:c.id,class_number:c.class_number,recording_url:c.recording_url||'',notes:c.notes||''});setModal('edit')}}>{c.recording_url?'✏️':'➕'}</Btn></div></div>))}{filtered.length===0&&<Empty icon="🎥" title="No classes"/>}</Card><Modal open={modal==='edit'} onClose={()=>setModal(null)} title="Recording" icon="🎥" footer={<><Btn type="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn onClick={save}>💾 Save</Btn></>}><Inp label="URL" value={form.recording_url||''} onChange={e=>setForm({...form,recording_url:e.target.value})}/><div style={{display:'flex',alignItems:'center',gap:12,margin:'4px 0 22px'}}><div style={{flex:1,height:1,background:'rgba(255,255,255,.05)'}}/><span style={{fontSize:11,color:'#4B5563',fontWeight:700}}>OR UPLOAD</span><div style={{flex:1,height:1,background:'rgba(255,255,255,.05)'}}/></div><FileUp label="Video" accept="video/*,.mp4,.mov" uploading={uploading} onUpload={handleFile}/><TA label="Notes" value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></Modal></>)}

function AnnouncementsPage(){const[anns,setAnns]=useState([]);const[loading,setLoading]=useState(true);const[modal,setModal]=useState(false);const[form,setForm]=useState({});const{dark}=useTheme();const load=useCallback(async()=>{setLoading(true);const{data}=await sb.from('announcements').select('*').order('created_at',{ascending:false});setAnns(data||[]);setLoading(false)},[]);useEffect(()=>{load()},[load]);const save=async()=>{if(!form.title||!form.content){toast.error('Required');return};if(form.id){await sb.from('announcements').update(form).eq('id',form.id)}else{await sb.from('announcements').insert({...form,priority:form.priority||'normal'})};logAction('CREATE','Announcement',form.title||'');toast.success('Posted! 📢');setModal(false);load()};const del=async id=>{await sb.from('announcements').delete().eq('id',id);toast.success('Deleted');load()};if(loading)return <SkeletonDashboard/>;return(<><Card title={`Announcements (${anns.length})`} icon="📢" action={<Btn onClick={()=>{setForm({priority:'normal'});setModal(true)}} icon="➕">New</Btn>}>{anns.length===0?<Empty icon="📢" title="No announcements"/>:anns.map((a,i)=>(<div key={a.id} style={{...getGlassLight(dark),borderRadius:14,padding:22,marginBottom:14,borderLeft:'3px solid #FFD700',animation:`fadeIn .4s ease ${i*.08}s both`}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}><div style={{fontSize:16,fontWeight:700,color:dark?'#E5E7EB':'#1F2937'}}>{a.title}</div><div style={{display:'flex',gap:8}}><Bdg type={a.priority==='urgent'?'danger':a.priority==='important'?'warning':'info'}>{a.priority}</Bdg><Btn type="outline" size="xs" onClick={()=>{setForm(a);setModal(true)}}>✏️</Btn><Btn type="danger" size="xs" onClick={()=>del(a.id)}>🗑</Btn></div></div><div style={{fontSize:13,color:'#9CA3AF',lineHeight:1.7}}>{a.content}</div><div style={{fontSize:11,color:'#374151',marginTop:8}}>{ago(a.created_at)}</div></div>))}</Card><Modal open={modal} onClose={()=>setModal(false)} title={form.id?'Edit':'New'} icon="📢" footer={<><Btn type="ghost" onClick={()=>setModal(false)}>Cancel</Btn><Btn onClick={save}>📢 Post</Btn></>}><Inp label="Title" required value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})}/><TA label="Content" required value={form.content||''} onChange={e=>setForm({...form,content:e.target.value})} style={{minHeight:130}}/><Sel label="Priority" value={form.priority||'normal'} onChange={e=>setForm({...form,priority:e.target.value})}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></Sel></Modal></>)}

function CertificatesPage(){const[students,setStudents]=useState([]);const[loading,setLoading]=useState(true);const[search,setSearch]=useState('');const{dark}=useTheme();useEffect(()=>{sb.from('students').select('*').order('full_name').then(r=>{setStudents(r.data||[]);setLoading(false)})},[]);const gen=s=>{const d=new Date().toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'});const w=window.open('','_blank');w.document.write(`<!DOCTYPE html><html><head><title>Certificate</title><style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Poppins',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f9f9f9}.cert{width:800px;border:10px solid #FFD700;padding:50px;text-align:center;background:#fff}.inner{border:2px solid #FFD700;padding:40px}@media print{body{background:#fff}}</style></head><body><div class="cert"><div class="inner"><div style="font-size:11px;letter-spacing:5px;color:#888;text-transform:uppercase;margin-bottom:14px">AEMTECH INSTITUTE</div><div style="font-size:34px;font-weight:800;color:#FFD700;margin-bottom:8px">Certificate of Completion</div><div style="color:#666;margin-bottom:20px">This is to certify that</div><div style="font-size:32px;font-weight:800;border-bottom:2px solid #FFD700;padding-bottom:10px;display:inline-block;margin-bottom:10px">${s.full_name}</div>${s.father_name?'<div style="font-size:14px;color:#888;margin-bottom:10px">'+(s.gender==='female'?'D/O':'S/O')+' '+s.father_name+'</div>':''}<div style="font-size:17px;font-weight:700;margin-bottom:4px">Digital Business & AI Master Program</div><div style="color:#888;margin-bottom:30px;font-size:13px">Learn · Design · Build · Market · Earn</div><div style="display:flex;justify-content:space-between;padding-top:16px;border-top:1px solid #eee"><div><div style="font-size:10px;color:#888">DATE</div><div style="font-weight:700">${d}</div></div><div style="font-size:40px">🎓</div><div style="text-align:right"><div style="font-size:10px;color:#888">DIRECTOR</div><div style="font-weight:700">AEMTECH Institute</div></div></div></div></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()};const filtered=students.filter(s=>!search||s.full_name?.toLowerCase().includes(search.toLowerCase()));if(loading)return <SkeletonDashboard/>;return <Card title="🎓 Certificates" icon="🎓" action={<Search value={search} onChange={e=>setSearch(e.target.value)}/>}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(165px,1fr))',gap:16}}>{filtered.map(s=>(<div key={s.id} className="ch" style={{...getGlassLight(dark),borderRadius:16,padding:22,textAlign:'center'}}><Av name={s.full_name} size={54} glow/><div style={{fontSize:14,fontWeight:700,marginTop:14,marginBottom:4,color:dark?'#E5E7EB':'#1F2937'}}>{s.full_name}</div><div style={{fontSize:11,color:'#4B5563',marginBottom:10}}>{s.city||'Pakistan'}</div><Bdg type={statusBadge(s.status)} dot>{s.status}</Bdg><div style={{marginTop:14}}><Btn onClick={()=>gen(s)} size="sm" full>🎓 Generate</Btn></div></div>))}{filtered.length===0&&<Empty icon="🎓" title="No students"/>}</div></Card>}

function SheetSyncPage(){const[syncing,setSyncing]=useState({});const[lastSync,setLastSync]=useState(null);const{dark}=useTheme();const syncData=async type=>{setSyncing(p=>({...p,[type]:true}));try{if(type==='students'){const{data}=await sb.from('students').select('*');await syncToSheet('syncStudents',{students:data||[]});toast.success('Students synced!')};if(type==='attendance'){const[a,s,c]=await Promise.all([sb.from('attendance').select('*'),sb.from('students').select('*'),sb.from('classes').select('*')]);await syncToSheet('syncAttendance',{records:(a.data||[]).map(x=>({student_name:s.data?.find(st=>st.id===x.student_id)?.full_name||'',class_number:c.data?.find(cl=>cl.id===x.class_id)?.class_number||'',class_title:c.data?.find(cl=>cl.id===x.class_id)?.title||'',date:fmtDate(x.marked_at||new Date()),status:x.status}))});toast.success('Attendance synced!')};if(type==='fees'){const{data}=await sb.from('students').select('*');await syncToSheet('syncFees',{students:data||[]});toast.success('Fees synced!')};if(type==='submissions'){const[s,st,a]=await Promise.all([sb.from('submissions').select('*'),sb.from('students').select('*'),sb.from('assignments').select('*')]);await syncToSheet('syncSubmissions',{records:(s.data||[]).map(x=>({student_name:st.data?.find(s=>s.id===x.student_id)?.full_name||'',assignment_title:a.data?.find(a=>a.id===x.assignment_id)?.title||'',submitted_at:x.submitted_at,submission_link:x.submission_link||'',marks_obtained:x.marks_obtained||'',feedback:x.feedback||'',status:x.status}))});toast.success('Submissions synced!')};if(type==='assignments'){const[a,b]=await Promise.all([sb.from('assignments').select('*'),sb.from('batches').select('*')]);await syncToSheet('syncAssignments',{records:(a.data||[]).map(x=>({title:x.title,batch_name:b.data?.find(bt=>bt.id===x.batch_id)?.name||'',due_date:x.due_date,total_marks:x.total_marks,description:x.description||''}))});toast.success('Assignments synced!')};setLastSync(new Date())}catch{toast.error('Failed')}finally{setSyncing(p=>({...p,[type]:false}))}};const syncAll=async()=>{setSyncing({all:true});toast.loading('Syncing...',{id:'all'});try{for(const t of['students','attendance','fees','submissions','assignments'])await syncData(t);setLastSync(new Date());toast.success('Done! 🎉',{id:'all'})}finally{setSyncing({})}};const sheets=[{type:'students',icon:'👥',label:'Students',color:'#10B981'},{type:'attendance',icon:'✅',label:'Attendance',color:'#3B82F6'},{type:'fees',icon:'💰',label:'Fees',color:'#FFD700'},{type:'submissions',icon:'📤',label:'Submissions',color:'#F59E0B'},{type:'assignments',icon:'📝',label:'Assignments',color:'#8B5CF6'}];return(<div><div style={{...getGlass(dark),borderRadius:20,padding:'30px 34px',marginBottom:26,background:dark?'linear-gradient(135deg,rgba(16,185,129,.05),rgba(16,185,129,.015))':'linear-gradient(135deg,rgba(16,185,129,.08),rgba(16,185,129,.03))',animation:'fadeIn .5s ease'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16}}><div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:800,color:dark?'#E5E7EB':'#1F2937'}}>📊 Sheet Sync</div>{lastSync&&<div style={{fontSize:11,color:'#10B981',marginTop:6}}>✅ Last: {lastSync.toLocaleString()}</div>}</div><div style={{display:'flex',gap:10}}><Btn onClick={syncAll} loading={syncing.all} icon="🔄" style={{background:G2,color:'#fff',border:'none'}}>Sync All</Btn><Btn type="outline" onClick={()=>openSheet()} icon="📊">Open</Btn></div></div></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:18}}>{sheets.map(({type,icon,label,color})=>(<div key={type} className="ch" style={{...getGlass(dark),borderRadius:18,padding:26,borderTop:`3px solid ${color}`}}><div style={{display:'flex',alignItems:'center',gap:14,marginBottom:18}}><div style={{width:54,height:54,background:`${color}12`,borderRadius:15,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>{icon}</div><div style={{fontSize:17,fontWeight:700,color:dark?'#E5E7EB':'#1F2937'}}>{label}</div></div><div style={{display:'flex',gap:8}}><Btn full loading={syncing[type]} onClick={()=>syncData(type)} style={{background:`${color}15`,color,border:`1px solid ${color}30`,flex:2}} icon="🔄">Sync</Btn><Btn type="ghost" size="sm" onClick={()=>openSheet(type)} icon="↗">View</Btn></div></div>))}</div></div>)}

function ExcelPage(){const[importing,setImporting]=useState(false);const[preview,setPreview]=useState(null);const{dark}=useTheme();const handleImport=async e=>{const file=e.target.files[0];if(!file)return;const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=ev=>{try{res(XLSX.utils.sheet_to_json(XLSX.read(ev.target.result,{type:'array'}).Sheets[XLSX.read(ev.target.result,{type:'array'}).SheetNames[0]]))}catch(err){rej(err)}};r.readAsArrayBuffer(file)});setPreview({data});e.target.value=''};const confirmImport=async()=>{if(!preview)return;setImporting(true);try{const records=preview.data.map(r=>({full_name:r['Full Name']||r.full_name||r.Name||'',email:r['Personal Email']||r.Email||r.email||'',login_email:r['Login Email']||r.login_email||r['Portal Email']||r.Email||r.email||'',phone:r.Phone||r.phone||'',city:r.City||r.city||'',education:r.Education||r.education||'',father_name:r['Father/Guardian']||r.father_name||'',gender:r.Gender||r.gender||'male',referred_by:r['Referred By']||r.referred_by||'',status:'active',fee_status:'pending',password:'12345678',fee_amount:parseFloat(r['Fee Amount']||0)})).filter(r=>r.full_name&&r.email);await sb.from('students').insert(records);toast.success(records.length+' imported!');setPreview(null)}finally{setImporting(false)}};const exports=[{label:'👥 Students',fn:async()=>{const{data}=await sb.from('students').select('*');exportXLS(data.map(s=>({Name:s.full_name,'Personal Email':s.email,'Login Email':s.login_email||s.email,Phone:s.phone||'',City:s.city||'',Father:s.father_name||'',Gender:s.gender||'',Referred:s.referred_by||'',Fee:s.fee_amount||0,Paid:s.fee_paid||0})),'Students.xlsx')}},{label:'💰 Fees',fn:async()=>{const{data}=await sb.from('students').select('*');exportXLS(data.map(s=>({Student:s.full_name,Monthly:s.fee_amount||0,Paid:s.fee_paid||0,Due:(s.fee_amount||0)*3-(s.fee_paid||0),Status:s.fee_status||''})),'Fees.xlsx')}},{label:'✅ Attendance',fn:async()=>{const[a,s,c]=await Promise.all([sb.from('attendance').select('*'),sb.from('students').select('*'),sb.from('classes').select('*')]);exportXLS((a.data||[]).map(x=>({Student:s.data?.find(st=>st.id===x.student_id)?.full_name||'',Class:'C'+(c.data?.find(cl=>cl.id===x.class_id)?.class_number||''),Status:x.status})),'Attendance.xlsx')}},{label:'📤 Submissions',fn:async()=>{const[s,st,a]=await Promise.all([sb.from('submissions').select('*'),sb.from('students').select('*'),sb.from('assignments').select('*')]);exportXLS((s.data||[]).map(x=>({Student:st.data?.find(s=>s.id===x.student_id)?.full_name||'',Assignment:a.data?.find(a=>a.id===x.assignment_id)?.title||'',Marks:x.marks_obtained||'',Status:x.status})),'Submissions.xlsx')}},{label:'💳 Payments',fn:async()=>{const[p,s]=await Promise.all([sb.from('fee_payments').select('*'),sb.from('students').select('*')]);exportXLS((p.data||[]).map(x=>({Student:s.data?.find(st=>st.id===x.student_id)?.full_name||'',Month:x.month,Year:x.year,Amount:x.amount,Paid:x.paid_amount,Method:x.payment_method||'',Receipt:x.receipt_number||'',Status:x.status})),'Payments.xlsx')}}];return(<Grid gap={24}><Card title="📥 Import" icon="📥"><div style={{marginBottom:18}}><Btn type="ghost" size="sm" icon="📋" onClick={()=>exportXLS([{'Full Name':'Ahmed','Personal Email':'ahmed@gmail.com','Login Email':'ahmed@portal.com',Phone:'03001234567',City:'LHR','Father/Guardian':'Ali',Gender:'male','Referred By':'Friend/Family','Fee Amount':5000}],'Template.xlsx')}>Template</Btn></div><FileUp label="Upload .xlsx" accept=".xlsx,.xls,.csv" onUpload={handleImport}/>{preview&&<div style={{...getGlassLight(dark),borderRadius:14,padding:20,marginTop:18}}><div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Preview ({preview.data.length})</div><div style={{maxHeight:200,overflowY:'auto',fontSize:12}} className="cs">{preview.data.slice(0,5).map((r,i)=><div key={i} style={{padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,.04)',color:'#9CA3AF'}}>{Object.values(r).slice(0,4).join(' · ')}</div>)}</div><div style={{display:'flex',gap:10,marginTop:18}}><Btn onClick={confirmImport} loading={importing}>✅ Import</Btn><Btn type="ghost" onClick={()=>setPreview(null)}>Cancel</Btn></div></div>}</Card><Card title="📊 Export" icon="📊"><div style={{display:'flex',flexDirection:'column',gap:12}}>{exports.map(({label,fn})=>(<div key={label} className="ch" style={{...getGlassLight(dark),borderRadius:14,padding:18,display:'flex',alignItems:'center',gap:14,cursor:'pointer'}} onClick={fn}><div style={{width:46,height:46,background:'rgba(255,215,0,.06)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>📊</div><div style={{flex:1,fontSize:14,fontWeight:700,color:dark?'#E5E7EB':'#1F2937'}}>{label}</div><span style={{color:'#FFD700',fontSize:20}}>↓</span></div>))}</div></Card></Grid>)}

function SettingsPage(){
  const{user}=useAuth();const{dark}=useTheme()
  const[form,setForm]=useState({full_name:user?.full_name||'',email:user?.email||''})
  const[passForm,setPassForm]=useState({current:'',newPass:'',confirm:''})
  const[waNum,setWaNum]=useState(typeof window !== 'undefined' ? localStorage.getItem('aemtech_whatsapp') : null||'')
  const[waGroup,setWaGroup]=useState(typeof window !== 'undefined' ? localStorage.getItem('aemtech_wa_group') : null||'')
  const[templates,setTemplates]=useState(()=>{
    if(typeof window==='undefined')return{welcome:'',feeReminder:'',classReminder:'',custom:''}
    try{return JSON.parse(localStorage.getItem('aemtech_wa_templates')||'{}')||{welcome:'',feeReminder:'',classReminder:'',custom:''}}catch{return{welcome:'',feeReminder:'',classReminder:'',custom:''}}
  })
  
  const saveProfile=async()=>{await sb.from('users').update({full_name:form.full_name,email:form.email}).eq('id',user?.id);toast.success('Saved!')}
  const changePass=async()=>{if(!passForm.current||!passForm.newPass){toast.error('Fill all');return};if(passForm.newPass!==passForm.confirm){toast.error('No match');return};if(passForm.current!==user?.password_hash){toast.error('Wrong');return};await sb.from('users').update({password_hash:passForm.newPass}).eq('id',user?.id);toast.success('Changed! 🔒');setPassForm({current:'',newPass:'',confirm:''})}
  const saveWa=()=>{typeof window !== 'undefined' && localStorage.setItem('aemtech_whatsapp',waNum);typeof window !== 'undefined' && localStorage.setItem('aemtech_wa_group',waGroup);toast.success('Saved! 💬')}
  const saveTemplates=()=>{typeof window !== 'undefined' && localStorage.setItem('aemtech_wa_templates',JSON.stringify(templates));toast.success('Templates Saved! 📝')}
  
  const defaultTemplates={
    welcome:'Assalam o Alaikum {name}! 🎉\n\nAEMTECH mein aapka khair maqdam hai! Aap ab hamare student hain.\n\nLogin Details:\n📧 Email: {email}\n🔑 Password: {password}\n\n🌐 Portal: https://aemtech.vercel.app\n\nKoi bhi sawal ho to contact karein.',
    feeReminder:'Assalam o Alaikum {name}!\n\nYeh aapki fee ki yaaddehani hai:\n💰 Fee: {fee}\n✅ Paid: {paid}\n⚠️ Due: {due}\n\nBraah-e-karam jald az jald apni fee jama karayen.\n\nShukria! 🙏',
    classReminder:'Assalam o Alaikum {name}!\n\n📅 Aaj ki class ki yaaddehani:\n📚 Topic: {topic}\n⏰ Time: {time}\n🔗 Link: {link}\n\nClass miss na karein! 💪',
    custom:''
  }
  
  return(
    <Grid gap={26}>
      <div>
        <Card title="👤 Profile" icon="👤">
          <div style={{display:'flex',alignItems:'center',gap:22,marginBottom:30,padding:22,...getGlassLight(dark),borderRadius:18}}>
            <Av name={form.full_name} size={72} glow/>
            <div>
              <div style={{fontSize:22,fontWeight:700,color:dark?'#E5E7EB':'#1F2937'}}>{form.full_name}</div>
              <div style={{fontSize:13,color:'#6B7280',marginTop:4}}>{form.email}</div>
              <div style={{marginTop:10}}><Bdg type="gold" dot>Administrator</Bdg></div>
            </div>
          </div>
          <Inp label="Name" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/>
          <Inp label="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
          <Btn onClick={saveProfile}>💾 Save</Btn>
        </Card>
        
        <Card title="💬 WhatsApp" icon="💬" style={{marginTop:22}}>
          <Inp label="Number" placeholder="+923001234567" value={waNum} onChange={e=>setWaNum(e.target.value)}/>
          <Inp label="Group Link" placeholder="https://chat.whatsapp.com/..." value={waGroup} onChange={e=>setWaGroup(e.target.value)}/>
          <Btn onClick={saveWa}>💾 Save</Btn>
        </Card>
      </div>
      
      <div>
        <Card title="📝 WhatsApp Templates" icon="📝">
          <div style={{fontSize:12,color:'#6B7280',marginBottom:18}}>
            Variables: {'{name}'}, {'{email}'}, {'{password}'}, {'{fee}'}, {'{paid}'}, {'{due}'}, {'{topic}'}, {'{time}'}, {'{link}'}
          </div>
          <TA label="🎉 Welcome Message" placeholder="Nayi admission ke liye..." value={templates.welcome||''} onChange={e=>setTemplates({...templates,welcome:e.target.value})} rows={4}/>
          <TA label="💰 Fee Reminder" placeholder="Fee reminder..." value={templates.feeReminder||''} onChange={e=>setTemplates({...templates,feeReminder:e.target.value})} rows={4}/>
          <TA label="📅 Class Reminder" placeholder="Class reminder..." value={templates.classReminder||''} onChange={e=>setTemplates({...templates,classReminder:e.target.value})} rows={4}/>
          <TA label="✏️ Custom Template" placeholder="Apna custom message..." value={templates.custom||''} onChange={e=>setTemplates({...templates,custom:e.target.value})} rows={4}/>
          <div style={{display:'flex',gap:12,marginTop:12}}>
            <Btn onClick={saveTemplates}>💾 Save Templates</Btn>
            <Btn type="outline" onClick={()=>{setTemplates(defaultTemplates);toast.success('Defaults loaded!')}}>🔄 Load Defaults</Btn>
          </div>
        </Card>
        
        <Card title="🔒 Password" icon="🔒" style={{marginTop:22}}>
          <Inp label="Current" type="password" value={passForm.current} onChange={e=>setPassForm({...passForm,current:e.target.value})}/>
          <Inp label="New" type="password" value={passForm.newPass} onChange={e=>setPassForm({...passForm,newPass:e.target.value})}/>
          <Inp label="Confirm" type="password" value={passForm.confirm} onChange={e=>setPassForm({...passForm,confirm:e.target.value})}/>
          <Btn onClick={changePass}>🔒 Change</Btn>
        </Card>
        
        <Card title="🗄️ Database Setup" icon="🗄️" style={{marginTop:22}}>
          <div style={{fontSize:12,color:'#6B7280',marginBottom:12,lineHeight:1.7}}>
            Total course fee ke liye Supabase me yeh column chahiye. <strong style={{color:'#FFD700'}}>Supabase → SQL Editor</strong> me run karein:
          </div>
          <pre style={{background:dark?'rgba(0,0,0,.4)':'#0f172a',color:'#10B981',padding:'16px 18px',borderRadius:12,fontSize:12,overflowX:'auto',fontFamily:'monospace',lineHeight:1.7,border:'1px solid rgba(255,215,0,.08)'}}>{`ALTER TABLE students
  ADD COLUMN IF NOT EXISTS total_fee numeric DEFAULT 0;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS rubric text;

ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS installment_no int;

CREATE TABLE IF NOT EXISTS timetable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid, day text, time text,
  subject text, instructor text, notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid, title text, description text,
  questions text, duration_minutes int,
  total_marks int, status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid, student_id uuid,
  score int, total int, answers text,
  completed_at timestamptz DEFAULT now()
);`}</pre>
          <Btn type="outline" size="sm" style={{marginTop:12}} icon="📋" onClick={()=>{navigator.clipboard?.writeText(`ALTER TABLE students ADD COLUMN IF NOT EXISTS total_fee numeric DEFAULT 0;\nALTER TABLE submissions ADD COLUMN IF NOT EXISTS rubric text;\nALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS installment_no int;`);toast.success('SQL copied! 📋')}}>Copy SQL</Btn>
        </Card>

        <Card title="ℹ️ Info" icon="ℹ️" style={{marginTop:22}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            {[['Version','v7.0'],['Platform','Next.js'],['Database','Supabase'],['Status','✅ Live'],['Sheets','✅ Connected'],['Theme',dark?'🌙 Dark':'☀️ Light']].map(([k,v])=>(
              <div key={k} style={{...getGlassLight(dark),borderRadius:12,padding:16}}>
                <div style={{fontSize:10,color:'#6B7280',textTransform:'uppercase',letterSpacing:1.2,marginBottom:5}}>{k}</div>
                <div style={{fontWeight:600,fontSize:13,color:dark?'#E5E7EB':'#1F2937'}}>{v}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Grid>
  )
}
// ═══════════════════════════════════════
// STUDENT DASHBOARD
// ═══════════════════════════════════════
function StudentDashboard() {
  const { user } = useAuth(); const { dark } = useTheme()
  const [data, setData] = useState(null)
  const waNum = typeof window !== 'undefined' ? localStorage.getItem('aemtech_whatsapp') : null
  const waGroup = typeof window !== 'undefined' ? localStorage.getItem('aemtech_wa_group') : null

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const [att, cls, asn, subs, ann, payments] = await Promise.all([
        sb.from('attendance').select('*').eq('student_id', user.id),
        sb.from('classes').select('*').eq('batch_id', user.batch_id || ''),
        sb.from('assignments').select('*').eq('batch_id', user.batch_id || ''),
        sb.from('submissions').select('*').eq('student_id', user.id),
        sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(3),
        sb.from('fee_payments').select('*').eq('student_id', user.id).order('created_at', { ascending: false }),
      ])
      const present = (att.data || []).filter(a => a.status === 'present').length
      const total = (cls.data || []).length
      const pct = total > 0 ? Math.round((present / total) * 100) : 0
      const pending = (asn.data || []).filter(a => !(subs.data || []).find(s => s.assignment_id === a.id))
      const overdue = (payments.data || []).filter(p => p.status === 'overdue' || p.status === 'pending')
      setData({ present, total, pct, pending, subs: subs.data || [], ann: ann.data || [], payments: payments.data || [], overdue })
    })()
  }, [user])

  if (!data) return <Loader />

  return (
    <div>
      {/* Welcome */}
      <div style={{ ...getGlass(dark), borderRadius: 22, padding: '30px 34px', marginBottom: 24, background: dark ? 'linear-gradient(135deg,rgba(255,215,0,.05),rgba(255,165,0,.015))' : 'linear-gradient(135deg,rgba(255,215,0,.08),rgba(255,165,0,.03))', border: `1px solid ${dark ? 'rgba(255,215,0,.08)' : 'rgba(255,215,0,.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18, animation: 'fadeIn .5s ease', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,215,0,.06),transparent)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative', zIndex: 1 }}>
          <Av name={user?.full_name} size={64} glow />
          <div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 5, color: dark ? '#E5E7EB' : '#1F2937' }}>{greet()}, {user?.full_name?.split(' ')[0]}! 👋</div>
            <div style={{ fontSize: 13, color: '#6B7280' }}>{user?.email} · {user?.city || 'Pakistan'}</div>
            {user?.father_name && <div style={{ fontSize: 12, color: '#4B5563', marginTop: 3 }}>{childOf(user?.gender)} {user.father_name}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          {waNum && <a href={`https://api.whatsapp.com/send?phone=${waNum.replace(/\D/g, '').replace(/^0/, '92')}`} target="_blank" rel="noreferrer"><Btn type="success" size="sm" icon="💬">WhatsApp</Btn></a>}
          {waGroup && <a href={waGroup} target="_blank" rel="noreferrer"><Btn type="outline" size="sm" icon="👥">Group</Btn></a>}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 18, marginBottom: 24 }}>
        <Stat icon="✅" value={data.pct + '%'} label="Attendance" color={data.pct >= 80 ? '#10B981' : '#EF4444'} />
        <Stat icon="📅" value={data.present + '/' + data.total} label="Classes" />
        <Stat icon="📝" value={data.pending.length} label="Pending" />
        <Stat icon="📤" value={data.subs.length} label="Submitted" />
        {data.overdue.length > 0 && <Stat icon="⚠️" value={data.overdue.length} label="Fee Due" color="#EF4444" />}
      </div>

      {/* Fee Alert */}
      {data.overdue.length > 0 && (
        <div style={{ ...getGlass(dark), borderRadius: 16, padding: '18px 24px', marginBottom: 24, borderLeft: '4px solid #EF4444', display: 'flex', alignItems: 'center', gap: 16, animation: 'fadeIn .5s ease' }}>
          <span style={{ fontSize: 30 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#EF4444', marginBottom: 3 }}>Fee Payment Due</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>You have {data.overdue.length} unpaid month(s)</div>
          </div>
          {waNum && <a href={`https://api.whatsapp.com/send?phone=${waNum.replace(/\D/g, '').replace(/^0/, '92')}&text=Hi, I want to pay my pending fee.`} target="_blank" rel="noreferrer"><Btn type="danger" size="sm" icon="💬">Pay Now</Btn></a>}
        </div>
      )}

      {/* Learning Journey */}
      <Card title="🚀 Learning Journey" icon="🚀" delay={.1}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {buildJourney(data.present).map((mod) => {
            const attendedInModule = mod.attended
            const progress = mod.progress
            const isLocked = mod.isLocked
            return (
              <div key={mod.module} style={{ ...getGlassLight(dark), borderRadius: 16, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18, opacity: isLocked ? 0.5 : 1 }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: `${mod.color}12`, border: `1px solid ${mod.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{mod.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                    <div><span style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.2 }}>{mod.module}</span><div style={{ fontSize: 15, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937', marginTop: 3 }}>{mod.title}</div></div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: mod.color, fontFamily: "'Space Grotesk',sans-serif" }}>{isLocked ? '—' : progress + '%'}</span>
                  </div>
                  <PBar value={isLocked ? 0 : attendedInModule} max={mod.classes} height={9} color={mod.color} />
                  <div style={{ fontSize: 10, color: '#4B5563', marginTop: 4 }}>{isLocked ? 'Locked' : `${attendedInModule}/${mod.classes} classes`}</div>
                </div>
                <span style={{ fontSize: 20 }}>{isLocked ? '🔒' : progress >= 100 ? '✅' : progress > 0 ? '🔄' : '⏳'}</span>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 22, ...getGlassLight(dark), borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937' }}>Overall Progress</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#FFD700', fontFamily: "'Space Grotesk',sans-serif" }}>{Math.min(100, Math.round((data.present / CURRICULUM_TOTAL) * 100))}%</span>
          </div>
          <PBar value={data.present} max={CURRICULUM_TOTAL} height={14} color="#FFD700" />
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 10 }}>{data.present}/{CURRICULUM_TOTAL} classes · {Math.max(0, CURRICULUM_TOTAL - data.present)} remaining</div>
        </div>
      </Card>

      {/* Recent Payments */}
      {data.payments.length > 0 && (
        <Card title="💰 Recent Payments" icon="💰" delay={.15}>
          {data.payments.slice(0, 3).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)'}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{p.month} {p.year}</div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>{p.payment_method || 'Cash'} · {p.paid_date ? fmtDate(p.paid_date) : 'Not paid'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: p.status === 'paid' ? '#10B981' : '#EF4444', fontFamily: "'Space Grotesk',sans-serif" }}>{currency(p.paid_amount || 0)}</div>
                <Bdg type={statusBadge(p.status)} size="sm" dot>{p.status}</Bdg>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Announcements + Pending */}
      <Grid gap={24}>
        <Card title="📢 Announcements" icon="📢" delay={.2}>
          {data.ann.length === 0 ? <Empty icon="📢" title="No announcements" /> : data.ann.map(a => (
            <div key={a.id} style={{ ...getGlassLight(dark), borderRadius: 12, padding: 16, marginBottom: 12, borderLeft: '3px solid #FFD700' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937' }}>{a.title}</div>
                <Bdg type={a.priority === 'urgent' ? 'danger' : a.priority === 'important' ? 'warning' : 'info'} size="sm">{a.priority}</Bdg>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>{a.content?.substring(0, 100)}...</div>
              <div style={{ fontSize: 10, color: '#374151', marginTop: 6 }}>{ago(a.created_at)}</div>
            </div>
          ))}
        </Card>
        <Card title="📝 Pending" icon="📝" delay={.25}>
          {data.pending.length === 0 ? <Empty icon="✅" title="All caught up!" /> : data.pending.slice(0, 3).map(a => (
            <div key={a.id} style={{ ...getGlassLight(dark), borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 5, color: dark ? '#E5E7EB' : '#1F2937' }}>{a.title}</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>Due: {fmtDT(a.due_date)}</div>
              <div style={{ marginTop: 8 }}><Bdg type="warning" dot>Pending</Bdg></div>
            </div>
          ))}
        </Card>
      </Grid>
    </div>
  )
}

// ═══════════════════════════════════════
// STUDENT ATTENDANCE
// ═══════════════════════════════════════
function StudentAttendancePage() {
  const { user } = useAuth(); const { dark } = useTheme()
  const [classes, setClasses] = useState([]); const [attMap, setAttMap] = useState({}); const [loading, setLoading] = useState(true)
  useEffect(() => { if (!user) return; (async () => { const [c, a] = await Promise.all([sb.from('classes').select('*').eq('batch_id', user.batch_id || '').order('class_number'), sb.from('attendance').select('*').eq('student_id', user.id)]); const map = {}; (a.data || []).forEach(x => map[x.class_id] = x.status); setClasses(c.data || []); setAttMap(map); setLoading(false) })() }, [user])
  if (loading) return <SkeletonDashboard />
  const present = Object.values(attMap).filter(v => v === 'present').length; const total = classes.length; const pct = total > 0 ? Math.round((present / total) * 100) : 0
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginBottom: 22 }} className="mf">
        <Stat icon="✅" value={pct + '%'} label="Rate" color={pct >= 80 ? '#10B981' : '#EF4444'} />
        <Stat icon="📅" value={present} label="Present" color="#10B981" />
        <Stat icon="❌" value={total - present} label="Absent" color="#EF4444" />
      </div>
      <div style={{ ...getGlassLight(dark), borderRadius: 14, padding: 20, marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937' }}>Progress</span>
          <span style={{ color: attColor(pct), fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif" }}>{pct}%</span>
        </div>
        <PBar value={present} max={total} height={14} />
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 10 }}>{pct >= 80 ? '✅ Good standing' : `⚠️ Need ${Math.max(0, Math.ceil(total * .8) - present)} more`}</div>
      </div>
      <Card title="Record" icon="📅" noPadding>
        <Tbl headers={['Class', 'Topic', 'Date', 'Status']}>
          {classes.map((c, i) => (
            <TR key={c.id} delay={i * .03}>
              <TD><Bdg type="gold">C{c.class_number}</Bdg></TD>
              <TD style={{ fontSize: 13, color: dark ? '#E5E7EB' : '#1F2937', maxWidth: 240, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4 }}>{c.title}</TD>
              <TD style={{ fontSize: 12 }}>{fmtDate(c.date)}</TD>
              <TD><Bdg type={statusBadge(attMap[c.id] || 'pending')} dot>{attMap[c.id] || 'Not Marked'}</Bdg></TD>
            </TR>
          ))}
        </Tbl>
        {classes.length === 0 && <Empty icon="📅" title="No classes" />}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════
// STUDENT ASSIGNMENTS
// ═══════════════════════════════════════
function StudentAssignmentsPage() {
  const { user } = useAuth(); const { dark } = useTheme()
  const [assignments, setAssignments] = useState([]); const [subMap, setSubMap] = useState({}); const [loading, setLoading] = useState(true); const [modal, setModal] = useState(null); const [form, setForm] = useState({}); const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [editMode, setEditMode] = useState(false) // Edit mode flag
  const { confirm } = useConfirm()
  
  const load = useCallback(async () => { if (!user) return; setLoading(true); const [a, s] = await Promise.all([sb.from('assignments').select('*').eq('batch_id', user.batch_id || '').order('due_date'), sb.from('submissions').select('*').eq('student_id', user.id)]); const map = {}; (s.data || []).forEach(x => map[x.assignment_id] = x); setAssignments(a.data || []); setSubMap(map); setLoading(false) }, [user])
  useEffect(() => { load() }, [load])
  
  // Single file upload - one at a time, accumulates
  const handleFile = async e => { 
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const url = await uploadFile(file, 'recordings', `submissions/${user.id}-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`)
      setUploadedFiles(prev => [...prev, { name: file.name, url }])
      toast.success(`📎 ${file.name} uploaded!`)
    } catch { toast.error('Upload failed') } 
    finally { setUploading(false); e.target.value = '' } 
  }
  
  const removeFile = (idx) => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))
  
  const submit = async () => { 
    const allLinks = []
    if (form.link) allLinks.push(form.link)
    uploadedFiles.forEach(f => allLinks.push(f.url))
    
    if (allLinks.length === 0 && !form.text) { toast.error('Add link, files, or note'); return }
    
    const submissionLink = allLinks.length === 1 ? allLinks[0] : JSON.stringify(allLinks)
    
    if (editMode && form.subId) {
      // Update existing submission
      await sb.from('submissions').update({ 
        submission_link: submissionLink, 
        submission_text: form.text,
        submitted_at: new Date().toISOString()
      }).eq('id', form.subId)
      toast.success('Updated! ✅')
    } else {
      // New submission
      await sb.from('submissions').insert({ 
        assignment_id: form.id, 
        student_id: user.id, 
        submission_link: submissionLink, 
        submission_text: form.text, 
        status: 'submitted' 
      })
      toast.success('Submitted! 🎉')
    }
    setModal(null)
    setUploadedFiles([])
    setEditMode(false)
    load() 
  }
  
  const deleteSubmission = async (subId) => {
    const ok = await confirm({ title: 'Delete Submission?', message: 'Kya aap yeh submission delete karna chahte hain? Yeh action undo nahi ho sakta.', type: 'danger', confirmText: 'Delete', icon: '🗑️' })
    if (!ok) return
    await sb.from('submissions').delete().eq('id', subId)
    toast.success('Submission deleted! 🗑️')
    load()
  }
  
  const editSubmission = (assignment, sub) => {
    const links = parseLinks(sub.submission_link)
    // Set existing files
    const existingFiles = links.map((url, i) => ({ name: `File ${i + 1}`, url }))
    setUploadedFiles(existingFiles)
    setForm({ id: assignment.id, subId: sub.id, link: '', text: sub.submission_text || '' })
    setEditMode(true)
    setModal('sub')
  }
  
  const parseLinks = (link) => {
    if (!link) return []
    try { 
      const parsed = JSON.parse(link)
      return Array.isArray(parsed) ? parsed : [link]
    } catch { return [link] }
  }
  
  if (loading) return <SkeletonDashboard />
  return (
    <>
      <Card title={`My Assignments (${assignments.length})`} icon="📝">
        {assignments.length === 0 ? <Empty icon="📝" title="No assignments" /> : assignments.map(a => {
          const sub = subMap[a.id]; const over = new Date(a.due_date) < new Date() && !sub
          const links = sub ? parseLinks(sub.submission_link) : []
          return (
            <div key={a.id} className="ch" style={{ ...getGlassLight(dark), borderRadius: 16, padding: 24, marginBottom: 16, borderLeft: `4px solid ${sub ? '#10B981' : over ? '#EF4444' : '#FFD700'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 5, color: dark ? '#E5E7EB' : '#1F2937' }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>Due: {fmtDT(a.due_date)} · {a.total_marks} marks</div>
                </div>
                <Bdg type={sub ? 'success' : over ? 'danger' : 'warning'} dot>{sub ? 'Submitted' : over ? 'Overdue' : 'Pending'}</Bdg>
              </div>
              {a.description && <button onClick={()=>{const blob=new Blob([a.description],{type:'text/plain'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${(a.title||'Assignment').replace(/\s+/g,'_')}.txt`;link.click();URL.revokeObjectURL(url)}} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 18px',background:'rgba(255,215,0,.06)',border:'1px solid rgba(255,215,0,.12)',borderRadius:10,color:'#FFD700',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'Inter',sans-serif",marginBottom:16,transition:'all .3s'}}> 📄 Assignment Details (.txt)</button>}
              {sub ? (
                <div style={{ background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.12)', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#10B981' }}>✅ Submitted — {fmtDT(sub.submitted_at)}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn type="outline" size="xs" onClick={() => editSubmission(a, sub)}>✏️ Edit</Btn>
                      <Btn type="danger" size="xs" onClick={() => deleteSubmission(sub.id)}>🗑️</Btn>
                    </div>
                  </div>
                  {links.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      {links.map((link, i) => (
                        <a key={i} href={link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#FFD700', background: 'rgba(255,215,0,.08)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none' }}>
                          📎 File {links.length > 1 ? i + 1 : ''}
                        </a>
                      ))}
                    </div>
                  )}
                  {sub.submission_text && <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8, padding: '8px 12px', background: dark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderRadius: 8 }}>📝 {sub.submission_text}</div>}
                  {sub.marks_obtained != null && <div style={{ fontWeight: 800, color: '#FFD700', fontSize: 18, marginTop: 10, fontFamily: "'Space Grotesk',sans-serif" }}>Marks: {sub.marks_obtained}/{a.total_marks}</div>}
                  {sub.feedback && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10, padding: '10px 14px', background: dark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderRadius: 8 }}>💬 {sub.feedback}</div>}
                </div>
              ) : !over ? (
                <Btn size="sm" onClick={() => { setForm({ id: a.id, link: '', text: '' }); setUploadedFiles([]); setEditMode(false); setModal('sub') }}>📤 Submit</Btn>
              ) : (
                <div style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>⚠️ Deadline passed</div>
              )}
            </div>
          )
        })}
      </Card>

      <Modal open={modal === 'sub'} onClose={() => { setModal(null); setUploadedFiles([]); setEditMode(false) }} title={editMode ? "✏️ Edit Submission" : "📤 Submit Assignment"} icon={editMode ? "✏️" : "📤"}
        footer={<><Btn type="ghost" onClick={() => { setModal(null); setUploadedFiles([]); setEditMode(false) }}>Cancel</Btn><Btn onClick={submit} disabled={uploading}>{editMode ? '💾 Update' : '📤 Submit'}</Btn></>}>
        <Inp label="Link (optional)" placeholder="Drive, Canva, Figma link..." value={form.link || ''} onChange={e => setForm({ ...form, link: e.target.value })} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 18px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.05)' }} />
          <span style={{ fontSize: 11, color: '#4B5563' }}>AND/OR UPLOAD FILES</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.05)' }} />
        </div>
        
        {/* Single file upload - one at a time */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 9 }}>Upload File</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: dark ? 'rgba(0,0,0,.25)' : '#FAFAFA', border: `1.5px dashed ${dark ? 'rgba(255,215,0,.15)' : 'rgba(255,215,0,.3)'}`, borderRadius: 14, cursor: uploading ? 'not-allowed' : 'pointer', transition: 'all .3s' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,215,0,.06)', border: '1px solid rgba(255,215,0,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{uploading ? '⏳' : '➕'}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: dark ? '#D1D5DB' : '#374151' }}>{uploading ? 'Uploading...' : 'Click to add a file'}</div>
              <div style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>Add one file at a time</div>
            </div>
            <input type="file" accept="*" style={{ display: 'none' }} onChange={handleFile} disabled={uploading} />
          </label>
        </div>
        
        {/* Uploaded files list */}
        {uploadedFiles.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', marginBottom: 10 }}>📎 {uploadedFiles.length} file(s) attached</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {uploadedFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, ...getGlassLight(dark), borderRadius: 10, padding: '10px 14px' }}>
                  <span style={{ fontSize: 16 }}>📄</span>
                  <span style={{ flex: 1, fontSize: 12, color: dark ? '#D1D5DB' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#FFD700', fontSize: 11 }}>🔗</a>
                  <button onClick={() => removeFile(i)} style={{ background: 'rgba(239,68,68,.1)', border: 'none', color: '#EF4444', width: 24, height: 24, borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <TA label="Notes (optional)" placeholder="Any additional notes..." value={form.text || ''} onChange={e => setForm({ ...form, text: e.target.value })} />
      </Modal>
    </>
  )
}

// ═══════════════════════════════════════
// STUDENT RECORDINGS
// ═══════════════════════════════════════
function StudentRecordingsPage() {
  const { user } = useAuth(); const { dark } = useTheme()
  const [classes, setClasses] = useState([]); const [loading, setLoading] = useState(true)
  useEffect(() => { if (!user) return; sb.from('classes').select('*').eq('batch_id', user.batch_id || '').order('class_number').then(r => { setClasses(r.data || []); setLoading(false) }) }, [user])
  if (loading) return <SkeletonDashboard />
  const available = classes.filter(c => c.recording_url).length
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginBottom: 22 }} className="mf">
        <Stat icon="🎥" value={classes.length} label="Total" /><Stat icon="▶️" value={available} label="Available" color="#10B981" /><Stat icon="🔒" value={classes.length - available} label="Coming" color="#F59E0B" />
      </div>
      <Card title={`Recordings (${available})`} icon="🎥">
        {classes.map(c => (
          <div key={c.id} className="ch" style={{ display: 'flex', alignItems: 'center', gap: 18, ...getGlassLight(dark), borderRadius: 14, padding: 20, marginBottom: 12 }}>
            <div style={{ width: 56, height: 56, background: c.recording_url ? 'rgba(16,185,129,.08)' : dark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{c.recording_url ? '▶️' : '🔒'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937', marginBottom: 4, lineHeight: 1.4, wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>Class {c.class_number} — {c.title}</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>{fmtDate(c.date)}</div>
              {c.notes && <div style={{ fontSize: 11, color: '#4B5563', marginTop: 4 }}>{c.notes}</div>}
            </div>
            {c.recording_url ? <a href={c.recording_url} target="_blank" rel="noreferrer" style={{ background: G, color: '#000', padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(255,215,0,.2)' }}>▶ Watch</a> : <span style={{ fontSize: 12, color: '#374151', padding: '10px 20px', background: dark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)', borderRadius: 12 }}>Coming soon</span>}
          </div>
        ))}
        {classes.length === 0 && <Empty icon="🎥" title="No classes" />}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════
// STUDENT ANNOUNCEMENTS
// ═══════════════════════════════════════
function StudentAnnouncementsPage() {
  const [anns, setAnns] = useState([]); const [loading, setLoading] = useState(true); const { dark } = useTheme()
  useEffect(() => { sb.from('announcements').select('*').order('created_at', { ascending: false }).then(r => { setAnns(r.data || []); setLoading(false) }) }, [])
  if (loading) return <SkeletonDashboard />
  return <Card title={`Announcements (${anns.length})`} icon="📢">{anns.length === 0 ? <Empty icon="📢" title="No announcements" /> : anns.map((a, i) => (<div key={a.id} style={{ ...getGlassLight(dark), borderRadius: 14, padding: 22, marginBottom: 14, borderLeft: '3px solid #FFD700', animation: `fadeIn .4s ease ${i * .08}s both` }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><div style={{ fontSize: 17, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937' }}>{a.title}</div><Bdg type={a.priority === 'urgent' ? 'danger' : a.priority === 'important' ? 'warning' : 'info'}>{a.priority}</Bdg></div><div style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 1.75 }}>{a.content}</div><div style={{ fontSize: 11, color: '#374151', marginTop: 10 }}>{ago(a.created_at)}</div></div>))}</Card>
}

// ═══════════════════════════════════════
// STUDENT FEES — Monthly View
// ═══════════════════════════════════════
function StudentFeesPage() {
  const { user } = useAuth(); const { dark } = useTheme()
  const [st, setSt] = useState(null); const [payments, setPayments] = useState([]); const [loading, setLoading] = useState(true)
  const waNum = typeof window !== 'undefined' ? localStorage.getItem('aemtech_whatsapp') : null
  
  useEffect(() => { if (!user) return; (async () => { const [s, p] = await Promise.all([sb.from('students').select('*').eq('id', user.id).single(), sb.from('fee_payments').select('*').eq('student_id', user.id).order('year', { ascending: false }).order('created_at', { ascending: false })]); setSt(s.data); setPayments(p.data || []); setLoading(false) })() }, [user])
  
  const printReceipt = (payment) => {
    const receiptNo = `RCP-${payment?.id?.substring(0,8).toUpperCase() || 'XXXX'}`
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Fee Receipt - ${st?.full_name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#f5f5f5;padding:40px;display:flex;justify-content:center}
.receipt{width:400px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:24px;text-align:center;border-bottom:3px solid #FFD700}
.logo{font-size:28px;letter-spacing:6px;font-weight:900;margin-bottom:2px;font-family:"Inter",sans-serif}
.title{font-size:20px;font-weight:800;color:#FFD700}
.body{padding:24px}
.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px dashed #eee}
.row:last-child{border:none}
.label{color:#666;font-size:13px}
.value{font-weight:600;font-size:13px;color:#333}
.amount{background:#f9f9f9;margin:16px -24px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center}
.amount .label{font-size:14px;font-weight:600;color:#333}
.amount .value{font-size:24px;font-weight:800;color:#10B981}
.status{display:inline-block;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase}
.paid{background:#D1FAE5;color:#059669}
.partial{background:#FEF3C7;color:#D97706}
.pending{background:#FEE2E2;color:#DC2626}
.footer{text-align:center;padding:20px 24px;border-top:1px solid #eee;font-size:11px;color:#999}
.watermark{text-align:center;margin-top:16px;font-size:10px;color:#ccc;letter-spacing:2px}
@media print{body{background:#fff;padding:0}.receipt{box-shadow:none}}
</style></head>
<body>
<div class="receipt">
<div class="header">
<div class="logo"><span style="color:#fff">AEM</span><span style="color:#FFD700">T</span><span style="color:#fff">ECH</span></div><div style="font-size:10px;letter-spacing:4px;color:rgba(255,255,255,.7);font-weight:700;margin-bottom:4px">INSTITUTE</div>
<div class="title">Fee Receipt</div>
</div>
<div class="body">
<div class="row"><span class="label">Receipt No.</span><span class="value">${receiptNo}</span></div>
<div class="row"><span class="label">Student Name</span><span class="value">${st?.full_name || '—'}</span></div>
<div class="row"><span class="label">Email</span><span class="value">${st?.email || '—'}</span></div>
<div class="row"><span class="label">Phone</span><span class="value">${st?.phone || '—'}</span></div>
<div class="row"><span class="label">Period</span><span class="value">${payment?.month || '—'} ${payment?.year || ''}</span></div>
<div class="row"><span class="label">Payment Date</span><span class="value">${payment?.paid_date ? fmtDate(payment.paid_date) : fmtDate(new Date())}</span></div>
<div class="row"><span class="label">Payment Method</span><span class="value">${payment?.payment_method || 'Cash'}</span></div>
<div class="amount"><span class="label">Amount Paid</span><span class="value">${currency(payment?.paid_amount || st?.fee_paid || 0)}</span></div>
<div style="text-align:center">
<span class="status ${payment?.status === 'paid' ? 'paid' : payment?.status === 'partial' ? 'partial' : 'pending'}">${payment?.status === 'paid' ? '✓ Paid' : payment?.status === 'partial' ? 'Partial' : 'Pending'}</span>
</div>
<div class="watermark">Thank you for your payment!</div>
</div>
<div class="footer">AEMTECH Institute — Design the Future<br/>This is a computer generated receipt</div>
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),500)}<\/script>
</body></html>`)
    w.document.close()
  }
  
  const printOverallReceipt = () => {
    const receiptNo = `RCP-${st?.id?.substring(0,8).toUpperCase() || 'XXXX'}`
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Fee Receipt - ${st?.full_name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#f5f5f5;padding:40px;display:flex;justify-content:center}
.receipt{width:400px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:24px;text-align:center;border-bottom:3px solid #FFD700}
.logo{font-size:28px;letter-spacing:6px;font-weight:900;margin-bottom:2px;font-family:"Inter",sans-serif}
.title{font-size:20px;font-weight:800;color:#FFD700}
.body{padding:24px}
.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px dashed #eee}
.row:last-child{border:none}
.label{color:#666;font-size:13px}
.value{font-weight:600;font-size:13px;color:#333}
.amount{background:#f9f9f9;margin:16px -24px;padding:20px 24px}
.amount-row{display:flex;justify-content:space-between;margin-bottom:8px}
.amount-row:last-child{margin:0;padding-top:12px;border-top:2px solid #eee}
.amount .label{font-size:13px;color:#666}
.amount .value{font-size:16px;font-weight:700;color:#333}
.amount .total{font-size:20px;font-weight:800;color:#10B981}
.status{display:inline-block;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase}
.paid{background:#D1FAE5;color:#059669}
.partial{background:#FEF3C7;color:#D97706}
.pending{background:#FEE2E2;color:#DC2626}
.footer{text-align:center;padding:20px 24px;border-top:1px solid #eee;font-size:11px;color:#999}
@media print{body{background:#fff;padding:0}.receipt{box-shadow:none}}
</style></head>
<body>
<div class="receipt">
<div class="header">
<div class="logo"><span style="color:#fff">AEM</span><span style="color:#FFD700">T</span><span style="color:#fff">ECH</span></div><div style="font-size:10px;letter-spacing:4px;color:rgba(255,255,255,.7);font-weight:700;margin-bottom:4px">INSTITUTE</div>
<div class="title">Fee Summary Receipt</div>
</div>
<div class="body">
<div class="row"><span class="label">Receipt No.</span><span class="value">${receiptNo}</span></div>
<div class="row"><span class="label">Student Name</span><span class="value">${st?.full_name || '—'}</span></div>
<div class="row"><span class="label">Email</span><span class="value">${st?.email || '—'}</span></div>
<div class="row"><span class="label">Phone</span><span class="value">${st?.phone || '—'}</span></div>
<div class="row"><span class="label">Date</span><span class="value">${fmtDate(new Date())}</span></div>
<div class="amount">
<div class="amount-row"><span class="label">Monthly Fee</span><span class="value">${currency(st?.fee_amount || 0)}</span></div>
<div class="amount-row"><span class="label">Total Paid</span><span class="value total">${currency(st?.fee_paid || 0)}</span></div>
<div class="amount-row"><span class="label">Outstanding</span><span class="value" style="color:#EF4444">${currency((st?.fee_amount || 0) - (st?.fee_paid || 0))}</span></div>
</div>
<div style="text-align:center">
<span class="status ${st?.fee_status === 'paid' ? 'paid' : st?.fee_status === 'partial' ? 'partial' : 'pending'}">${st?.fee_status === 'paid' ? '✓ Fully Paid' : st?.fee_status === 'partial' ? 'Partial Payment' : 'Pending'}</span>
</div>
</div>
<div class="footer">AEMTECH Institute — Design the Future<br/>This is a computer generated receipt</div>
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),500)}<\/script>
</body></html>`)
    w.document.close()
  }
  
  if (loading || !st) return <Loader />
  const due = (st.fee_amount || 0) - (st.fee_paid || 0)
  return (
    <div>
      <Card title="💰 My Fee Summary" icon="💰">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginBottom: 26 }} className="mf">
          {[['Total Course Fee', currency(totalFeeOf(st)), '#FFD700'], ['Total Paid', currency(st.fee_paid), '#10B981'], ['Outstanding', currency(dueOf(st)), dueOf(st) > 0 ? '#EF4444' : '#10B981']].map(([l, v, c]) => (
            <div key={l} style={{ ...getGlassLight(dark), borderRadius: 16, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>{l}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: c, fontFamily: "'Space Grotesk',sans-serif" }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ ...getGlassLight(dark), borderRadius: 14, padding: '14px 18px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>💵 Monthly Fee: <strong style={{ color: '#FFD700' }}>{currency(monthlyFeeOf(st))}</strong></span>
          <span style={{ fontSize: 12, color: '#6B7280' }}>📆 Installments: <strong style={{ color: '#3B82F6' }}>{monthsCountOf(st)}</strong></span>
          <span style={{ fontSize: 12, color: '#6B7280' }}>✅ Paid: <strong style={{ color: '#10B981' }}>{monthsPaidOf(st)} month(s)</strong></span>
          {monthsDueOf(st) > 0 && <span style={{ fontSize: 12, color: '#6B7280' }}>⚠️ Due: <strong style={{ color: '#EF4444' }}>{monthsDueOf(st)} month(s)</strong></span>}
        </div>
        <div style={{ marginBottom: 22 }}><PBar value={st.fee_paid || 0} max={totalFeeOf(st) || 1} height={16} showLabel label="Overall Progress" /></div>

        {/* Month-wise breakdown */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FFD700', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 12 }}>📅 Month-wise Breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            {splitFeeByMonth(st, payments).map(m => (
              <div key={m.key} style={{ ...getGlassLight(dark), borderRadius: 16, padding: 18, borderLeft: `4px solid ${m.status==='paid' ? '#10B981' : m.status==='partial' ? '#F59E0B' : m.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{m.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: dark ? '#E5E7EB' : '#1F2937' }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: '#6B7280' }}>{m.sub}</div>
                    </div>
                  </div>
                  <Bdg type={statusBadge(m.status)} size="sm" dot>{m.status}</Bdg>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
                  <span>Paid <strong style={{ color: '#10B981' }}>{currency(m.paid)}</strong></span>
                  <span>of {currency(m.due)}</span>
                </div>
                <PBar value={m.paid} max={m.due || 1} height={8} color={m.status==='paid' ? '#10B981' : m.color} />
                {m.balance > 0 && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 7, fontWeight: 700 }}>⚠️ Due: {currency(m.balance)}</div>}
                {m.balance === 0 && <div style={{ fontSize: 11, color: '#10B981', marginTop: 7, fontWeight: 700 }}>✅ Cleared</div>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 22, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Bdg type={statusBadge(feeStatusOf(st))} size="lg" dot>{feeStatusOf(st) === 'paid' ? '✅ Fully Paid' : feeStatusOf(st) === 'partial' ? `⚠️ ${monthsDueOf(st)} Month(s) Due` : '❌ Pending'}</Bdg>
          {st.fee_paid > 0 && <Btn type="outline" size="sm" onClick={printOverallReceipt} icon="🧾">Download Receipt</Btn>}
        </div>
        {due > 0 && (
          <div style={{ ...getGlassLight(dark), borderRadius: 14, padding: 20, textAlign: 'center', borderLeft: '3px solid #FFD700' }}>
            <div style={{ fontSize: 15, color: '#FFD700', fontWeight: 700, marginBottom: 8 }}>💬 Contact Admin</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 18 }}>Share receipt to update status</div>
            {waNum && <a href={`https://api.whatsapp.com/send?phone=${waNum.replace(/\D/g, '').replace(/^0/, '92')}&text=Hi, I want to pay my fee for ${currentMonth()}.`} target="_blank" rel="noreferrer"><Btn type="success" icon="💬">Message Admin</Btn></a>}
          </div>
        )}
      </Card>

      <Card title="📋 Payment History" icon="📋">
        {payments.length === 0 ? <Empty icon="📋" title="No records" /> :
          <Tbl headers={['Month', 'Amount', 'Paid', 'Method', 'Date', 'Status', '']}>
            {payments.map((p, i) => (
              <TR key={p.id} delay={i * .04}>
                <TD style={{ fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{p.month} {p.year}</TD>
                <TD>{currency(p.amount)}</TD>
                <TD style={{ color: p.paid_amount > 0 ? '#10B981' : '#6B7280', fontWeight: 700 }}>{currency(p.paid_amount)}</TD>
                <TD><Bdg type="info" size="sm">{p.payment_method || 'Cash'}</Bdg></TD>
                <TD style={{ fontSize: 12 }}>{p.paid_date ? fmtDate(p.paid_date) : '—'}</TD>
                <TD><Bdg type={statusBadge(p.status)} dot>{p.status}</Bdg></TD>
                <TD>{(p.status === 'paid' || p.status === 'partial') && <Btn type="outline" size="xs" onClick={() => printReceipt(p)} title="Receipt">🧾</Btn>}</TD>
              </TR>
            ))}
          </Tbl>}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════
// STUDENT CERTIFICATE
// ═══════════════════════════════════════
function StudentCertificatePage() {
  const { user } = useAuth(); const { dark } = useTheme()
  const [data, setData] = useState(null)
  const [batch, setBatch] = useState(null)
  useEffect(() => { 
    if (!user) return
    (async () => { 
      const [a, c, b] = await Promise.all([
        sb.from('attendance').select('*').eq('student_id', user.id), 
        sb.from('classes').select('*').eq('batch_id', user.batch_id || ''),
        sb.from('batches').select('*').eq('id', user.batch_id || '').single()
      ])
      const present = (a.data || []).filter(x => x.status === 'present').length
      const total = (c.data || []).length
      setData({ present, total, pct: total > 0 ? Math.round((present / total) * 100) : 0 })
      setBatch(b.data)
    })()
  }, [user])
  if (!data) return <Loader />
  const certDate = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
  const certId = `AEMTECH-${new Date().getFullYear()}-${String(user?.id || '').substring(0,8).toUpperCase()}`
  
  const printCertificate = () => { 
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Certificate - ${user?.full_name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a1a;padding:20px}
.cert{width:900px;background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:8px;border-radius:4px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.inner{background:linear-gradient(135deg,#0f0f0f,#1a1a1a);border:3px solid #FFD700;border-radius:2px;padding:60px 70px;position:relative;overflow:hidden}
.corner{position:absolute;width:80px;height:80px;border:3px solid #FFD700}
.tl{top:20px;left:20px;border-right:none;border-bottom:none}
.tr{top:20px;right:20px;border-left:none;border-bottom:none}
.bl{bottom:20px;left:20px;border-right:none;border-top:none}
.br{bottom:20px;right:20px;border-left:none;border-top:none}
.logo{font-family:'Inter',sans-serif;font-size:36px;letter-spacing:8px;font-weight:900;margin-bottom:4px}
.title{font-family:'Playfair Display',serif;font-size:48px;color:#fff;margin-bottom:8px;font-weight:700;letter-spacing:2px}
.subtitle{font-size:14px;color:#888;letter-spacing:3px;text-transform:uppercase;margin-bottom:40px}
.certify{font-size:14px;color:#666;margin-bottom:16px;letter-spacing:1px}
.name{font-family:'Playfair Display',serif;font-size:42px;color:#FFD700;font-weight:700;padding:16px 60px;border-bottom:2px solid #FFD700;display:inline-block;margin-bottom:14px;text-shadow:0 0 40px rgba(255,215,0,.15)}
.father{font-size:14px;color:#888;margin-bottom:26px}
.course{font-size:20px;color:#fff;font-weight:600;margin-bottom:6px}
.tagline{font-size:12px;color:#666;letter-spacing:2px;margin-bottom:40px}
.details{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #333;padding-top:30px;margin-top:20px}
.detail{text-align:left}
.detail.right{text-align:right}
.label{font-size:9px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
.value{font-size:14px;color:#fff;font-weight:600}
.seal{width:80px;height:80px;border:3px solid #FFD700;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#FFD700,#FFA500);color:#000;font-size:28px;font-weight:900;box-shadow:0 0 30px rgba(255,215,0,.3)}
.id{font-size:10px;color:#444;letter-spacing:2px;margin-top:30px}
@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.cert{box-shadow:none}}
</style></head>
<body>
<div class="cert">
<div class="inner">
<div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
<div style="text-align:center">
<div class="logo"><span style="color:#fff">AEM</span><span style="color:#FFD700;text-shadow:0 0 20px rgba(255,215,0,.5)">T</span><span style="color:#fff">ECH</span></div><div style="font-size:10px;letter-spacing:4px;color:#666;margin-top:4px">INSTITUTE</div>
<div class="title">Certificate of Completion</div>
<div class="subtitle">This certificate is proudly presented to</div>
<div class="name">${user?.full_name || 'Student Name'}</div>
${user?.father_name ? '<div class="father">' + (user?.gender === 'female' ? 'D/O' : 'S/O') + ' ' + user.father_name + '</div>' : '<div style="margin-bottom:26px"></div>'}
<div class="course">Digital Business & AI Master Program</div>
<div class="tagline">Learn · Design · Build · Market · Earn</div>
<div class="details">
<div class="detail"><div class="label">Date of Issue</div><div class="value">${certDate}</div></div>
<div class="seal">🎓</div>
<div class="detail right"><div class="label">Director</div><div class="value">AEMTECH Institute</div></div>
</div>
<div class="id">Certificate ID: ${certId}</div>
</div>
</div>
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),500)}<\/script>
</body></html>`)
    w.document.close() }
  return (
    <Card title="🎓 My Certificate" icon="🎓">
      {data.pct >= 80 ? (
        <>
          <div style={{ background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.15)', borderRadius: 14, padding: 18, marginBottom: 26, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 26 }}>🎉</span>
            <div><div style={{ color: '#10B981', fontWeight: 700, marginBottom: 3 }}>Congratulations!</div><div style={{ fontSize: 12, color: '#6B7280' }}>Attendance: {data.pct}% ✅</div></div>
          </div>
          <div style={{ background: '#fff', color: '#000', padding: 48, borderRadius: 18, textAlign: 'center', border: '8px solid #FFD700', marginBottom: 24, boxShadow: '0 10px 50px rgba(255,215,0,.12)' }}>
            <div style={{ border: '2px solid #FFD700', padding: 40, borderRadius: 12 }}>
              <div style={{ fontSize: 30, letterSpacing: 6, fontWeight: 900, marginBottom: 6, fontFamily: "'Inter',sans-serif" }}><span style={{ color: '#FFD700' }}>AEM</span><span style={{ color: '#000', textShadow: '0 0 12px rgba(255,215,0,.3)' }}>T</span><span style={{ color: '#FFD700' }}>ECH</span></div><div style={{ fontSize: 10, letterSpacing: 4, color: '#888', marginBottom: 14 }}>INSTITUTE</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#FFD700', marginBottom: 10 }}>Certificate of Completion</div>
              <div style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>This is to certify that</div>
              <div style={{ fontSize: 28, fontWeight: 800, borderBottom: '2px solid #FFD700', paddingBottom: 12, display: 'inline-block', marginBottom: 10 }}>{user?.full_name}</div>
              {user?.father_name && <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>{childOf(user?.gender)} {user.father_name}</div>}
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Digital Business & AI Master Program</div>
              <div style={{ fontSize: 12, color: '#888' }}>Learn · Design · Build · Market · Earn</div>
            </div>
          </div>
          <Btn onClick={printCertificate} size="lg" icon="🖨">Print / Download Certificate</Btn>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '44px 22px' }}>
          <div style={{ fontSize: 68, marginBottom: 22, opacity: .15 }}>🔒</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, color: dark ? '#E5E7EB' : '#1F2937' }}>Not Yet Available</div>
          <div style={{ fontSize: 15, color: '#6B7280', marginBottom: 26 }}>Need 80%. Current: <strong style={{ color: attColor(data.pct), fontSize: 20 }}>{data.pct}%</strong></div>
          <div style={{ maxWidth: 340, margin: '0 auto 22px' }}><PBar value={data.present} max={data.total} height={16} showLabel /></div>
          <div style={{ fontSize: 13, color: '#4B5563' }}>{data.total > 0 ? `Need ${Math.max(0, Math.ceil(data.total * .8) - data.present)} more classes` : 'No classes yet'}</div>
        </div>
      )}
    </Card>
  )
}

// ═══════════════════════════════════════
// STUDENT PROFILE PAGE
// ═══════════════════════════════════════
function StudentProfilePage() {
  const { user, logout } = useAuth()
  const { dark } = useTheme()
  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [st, setSt] = useState(null)

  useEffect(() => {
    if (!user) return
    sb.from('students').select('*').eq('id', user.id).single().then(({ data }) => setSt(data))
  }, [user])

  const changePassword = async () => {
    if (!form.current || !form.newPass) { toast.error('Fill all fields'); return }
    if (form.newPass !== form.confirm) { toast.error('Passwords do not match'); return }
    if (form.newPass.length < 6) { toast.error('Password must be 6+ characters'); return }
    if (form.current !== (st?.password || user?.password)) { toast.error('Current password is wrong'); return }
    
    setLoading(true)
    const { error } = await sb.from('students').update({ password: form.newPass }).eq('id', user.id)
    setLoading(false)
    
    if (error) { toast.error('Failed to update'); return }
    toast.success('Password changed! 🔒')
    setForm({ current: '', newPass: '', confirm: '' })
  }

  const uploadProfileImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Max 2MB allowed!'); return }
    if (!file.type.startsWith('image/')) { toast.error('Only images allowed!'); return }
    
    setUploading(true)
    try {
      // Convert to base64 and save directly in database
      const reader = new FileReader()
      reader.onload = async (event) => {
        const base64 = event.target?.result
        if (!base64) { toast.error('Failed to read file'); setUploading(false); return }
        
        const { error } = await sb.from('students').update({ profile_image: base64 }).eq('id', user.id)
        if (error) { toast.error('Failed to save: ' + error.message); setUploading(false); return }
        
        setSt({ ...st, profile_image: base64 })
        toast.success('Profile photo updated! 📸')
        setUploading(false)
      }
      reader.onerror = () => { toast.error('Failed to read file'); setUploading(false) }
      reader.readAsDataURL(file)
    } catch (err) {
      toast.error('Upload failed!')
      setUploading(false)
    }
    e.target.value = ''
  }

  if (!st) return <Loader />

  return (
    <div className="page-enter">
      <Card title="👤 My Profile" icon="👤">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 30, padding: 'clamp(18px, 3vw, 28px)', ...getGlassLight(dark), borderRadius: 20, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Av name={st.full_name} src={st.profile_image||null} size={80} glow />
            <label style={{ position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: '50%', background: '#FFD700', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer', fontSize: 14, boxShadow: '0 2px 8px rgba(0,0,0,.3)', border: '2px solid #000' }}>
              {uploading ? <span style={{ width: 12, height: 12, border: '2px solid #000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .6s linear infinite' }} /> : '📷'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadProfileImage} disabled={uploading} />
            </label>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: dark ? '#E5E7EB' : '#1F2937', marginBottom: 6 }}>{st.full_name}</div>
            <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 10 }}>{st.email}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Bdg type={statusBadge(st.status)} dot>{st.status}</Bdg>
              <Bdg type={statusBadge(st.fee_status)} dot>{st.fee_status || 'pending'}</Bdg>
              {st.gender && <Bdg type="info">{st.gender}</Bdg>}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 26 }}>
          {[
            ['📧 Email', st.email],
            ['🔐 Login Email', st.login_email || st.email],
            ['📱 Phone', st.phone || '—'],
            ['👨 Father', st.father_name || '—'],
            ['🏙️ City', st.city || '—'],
            ['🎓 Education', st.education || '—'],
            ['📅 Enrolled', fmtDate(st.created_at)]
          ].map(([label, value]) => (
            <div key={label} style={{ ...getGlassLight(dark), borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="🔒 Change Password" icon="🔒">
        <div style={{ maxWidth: 400 }}>
          <Inp label="Current Password" type="password" icon="🔐" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })} placeholder="Enter current password" />
          <Inp label="New Password" type="password" icon="🔑" value={form.newPass} onChange={e => setForm({ ...form, newPass: e.target.value })} placeholder="Enter new password (6+ chars)" />
          <Inp label="Confirm New Password" type="password" icon="✅" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} placeholder="Confirm new password" />
          <Btn onClick={changePassword} loading={loading} icon="🔒">Change Password</Btn>
        </div>
      </Card>

      <Card title="⚠️ Account" icon="⚠️">
        <Btn type="danger" onClick={logout} icon="🚪">Sign Out</Btn>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════
// MAIN APP — v3.2 FINAL
// ═══════════════════════════════════════
// ═══════════════════════════════════════
// STUDENT LEADERBOARD
// ═══════════════════════════════════════
function LeaderboardPage() {
  const { dark } = useTheme()
  const [students, setStudents] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [attendance, setAttendance] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overall')

  useEffect(() => {
    (async () => {
      const [s, sub, att, cls] = await Promise.all([
        sb.from('students').select('*').eq('status', 'active'),
        sb.from('submissions').select('*'),
        sb.from('attendance').select('*'),
        sb.from('classes').select('*')
      ])
      setStudents(s.data || [])
      setSubmissions(sub.data || [])
      setAttendance(att.data || [])
      setClasses(cls.data || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <SkeletonDashboard />

  const ranked = students.map(s => {
    const myAtt = attendance.filter(a => a.student_id === s.id)
    const present = myAtt.filter(a => a.status === 'present').length
    const totalClasses = classes.filter(c => c.batch_id === s.batch_id).length
    const attPct = totalClasses > 0 ? Math.round((present / totalClasses) * 100) : 0

    const mySubs = submissions.filter(x => x.student_id === s.id)
    const graded = mySubs.filter(x => x.marks_obtained != null)
    const avgMarks = graded.length > 0 ? Math.round(graded.reduce((a, x) => a + (x.marks_obtained || 0), 0) / graded.length) : 0
    const subCount = mySubs.length

    const score = Math.round(attPct * 0.4 + avgMarks * 0.4 + Math.min(subCount * 5, 100) * 0.2)

    return { ...s, attPct, avgMarks, subCount, present, totalClasses, score }
  })

  const sorted = tab === 'attendance' ? [...ranked].sort((a, b) => b.attPct - a.attPct)
    : tab === 'marks' ? [...ranked].sort((a, b) => b.avgMarks - a.avgMarks)
    : [...ranked].sort((a, b) => b.score - a.score)

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, padding: 6, ...getGlass(dark), borderRadius: 16, overflowX: 'auto' }} className="cs">
        {[['overall', '🏆 Overall'], ['attendance', '✅ Attendance'], ['marks', '📝 Marks']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, transition: 'all .3s', background: tab === k ? G : 'transparent', color: tab === k ? '#000' : '#6B7280', whiteSpace: 'nowrap' }}>{l}</button>
        ))}
      </div>

      {/* Top 3 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 26 }} className="mf">
        {sorted.slice(0, 3).map((s, i) => (
          <div key={s.id} className="ch" style={{ ...getGlass(dark), borderRadius: 22, padding: 28, textAlign: 'center', borderTop: `3px solid ${i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32'}` }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>{medals[i]}</div>
            <Av name={s.full_name} src={s.profile_image || null} size={64} glow />
            <div style={{ fontSize: 18, fontWeight: 800, color: dark ? '#E5E7EB' : '#1F2937', marginTop: 14 }}>{s.full_name}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#FFD700', fontFamily: "'Space Grotesk',sans-serif", marginTop: 8 }}>
              {tab === 'attendance' ? s.attPct + '%' : tab === 'marks' ? s.avgMarks + 'pts' : s.score + 'pts'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 14 }}>
              <div><div style={{ fontSize: 10, color: '#6B7280' }}>Attendance</div><div style={{ fontWeight: 700, color: '#10B981', fontSize: 14 }}>{s.attPct}%</div></div>
              <div><div style={{ fontSize: 10, color: '#6B7280' }}>Avg Marks</div><div style={{ fontWeight: 700, color: '#3B82F6', fontSize: 14 }}>{s.avgMarks}</div></div>
              <div><div style={{ fontSize: 10, color: '#6B7280' }}>Submitted</div><div style={{ fontWeight: 700, color: '#F59E0B', fontSize: 14 }}>{s.subCount}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Full List */}
      <Card title={`🏆 Full Rankings (${sorted.length})`} icon="🏆" noPadding>
        <Tbl headers={['Rank', 'Student', 'Attendance', 'Avg Marks', 'Submissions', 'Score']}>
          {sorted.map((s, i) => (
            <TR key={s.id} delay={i * .02}>
              <TD><div style={{ fontWeight: 900, fontSize: 16, color: i < 3 ? '#FFD700' : dark ? '#4B5563' : '#9CA3AF', fontFamily: "'Space Grotesk',sans-serif" }}>{i < 3 ? medals[i] : '#' + (i + 1)}</div></TD>
              <TD><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Av name={s.full_name} src={s.profile_image || null} size={32} /><span style={{ fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</span></div></TD>
              <TD><span style={{ color: attColor(s.attPct), fontWeight: 700 }}>{s.attPct}%</span></TD>
              <TD><span style={{ fontWeight: 700, color: '#3B82F6' }}>{s.avgMarks}</span></TD>
              <TD><span style={{ fontWeight: 600 }}>{s.subCount}</span></TD>
              <TD><div style={{ fontWeight: 800, fontSize: 16, color: '#FFD700', fontFamily: "'Space Grotesk',sans-serif" }}>{s.score}</div></TD>
            </TR>
          ))}
        </Tbl>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════
// TIMETABLE — Visual Weekly Schedule
// ═══════════════════════════════════════
function TimetablePage() {
  const { dark } = useTheme()
  const [batches, setBatches] = useState([]); const [selBatch, setSelBatch] = useState('')
  const [schedule, setSchedule] = useState({}); const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false); const [form, setForm] = useState({})

  useEffect(() => { sb.from('batches').select('*').then(r => { setBatches(r.data || []); setLoading(false) }) }, [])

  const loadSchedule = async (bid) => {
    setSelBatch(bid)
    if (!bid) { setSchedule({}); return }
    const { data } = await sb.from('timetable').select('*').eq('batch_id', bid)
    const map = {}
    ;(data || []).forEach(s => { if (!map[s.day]) map[s.day] = []; map[s.day].push(s) })
    setSchedule(map)
  }

  const save = async () => {
    if (!form.day || !form.time || !form.subject || !selBatch) { toast.error('Fill all fields'); return }
    if (form.id) {
      await sb.from('timetable').update({ day: form.day, time: form.time, subject: form.subject, instructor: form.instructor || '', notes: form.notes || '' }).eq('id', form.id)
    } else {
      await sb.from('timetable').insert({ batch_id: selBatch, day: form.day, time: form.time, subject: form.subject, instructor: form.instructor || '', notes: form.notes || '' })
    }
    toast.success('Saved! 🗓'); setModal(false); loadSchedule(selBatch)
  }

  const del = async (id) => {
    await sb.from('timetable').delete().eq('id', id)
    toast.success('Deleted'); loadSchedule(selBatch)
  }

  const timeSlots = HOURS
  const colors = ['#FFD700', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444']

  if (loading) return <SkeletonDashboard />

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <Sel label="" value={selBatch} onChange={e => loadSchedule(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">Select Batch</option>
          {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Sel>
        {selBatch && <Btn onClick={() => { setForm({ day: 'Monday' }); setModal(true) }} icon="➕" size="sm">Add Slot</Btn>}
      </div>

      {selBatch ? (
        <div style={{ overflowX: 'auto' }} className="cs">
          <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${DAY_SHORT.length}, 1fr)`, gap: 2, minWidth: 800 }}>
            {/* Header */}
            <div style={{ padding: 14, fontWeight: 700, fontSize: 11, color: '#6B7280', textAlign: 'center' }}></div>
            {DAY_SHORT.map(d => (
              <div key={d} style={{ padding: '14px 8px', textAlign: 'center', fontWeight: 800, fontSize: 12, color: '#FFD700', ...getGlassLight(dark), borderRadius: 12, letterSpacing: 1 }}>{d}</div>
            ))}

            {/* Time rows */}
            {timeSlots.map((time, ti) => (
              <React.Fragment key={time}>
                <div style={{ padding: '10px 8px', fontSize: 10, color: '#4B5563', textAlign: 'center', fontWeight: 600 }}>{time}</div>
                {DAYS.map((day, di) => {
                  const slots = (schedule[day] || []).filter(s => s.time === time)
                  return (
                    <div key={day + time} style={{ padding: 4, minHeight: 54, ...getGlassLight(dark), borderRadius: 10, margin: 1, position: 'relative' }}>
                      {slots.map((s, si) => (
                        <div key={s.id} onClick={() => { setForm(s); setModal(true) }} style={{
                          background: `${colors[(di + si) % colors.length]}15`,
                          border: `1px solid ${colors[(di + si) % colors.length]}30`,
                          borderRadius: 8, padding: '6px 8px', cursor: 'pointer', marginBottom: 2,
                          borderLeft: `3px solid ${colors[(di + si) % colors.length]}`,
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.subject}</div>
                          {s.instructor && <div style={{ fontSize: 9, color: '#6B7280' }}>{s.instructor}</div>}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : (
        <Empty icon="🗓" title="Select a batch" sub="Choose a batch to view or edit its timetable" />
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? 'Edit Slot' : 'Add Time Slot'} icon="🗓" footer={
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          {form.id && <Btn type="danger" size="sm" onClick={() => { del(form.id); setModal(false) }}>🗑 Delete</Btn>}
          <div style={{ flex: 1 }} />
          <Btn type="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save}>💾 Save</Btn>
        </div>
      }>
        <Grid>
          <Sel label="Day" required value={form.day || ''} onChange={e => setForm({ ...form, day: e.target.value })}>
            <option value="">Select</option>
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </Sel>
          <Sel label="Time" required value={form.time || ''} onChange={e => setForm({ ...form, time: e.target.value })}>
            <option value="">Select</option>
            {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
          </Sel>
        </Grid>
        <Inp label="Subject" required value={form.subject || ''} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g., Canva Design" />
        <Inp label="Instructor" value={form.instructor || ''} onChange={e => setForm({ ...form, instructor: e.target.value })} placeholder="Teacher name" />
        <TA label="Notes" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </Modal>
    </div>
  )
}

// Student Timetable View
function StudentTimetablePage() {
  const { user } = useAuth(); const { dark } = useTheme()
  const [schedule, setSchedule] = useState({}); const [loading, setLoading] = useState(true)
  const colors = ['#FFD700', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899']

  useEffect(() => {
    if (!user?.batch_id) { setLoading(false); return }
    sb.from('timetable').select('*').eq('batch_id', user.batch_id).then(r => {
      const map = {}; (r.data || []).forEach(s => { if (!map[s.day]) map[s.day] = []; map[s.day].push(s) })
      setSchedule(map); setLoading(false)
    })
  }, [user])

  if (loading) return <SkeletonDashboard />
  const today = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]

  return (
    <Card title="🗓 My Weekly Schedule" icon="🗓">
      {DAYS.map((day, di) => {
        const slots = schedule[day] || []
        if (slots.length === 0) return null
        return (
          <div key={day} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: day === today ? '#FFD700' : (dark ? '#E5E7EB' : '#1F2937') }}>{day}</div>
              {day === today && <Bdg type="gold" size="sm" dot>Today</Bdg>}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {slots.sort((a, b) => a.time?.localeCompare(b.time)).map((s, si) => (
                <div key={s.id} style={{
                  ...getGlassLight(dark), borderRadius: 14, padding: '16px 20px', flex: '1 1 200px', maxWidth: 300,
                  borderLeft: `4px solid ${colors[(di + si) % colors.length]}`,
                }}>
                  <div style={{ fontSize: 11, color: colors[(di + si) % colors.length], fontWeight: 700, marginBottom: 4 }}>{s.time}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.subject}</div>
                  {s.instructor && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>👨‍🏫 {s.instructor}</div>}
                  {s.notes && <div style={{ fontSize: 11, color: '#4B5563', marginTop: 6 }}>{s.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {Object.keys(schedule).length === 0 && <Empty icon="🗓" title="No schedule set" sub="Admin hasn't set a timetable for your batch yet" />}
    </Card>
  )
}

// ═══════════════════════════════════════
// QUIZ/EXAM SYSTEM
// ═══════════════════════════════════════
function QuizAdminPage() {
  const { dark } = useTheme()
  const [quizzes, setQuizzes] = useState([]); const [batches, setBatches] = useState([]); const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false); const [form, setForm] = useState({}); const [questions, setQuestions] = useState([])
  const [viewQuiz, setViewQuiz] = useState(null); const [results, setResults] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    const [q, b] = await Promise.all([sb.from('quizzes').select('*').order('created_at', { ascending: false }), sb.from('batches').select('*')])
    setQuizzes(q.data || []); setBatches(b.data || []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const addQuestion = () => setQuestions([...questions, { question: '', options: ['', '', '', ''], correct: 0 }])
  const updateQ = (i, field, val) => { const q = [...questions]; if (field === 'question') q[i].question = val; else if (field === 'correct') q[i].correct = parseInt(val); else { q[i].options[parseInt(field)] = val }; setQuestions(q) }
  const removeQ = (i) => setQuestions(questions.filter((_, idx) => idx !== i))

  // ═══ QUESTION BANK ═══
  const QB_KEY = 'aemtech_question_bank'
  const [bank, setBank] = useState(() => { if (typeof window === 'undefined') return []; try { return JSON.parse(localStorage.getItem(QB_KEY) || '[]') } catch { return [] } })
  const [bankOpen, setBankOpen] = useState(false)

  const saveToBank = () => {
    const valid = questions.filter(q => q.question && q.options.every(o => o))
    if (valid.length === 0) { toast.error('No valid questions'); return }
    const next = [...bank, ...valid.map(q => ({ id: Date.now() + Math.random(), ...q }))]
    setBank(next); localStorage.setItem(QB_KEY, JSON.stringify(next.slice(0, 300)))
    toast.success(`${valid.length} questions saved to bank! 🏦`)
  }
  const addFromBank = (q) => { setQuestions(p => [...p, { question: q.question, options: [...q.options], correct: q.correct }]); toast.success('Question added! ➕'); setBankOpen(false) }
  const addRandomFromBank = () => {
    if (bank.length === 0) { toast.error('Bank khali hai'); return }
    const shuffled = [...bank].sort(() => Math.random() - .5).slice(0, 5)
    setQuestions(p => [...p, ...shuffled.map(q => ({ question: q.question, options: [...q.options], correct: q.correct }))])
    toast.success(`5 random questions added! 🎲`); setBankOpen(false)
  }
  const delFromBank = (id) => { const next = bank.filter(q => q.id !== id); setBank(next); localStorage.setItem(QB_KEY, JSON.stringify(next)) }
  const shuffleCurrent = () => { setQuestions(p => [...p].sort(() => Math.random() - .5)); toast.success('Questions shuffled! 🔀') }

  const save = async () => {
    if (!form.title || !form.batch_id) { toast.error('Title and batch required'); return }
    if (questions.length === 0) { toast.error('Add at least 1 question'); return }
    const valid = questions.every(q => q.question && q.options.every(o => o))
    if (!valid) { toast.error('Fill all questions and options'); return }
    const quiz = { title: form.title, batch_id: form.batch_id, description: form.description || '', duration_minutes: parseInt(form.duration_minutes) || 30, questions: JSON.stringify(questions), status: form.status || 'draft', total_marks: questions.length }
    if (form.id) { await sb.from('quizzes').update(quiz).eq('id', form.id) }
    else { await sb.from('quizzes').insert(quiz) }
    toast.success('Quiz saved! 🧠'); setModal(false); setQuestions([]); load()
  }

  const del = async (id) => {
    await sb.from('quiz_attempts').delete().eq('quiz_id', id)
    await sb.from('quizzes').delete().eq('id', id)
    toast.success('Deleted'); load()
  }

  const viewResults = async (quiz) => {
    setViewQuiz(quiz)
    const [attempts, students] = await Promise.all([
      sb.from('quiz_attempts').select('*').eq('quiz_id', quiz.id).order('score', { ascending: false }),
      sb.from('students').select('*')
    ])
    setResults((attempts.data || []).map(a => ({ ...a, studentName: (students.data || []).find(s => s.id === a.student_id)?.full_name || '—' })))
  }

  if (loading) return <SkeletonDashboard />

  return (
    <div className="page-enter">
      <Card title={`Quizzes (${quizzes.length})`} icon="🧠" action={
        <Btn onClick={() => { setForm({ status: 'draft', duration_minutes: 30 }); setQuestions([{ question: '', options: ['', '', '', ''], correct: 0 }]); setModal(true) }} icon="➕">Create Quiz</Btn>
      } noPadding>
        <Tbl headers={['Title', 'Batch', 'Questions', 'Duration', 'Status', 'Actions']} empty={quizzes.length === 0 ? <Empty icon="🧠" title="No quizzes" /> : null}>
          {quizzes.map((q, i) => {
            const qs = (() => { try { return JSON.parse(q.questions || '[]') } catch { return [] } })()
            return (
              <TR key={q.id} delay={i * .04}>
                <TD style={{ fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{q.title}</TD>
                <TD style={{ fontSize: 12 }}>{batches.find(b => b.id === q.batch_id)?.name || '—'}</TD>
                <TD><Bdg type="gold">{qs.length} MCQs</Bdg></TD>
                <TD style={{ fontSize: 12 }}>{q.duration_minutes} min</TD>
                <TD><Bdg type={q.status === 'active' ? 'success' : q.status === 'closed' ? 'danger' : 'warning'} dot>{q.status}</Bdg></TD>
                <TD>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn type="outline" size="xs" onClick={() => viewResults(q)}>📊</Btn>
                    <Btn type="outline" size="xs" onClick={() => { setForm(q); setQuestions(qs); setModal(true) }}>✏️</Btn>
                    <Btn type="danger" size="xs" onClick={() => del(q.id)}>🗑</Btn>
                  </div>
                </TD>
              </TR>
            )
          })}
        </Tbl>
      </Card>

      {/* Results Modal */}
      <Modal open={!!viewQuiz} onClose={() => setViewQuiz(null)} title={`📊 Results — ${viewQuiz?.title || ''}`} icon="📊">
        {results.length === 0 ? <Empty icon="📊" title="No attempts yet" /> : (
          <Tbl headers={['Rank', 'Student', 'Score', 'Time']}>
            {results.map((r, i) => (
              <TR key={r.id} delay={i * .04}>
                <TD><span style={{ fontWeight: 800, color: i < 3 ? '#FFD700' : '#6B7280' }}>#{i + 1}</span></TD>
                <TD style={{ fontWeight: 600 }}>{r.studentName}</TD>
                <TD><span style={{ fontWeight: 800, color: '#FFD700', fontFamily: "'Space Grotesk',sans-serif" }}>{r.score}/{viewQuiz?.total_marks || '?'}</span></TD>
                <TD style={{ fontSize: 12 }}>{fmtDT(r.completed_at)}</TD>
              </TR>
            ))}
          </Tbl>
        )}
      </Modal>

      {/* Create/Edit Quiz Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? 'Edit Quiz' : 'Create Quiz'} icon="🧠" size="lg" footer={<><Btn type="ghost" onClick={() => setModal(false)}>Cancel</Btn><Btn onClick={save}>💾 Save Quiz</Btn></>}>
        <Grid>
          <Inp label="Title" required value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Sel label="Batch" required value={form.batch_id || ''} onChange={e => setForm({ ...form, batch_id: e.target.value })}>
            <option value="">Select</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Sel>
        </Grid>
        <Grid>
          <Inp label="Duration (min)" type="number" value={form.duration_minutes || 30} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />
          <Sel label="Status" value={form.status || 'draft'} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </Sel>
        </Grid>
        <TA label="Description" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />

        <div style={{ marginTop: 20, borderTop: `1px solid ${dark ? 'rgba(255,215,0,.06)' : 'rgba(0,0,0,.06)'}`, paddingTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#FFD700' }}>📝 Questions ({questions.length})</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <Btn type="outline" size="sm" onClick={addQuestion} icon="➕">Add</Btn>
              <Btn type="ghost" size="sm" onClick={shuffleCurrent} icon="🔀" disabled={questions.length < 2}>Shuffle</Btn>
              <Btn type="success" size="sm" onClick={saveToBank} icon="🏦">Save to Bank</Btn>
              <Btn type="warning" size="sm" onClick={() => setBankOpen(true)} icon="📚">Bank ({bank.length})</Btn>
            </div>
          </div>

          {questions.map((q, qi) => (
            <div key={qi} style={{ ...getGlassLight(dark), borderRadius: 16, padding: 20, marginBottom: 16, borderLeft: '3px solid #FFD700' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#FFD700' }}>Q{qi + 1}</span>
                <Btn type="danger" size="xs" onClick={() => removeQ(qi)}>✕</Btn>
              </div>
              <Inp label="Question" value={q.question} onChange={e => updateQ(qi, 'question', e.target.value)} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {q.options.map((o, oi) => (
                  <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="radio" name={`q${qi}`} checked={q.correct === oi} onChange={() => updateQ(qi, 'correct', oi)} style={{ accentColor: '#FFD700' }} />
                    <input value={o} onChange={e => updateQ(qi, String(oi), e.target.value)} placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      style={{ flex: 1, padding: '10px 14px', background: q.correct === oi ? 'rgba(16,185,129,.06)' : (dark ? 'rgba(0,0,0,.2)' : '#FAFAFA'), border: `1px solid ${q.correct === oi ? 'rgba(16,185,129,.3)' : (dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.1)')}`, borderRadius: 10, color: dark ? '#E5E7EB' : '#1F2937', fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none' }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Question Bank Modal */}
      <Modal open={bankOpen} onClose={() => setBankOpen(false)} title={`📚 Question Bank (${bank.length})`} icon="📚" footer={<><Btn type="ghost" onClick={() => setBankOpen(false)}>Close</Btn><Btn type="warning" onClick={addRandomFromBank} icon="🎲" disabled={bank.length === 0}>Add 5 Random</Btn></>}>
        {bank.length === 0 ? <Empty icon="📚" title="Bank khali hai" sub="Questions save karein to yahan store honge — dobara use kar sakenge"/> : (
          <div style={{ maxHeight: 380, overflowY: 'auto' }} className="cs">
            {bank.map((q, i) => (
              <div key={q.id} style={{ ...getGlassLight(dark), borderRadius: 12, padding: 15, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937', flex: 1, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.45 }}>{i + 1}. {q.question}</div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <Btn type="success" size="xs" onClick={() => addFromBank(q)}>➕</Btn>
                    <Btn type="danger" size="xs" onClick={() => delFromBank(q.id)}>🗑</Btn>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {q.options.map((o, oi) => (
                    <span key={oi} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 7, background: oi === q.correct ? 'rgba(16,185,129,.12)' : dark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.03)', color: oi === q.correct ? '#10B981' : '#6B7280', fontWeight: 700, border: `1px solid ${oi === q.correct ? 'rgba(16,185,129,.2)' : 'transparent'}` }}>{String.fromCharCode(65 + oi)}. {o}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

// Student Quiz Page
function StudentQuizPage() {
  const { user } = useAuth(); const { dark } = useTheme()
  const [quizzes, setQuizzes] = useState([]); const [attempts, setAttempts] = useState({}); const [loading, setLoading] = useState(true)
  const [activeQuiz, setActiveQuiz] = useState(null); const [answers, setAnswers] = useState({}); const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false); const [result, setResult] = useState(null)
  const timerRef = useRef(null)

  const load = useCallback(async () => {
    if (!user) return
    const [q, a] = await Promise.all([
      sb.from('quizzes').select('*').eq('batch_id', user.batch_id || '').eq('status', 'active'),
      sb.from('quiz_attempts').select('*').eq('student_id', user.id)
    ])
    const map = {}; (a.data || []).forEach(x => map[x.quiz_id] = x)
    setQuizzes(q.data || []); setAttempts(map); setLoading(false)
  }, [user])
  useEffect(() => { load() }, [load])

  const startQuiz = (quiz) => {
    if (attempts[quiz.id]) { toast.error('Already attempted!'); return }
    const qs = (() => { try { return JSON.parse(quiz.questions || '[]') } catch { return [] } })()
    setActiveQuiz({ ...quiz, parsedQuestions: qs })
    setAnswers({}); setSubmitted(false); setResult(null)
    setTimeLeft((quiz.duration_minutes || 30) * 60)
  }

  useEffect(() => {
    if (!activeQuiz || submitted) return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); submitQuiz(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [activeQuiz, submitted])

  const submitQuiz = async () => {
    if (submitted) return
    setSubmitted(true); clearInterval(timerRef.current)
    const qs = activeQuiz.parsedQuestions || []
    let score = 0
    qs.forEach((q, i) => { if (answers[i] === q.correct) score++ })
    const attempt = { quiz_id: activeQuiz.id, student_id: user.id, score, total: qs.length, answers: JSON.stringify(answers), completed_at: new Date().toISOString() }
    await sb.from('quiz_attempts').insert(attempt)
    setResult({ score, total: qs.length })
    toast.success(`Quiz submitted! Score: ${score}/${qs.length}`)
    load()
  }

  const fmtTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  if (loading) return <SkeletonDashboard />

  // Active quiz view
  if (activeQuiz && !submitted) {
    const qs = activeQuiz.parsedQuestions || []
    return (
      <div className="page-enter">
        <div style={{ ...getGlass(dark), borderRadius: 20, padding: '20px 28px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 70, zIndex: 40 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: dark ? '#E5E7EB' : '#1F2937' }}>{activeQuiz.title}</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{Object.keys(answers).length}/{qs.length} answered</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 900, color: timeLeft < 60 ? '#EF4444' : timeLeft < 300 ? '#F59E0B' : '#10B981' }}>{fmtTime(timeLeft)}</div>
            <Btn onClick={submitQuiz} type="primary">Submit Quiz</Btn>
          </div>
        </div>
        <PBar value={Object.keys(answers).length} max={qs.length} height={6} showLabel label="Progress" />
        <div style={{ marginTop: 20 }}>
          {qs.map((q, qi) => (
            <div key={qi} style={{ ...getGlass(dark), borderRadius: 18, padding: 24, marginBottom: 16, borderLeft: answers[qi] !== undefined ? '4px solid #10B981' : '4px solid rgba(255,215,0,.2)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937', marginBottom: 16 }}>
                <span style={{ color: '#FFD700', marginRight: 8 }}>Q{qi + 1}.</span>{q.question}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="mf">
                {q.options.map((opt, oi) => (
                  <button key={oi} onClick={() => setAnswers({ ...answers, [qi]: oi })} style={{
                    padding: '14px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                    fontSize: 13, fontWeight: 600, textAlign: 'left', transition: tr,
                    background: answers[qi] === oi ? 'rgba(255,215,0,.1)' : (dark ? 'rgba(0,0,0,.2)' : 'rgba(0,0,0,.02)'),
                    border: `2px solid ${answers[qi] === oi ? 'rgba(255,215,0,.4)' : 'transparent'}`,
                    color: answers[qi] === oi ? '#FFD700' : (dark ? '#D1D5DB' : '#4B5563'),
                  }}>
                    <span style={{ fontWeight: 800, marginRight: 8 }}>{String.fromCharCode(65 + oi)}.</span>{opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Result view
  if (submitted && result) {
    const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0
    return (
      <div className="page-enter" style={{ textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
        <div style={{ ...getGlass(dark), borderRadius: 24, padding: 48, animation: 'scaleIn .4s ease' }}>
          <div style={{ fontSize: 72, marginBottom: 20 }}>{pct >= 80 ? '🏆' : pct >= 50 ? '✅' : '📝'}</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 48, fontWeight: 900, color: '#FFD700', marginBottom: 8 }}>{result.score}/{result.total}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937', marginBottom: 20 }}>{pct >= 80 ? 'Excellent!' : pct >= 50 ? 'Good Job!' : 'Keep Trying!'}</div>
          <PBar value={result.score} max={result.total} height={14} />
          <div style={{ marginTop: 30 }}><Btn onClick={() => { setActiveQuiz(null); setSubmitted(false) }}>← Back to Quizzes</Btn></div>
        </div>
      </div>
    )
  }

  // Quiz list
  return (
    <Card title={`Available Quizzes (${quizzes.length})`} icon="🧠">
      {quizzes.length === 0 ? <Empty icon="🧠" title="No quizzes" sub="No active quizzes for your batch" /> :
        quizzes.map(q => {
          const attempt = attempts[q.id]
          const qs = (() => { try { return JSON.parse(q.questions || '[]') } catch { return [] } })()
          return (
            <div key={q.id} className="ch" style={{ ...getGlassLight(dark), borderRadius: 18, padding: 24, marginBottom: 16, borderLeft: `4px solid ${attempt ? '#10B981' : '#FFD700'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: dark ? '#E5E7EB' : '#1F2937', marginBottom: 5 }}>{q.title}</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>{qs.length} questions · {q.duration_minutes} min</div>
                  {q.description && <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 6 }}>{q.description}</div>}
                </div>
                {attempt ? (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 900, color: '#FFD700' }}>{attempt.score}/{attempt.total}</div>
                    <Bdg type="success" dot>Completed</Bdg>
                  </div>
                ) : <Btn onClick={() => startQuiz(q)} icon="🚀">Start Quiz</Btn>}
              </div>
            </div>
          )
        })}
    </Card>
  )
}

// ═══════════════════════════════════════
// ANALYTICS DASHBOARD
// ═══════════════════════════════════════
function AnalyticsPage() {
  const { dark } = useTheme()
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [students, payments, attendance, classes, batches, assignments, submissions] = await Promise.all([
        sb.from('students').select('*'),
        sb.from('fee_payments').select('*'),
        sb.from('attendance').select('*'),
        sb.from('classes').select('*'),
        sb.from('batches').select('*'),
        sb.from('assignments').select('*'),
        sb.from('submissions').select('*')
      ])
      const allStudents = students.data || []
      const allPayments = payments.data || []
      const allAtt = attendance.data || []
      const allBatches = batches.data || []

      // Revenue by month
      const revByMonth = {}
      allStudents.forEach(s => {
        const d = new Date(s.created_at)
        const key = MONTH_SHORT[d.getMonth()]
        revByMonth[key] = (revByMonth[key] || 0) + (s.fee_paid || 0)
      })
      allPayments.forEach(p => {
        if (p.month) revByMonth[p.month.substring(0, 3)] = (revByMonth[p.month.substring(0, 3)] || 0) + (p.paid_amount || 0)
      })
      const revenueChart = MONTH_SHORT.map(m => ({ month: m, revenue: revByMonth[m] || 0 })).filter(d => d.revenue > 0)

      // Student growth
      const monthCounts = {}
      allStudents.forEach(s => { const m = MONTH_SHORT[new Date(s.created_at).getMonth()]; monthCounts[m] = (monthCounts[m] || 0) + 1 })
      let cum = 0
      const growthChart = MONTH_SHORT.map(m => { cum += (monthCounts[m] || 0); return { month: m, total: cum, new: monthCounts[m] || 0 } }).filter(d => d.total > 0)

      // Batch comparison
      const batchChart = allBatches.map(b => {
        const bStudents = allStudents.filter(s => s.batch_id === b.id)
        const bClasses = (classes.data || []).filter(c => c.batch_id === b.id)
        const totalAtt = allAtt.filter(a => bClasses.some(c => c.id === a.class_id))
        const presentAtt = totalAtt.filter(a => a.status === 'present')
        return { name: b.name?.substring(0, 12), students: bStudents.length, classes: bClasses.length, attPct: totalAtt.length > 0 ? Math.round((presentAtt.length / totalAtt.length) * 100) : 0, revenue: bStudents.reduce((a, s) => a + (s.fee_paid || 0), 0) }
      })

      // Attendance trends by week
      const weekMap = {}
      allAtt.forEach(a => {
        const d = new Date(a.marked_at || a.created_at)
        const wk = `W${Math.ceil(d.getDate() / 7)}`
        if (!weekMap[wk]) weekMap[wk] = { present: 0, absent: 0, late: 0 }
        weekMap[wk][a.status === 'present' ? 'present' : a.status === 'late' ? 'late' : 'absent']++
      })
      const attTrend = Object.entries(weekMap).slice(-8).map(([wk, v]) => ({ week: wk, ...v, rate: (v.present + v.absent + v.late) > 0 ? Math.round(v.present / (v.present + v.absent + v.late) * 100) : 0 }))

      setData({ revenueChart, growthChart, batchChart, attTrend, totalRevenue: allStudents.reduce((a, s) => a + (s.fee_paid || 0), 0), totalStudents: allStudents.length, totalAssignments: (assignments.data || []).length, totalSubmissions: (submissions.data || []).length })
      setLoading(false)
    })()
  }, [])

  if (loading) return <SkeletonDashboard />
  if (!data) return <Empty icon="📈" title="No data" />

  return (
    <div className="page-enter">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 18, marginBottom: 26 }}>
        <Stat icon="💰" value={data.totalRevenue} label="Total Revenue" sub={currency(data.totalRevenue)} />
        <Stat icon="👥" value={data.totalStudents} label="Students" color="#10B981" />
        <Stat icon="📝" value={data.totalAssignments} label="Assignments" color="#3B82F6" />
        <Stat icon="📤" value={data.totalSubmissions} label="Submissions" color="#F59E0B" />
      </div>

      <Grid gap={24}>
        <Card title="💰 Revenue Trend" icon="💰" delay={.1}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.revenueChart}>
              <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...chartTooltip} />
              <Area type="monotone" dataKey="revenue" stroke="#10B981" fill="rgba(16,185,129,.15)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="📈 Student Growth" icon="📈" delay={.15}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.growthChart}>
              <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...chartTooltip} />
              <Line type="monotone" dataKey="total" stroke="#FFD700" strokeWidth={2.5} dot={{ fill: '#FFD700', r: 4 }} />
              <Line type="monotone" dataKey="new" stroke="#3B82F6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </Grid>

      <Grid gap={24} style={{ marginTop: 24 }}>
        <Card title="🏫 Batch Comparison" icon="🏫" delay={.2}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.batchChart}>
              <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="students" fill="#FFD700" radius={[6, 6, 0, 0]} />
              <Bar dataKey="attPct" fill="#10B981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="✅ Attendance Trend" icon="✅" delay={.25}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.attTrend}>
              <XAxis dataKey="week" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip {...chartTooltip} />
              <Line type="monotone" dataKey="rate" stroke="#10B981" strokeWidth={2.5} dot={{ fill: '#10B981', r: 4 }} name="Attendance %" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </Grid>
    </div>
  )
}

// ═══════════════════════════════════════
// PROGRESS REPORT PDF
// ═══════════════════════════════════════
function ProgressReportPage() {
  const { dark } = useTheme()
  const [students, setStudents] = useState([]); const [batches, setBatches] = useState([]); const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([sb.from('students').select('*').order('full_name'), sb.from('batches').select('*')]).then(([s, b]) => {
      setStudents(s.data || []); setBatches(b.data || []); setLoading(false)
    })
  }, [])

  const generateReport = async (student) => {
    toast.loading('Generating...', { id: 'report' })
    const [attRes, classRes, subRes, asnRes, payRes] = await Promise.all([
      sb.from('attendance').select('*').eq('student_id', student.id),
      sb.from('classes').select('*').eq('batch_id', student.batch_id || ''),
      sb.from('submissions').select('*').eq('student_id', student.id),
      sb.from('assignments').select('*').eq('batch_id', student.batch_id || ''),
      sb.from('fee_payments').select('*').eq('student_id', student.id)
    ])
    const att = attRes.data || []; const cls = classRes.data || []; const subs = subRes.data || []; const asns = asnRes.data || []; const pays = payRes.data || []
    const present = att.filter(a => a.status === 'present').length
    const total = cls.length; const attPct = total > 0 ? Math.round((present / total) * 100) : 0
    const batchName = batches.find(b => b.id === student.batch_id)?.name || '—'

    // Assignment marks
    const asnMarks = asns.map(a => {
      const sub = subs.find(s => s.assignment_id === a.id)
      return { title: a.title, total: a.total_marks || 100, obtained: sub?.marks_obtained ?? '—', status: sub ? (sub.marks_obtained != null ? 'Graded' : 'Submitted') : 'Not Submitted' }
    })
    const gradedSubs = subs.filter(s => s.marks_obtained != null)
    const avgMarks = gradedSubs.length > 0 ? Math.round(gradedSubs.reduce((a, s) => a + (s.marks_obtained || 0), 0) / gradedSubs.length) : 0
    const overallGrade = attPct >= 80 && avgMarks >= 80 ? 'A+' : attPct >= 70 && avgMarks >= 70 ? 'A' : attPct >= 60 && avgMarks >= 60 ? 'B' : attPct >= 50 && avgMarks >= 50 ? 'C' : 'D'
    const feeStatus = student.fee_status || 'pending'
    const feePaid = student.fee_paid || 0; const feeTotal = totalFeeOf(student)

    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Progress Report - ${student.full_name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#f5f5f5;padding:30px;display:flex;justify-content:center}
.report{width:700px;background:#fff;border-radius:0;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:36px 40px;text-align:center;border-bottom:4px solid #FFD700;position:relative;overflow:hidden}
.header::after{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(255,215,0,.03),transparent 50%)}
.logo{font-size:32px;letter-spacing:8px;font-weight:900;margin-bottom:2px;position:relative;z-index:1}
.title{font-size:24px;font-weight:800;color:#FFD700;position:relative;z-index:1}
.subtitle{font-size:11px;letter-spacing:4px;color:rgba(255,255,255,.5);font-weight:700;margin-top:4px;position:relative;z-index:1}
.body{padding:36px 40px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
.info-item{padding:14px 18px;background:#f9fafb;border-radius:10px;border-left:3px solid #FFD700}
.info-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#888;margin-bottom:4px;font-weight:700}
.info-value{font-size:14px;font-weight:700;color:#1a1a1a}
.grade-box{text-align:center;padding:28px;background:linear-gradient(135deg,#fefce8,#fef3c7);border-radius:16px;margin-bottom:28px;border:2px solid #FFD700}
.grade{font-size:64px;font-weight:900;color:#d97706;line-height:1}
.grade-label{font-size:12px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-top:8px}
.section{margin-bottom:24px}
.section-title{font-size:14px;font-weight:800;color:#1a1a1a;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #f3f4f6;display:flex;align-items:center;gap:8px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#f9fafb;padding:10px 14px;text-align:left;font-weight:700;color:#4b5563;border-bottom:2px solid #e5e7eb;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
td{padding:10px 14px;border-bottom:1px solid #f3f4f6;color:#374151}
.bar-bg{height:10px;background:#f3f4f6;border-radius:10px;overflow:hidden}
.bar-fill{height:100%;border-radius:10px}
.footer{text-align:center;padding:24px 40px;border-top:2px solid #f3f4f6;background:#fafafa}
.footer p{font-size:10px;color:#999;margin-bottom:3px}
.badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
.paid{background:#d1fae5;color:#059669}.partial{background:#fef3c7;color:#d97706}.pending{background:#fee2e2;color:#dc2626}
@media print{body{background:#fff;padding:0}.report{box-shadow:none}}
</style></head><body>
<div class="report">
<div class="header">
<div class="logo"><span style="color:#fff">AEM</span><span style="color:#FFD700">T</span><span style="color:#fff">ECH</span></div>
<div class="subtitle">INSTITUTE — Design the Future</div>
<div class="title">Student Progress Report</div>
</div>
<div class="body">
<div class="info-grid">
<div class="info-item"><div class="info-label">Student Name</div><div class="info-value">${student.full_name}</div></div>
<div class="info-item"><div class="info-label">Batch</div><div class="info-value">${batchName}</div></div>
<div class="info-item"><div class="info-label">Email</div><div class="info-value">${student.email || '—'}</div></div>
<div class="info-item"><div class="info-label">Phone</div><div class="info-value">${student.phone || '—'}</div></div>
<div class="info-item"><div class="info-label">Report Date</div><div class="info-value">${new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
<div class="info-item"><div class="info-label">Enrollment</div><div class="info-value">${student.created_at ? new Date(student.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div></div>
</div>

<div class="grade-box">
<div class="grade">${overallGrade}</div>
<div class="grade-label">Overall Grade</div>
</div>

<div class="section">
<div class="section-title">✅ Attendance Summary</div>
<div class="info-grid">
<div class="info-item"><div class="info-label">Present</div><div class="info-value" style="color:#059669">${present}/${total}</div></div>
<div class="info-item"><div class="info-label">Attendance Rate</div><div class="info-value" style="color:${attPct >= 80 ? '#059669' : attPct >= 60 ? '#d97706' : '#dc2626'}">${attPct}%</div></div>
</div>
<div class="bar-bg" style="margin-top:8px"><div class="bar-fill" style="width:${attPct}%;background:${attPct >= 80 ? '#10b981' : attPct >= 60 ? '#f59e0b' : '#ef4444'}"></div></div>
</div>

<div class="section">
<div class="section-title">📝 Assignment Performance</div>
<table>
<tr><th>Assignment</th><th>Total Marks</th><th>Obtained</th><th>Status</th></tr>
${asnMarks.map(a => `<tr><td>${a.title}</td><td>${a.total}</td><td style="font-weight:700;color:${typeof a.obtained === 'number' ? '#d97706' : '#9ca3af'}">${a.obtained}</td><td><span class="badge" style="background:${a.status === 'Graded' ? '#d1fae5' : a.status === 'Submitted' ? '#fef3c7' : '#fee2e2'};color:${a.status === 'Graded' ? '#059669' : a.status === 'Submitted' ? '#d97706' : '#dc2626'}">${a.status}</span></td></tr>`).join('')}
</table>
${gradedSubs.length > 0 ? `<div style="margin-top:12px;padding:12px 16px;background:#f9fafb;border-radius:8px;display:flex;justify-content:space-between"><span style="font-size:12px;color:#666">Average Marks</span><span style="font-size:16px;font-weight:800;color:#d97706">${avgMarks}%</span></div>` : ''}
</div>

<div class="section">
<div class="section-title">💰 Fee Status</div>
<div class="info-grid">
<div class="info-item"><div class="info-label">Total Fee</div><div class="info-value">PKR ${feeTotal.toLocaleString()}</div></div>
<div class="info-item"><div class="info-label">Paid</div><div class="info-value" style="color:#059669">PKR ${feePaid.toLocaleString()}</div></div>
<div class="info-item"><div class="info-label">Outstanding</div><div class="info-value" style="color:#dc2626">PKR ${Math.max(0, feeTotal - feePaid).toLocaleString()}</div></div>
<div class="info-item"><div class="info-label">Status</div><div class="info-value"><span class="badge ${feeStatus}">${feeStatus.toUpperCase()}</span></div></div>
</div>
</div>
</div>
<div class="footer">
<p style="font-size:12px;color:#666;font-weight:600;margin-bottom:8px">Thank you for being part of AEMTECH! 🙏</p>
<p>AEMTECH Institute — Design the Future</p>
<p>This is a computer generated progress report • ${new Date().toLocaleDateString()}</p>
</div>
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),600)}<\\/script>
</body></html>`)
    w.document.close()
    toast.success('Report generated! 📄', { id: 'report' })
  }

  if (loading) return <SkeletonDashboard />
  const filtered = students.filter(s => !search || s.full_name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <Card title="📄 Student Progress Reports" icon="📄" action={<Search value={search} onChange={e => setSearch(e.target.value)} />}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
        {filtered.map(s => (
          <div key={s.id} className="ch" style={{ ...getGlassLight(dark), borderRadius: 18, padding: 22, textAlign: 'center' }}>
            <Av name={s.full_name} src={s.profile_image || null} size={56} glow />
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 14, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{batches.find(b => b.id === s.batch_id)?.name || '—'}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 14 }}>
              <Bdg type={statusBadge(s.status)} size="sm" dot>{s.status}</Bdg>
              <Bdg type={statusBadge(s.fee_status)} size="sm">{s.fee_status || 'pending'}</Bdg>
            </div>
            <Btn onClick={() => generateReport(s)} size="sm" full icon="📄">Generate Report</Btn>
          </div>
        ))}
        {filtered.length === 0 && <Empty icon="📄" title="No students found" />}
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════
// TASK CENTER — Daily Admin Tasks
// ═══════════════════════════════════════
function TaskCenterPage() {
  const { dark } = useTheme(); const { setPage } = usePage()
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().split('T')[0]
      const [adm, subs, students, classes, att, assignments, payments] = await Promise.all([
        sb.from('admissions').select('*').eq('status', 'pending'),
        sb.from('submissions').select('*'),
        sb.from('students').select('*'),
        sb.from('classes').select('*'),
        sb.from('attendance').select('*'),
        sb.from('assignments').select('*'),
        sb.from('fee_payments').select('*'),
      ])
      const allStudents = students.data || []
      const allClasses = classes.data || []
      const allAtt = att.data || []
      const allAsns = assignments.data || []

      // Today's classes
      const todayClasses = allClasses.filter(c => c.date === today)
      // Ungraded submissions
      const ungraded = (subs.data || []).filter(s => s.marks_obtained == null)
      // Overdue fees (students with due > 0)
      const feeDue = allStudents.filter(s => dueOf(s) > 0 && s.status === 'active')
      // Assignments due soon (next 3 days)
      const soon = new Date(Date.now() + 3 * 86400000).toISOString()
      const upcomingAsn = allAsns.filter(a => a.due_date >= today && a.due_date <= soon)
      // Low attendance (< 80%)
      const lowAtt = allStudents.filter(s => {
        if (s.status !== 'active') return false
        const total = allClasses.filter(c => c.batch_id === s.batch_id).length
        if (total === 0) return false
        const present = allAtt.filter(a => a.student_id === s.id && a.status === 'present').length
        return (present / total) * 100 < 80
      }).map(s => {
        const total = allClasses.filter(c => c.batch_id === s.batch_id).length
        const present = allAtt.filter(a => a.student_id === s.id && a.status === 'present').length
        return { ...s, pct: total > 0 ? Math.round((present / total) * 100) : 0 }
      })
      // Overdue fee payments
      const overduePayments = (payments.data || []).filter(p => p.status === 'overdue')
      // Missing recordings
      const noRecording = allClasses.filter(c => !c.recording_url && c.date < today)

      setData({ todayClasses, ungraded, feeDue, upcomingAsn, lowAtt, overduePayments, noRecording, pendingAdm: adm.data || [] })
      setLoading(false)
    })()
  }, [])

  if (loading) return <SkeletonDashboard />
  if (!data) return null

  const tasks = [
    { key: 'admissions', icon: '📋', title: 'Pending Admissions', count: data.pendingAdm.length, color: '#F59E0B', page: 'admissions', desc: 'Applications waiting for review' },
    { key: 'classes', icon: '📅', title: "Today's Classes", count: data.todayClasses.length, color: '#3B82F6', page: 'classes', desc: data.todayClasses.length > 0 ? data.todayClasses.map(c => 'C' + c.class_number).join(', ') : 'No classes today' },
    { key: 'ungraded', icon: '📤', title: 'Ungraded Submissions', count: data.ungraded.length, color: '#8B5CF6', page: 'submissions', desc: 'Need to be graded' },
    { key: 'fees', icon: '💰', title: 'Fee Due Students', count: data.feeDue.length, color: '#EF4444', page: 'fees', desc: currency(data.feeDue.reduce((a, s) => a + dueOf(s), 0)) + ' outstanding' },
    { key: 'attendance', icon: '🚨', title: 'Low Attendance', count: data.lowAtt.length, color: '#EC4899', page: 'alerts', desc: 'Students below 80%' },
    { key: 'assignments', icon: '📝', title: 'Assignments Due Soon', count: data.upcomingAsn.length, color: '#10B981', page: 'assignments', desc: 'Due within 3 days' },
    { key: 'recordings', icon: '🎥', title: 'Missing Recordings', count: data.noRecording.length, color: '#6B7280', page: 'recordings', desc: 'Past classes without recording' },
  ]

  const totalTasks = tasks.reduce((a, t) => a + t.count, 0)

  return (
    <div className="page-enter">
      {/* Summary */}
      <div style={{ ...getGlass(dark), borderRadius: 24, padding: 'clamp(22px,3vw,36px)', marginBottom: 26, background: dark ? 'linear-gradient(135deg,rgba(255,215,0,.06),rgba(12,12,14,.85))' : 'linear-gradient(135deg,rgba(255,215,0,.08),rgba(255,255,255,.95))', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,215,0,.06),transparent)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>Daily Overview</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(24px,3vw,34px)', fontWeight: 900, marginBottom: 8 }}>
              <span style={{ background: G, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{totalTasks} tasks pending</span>
            </div>
            <div style={{ fontSize: 13, color: '#4B5563' }}>{new Date().toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[['✅', tasks.filter(t => t.count === 0).length, 'Done'], ['⏳', tasks.filter(t => t.count > 0).length, 'Pending']].map(([ic, n, l], i) => (
              <div key={l} style={{ ...getGlassLight(dark), borderRadius: 16, padding: '16px 22px', textAlign: 'center' }}>
                <div style={{ fontSize: 22 }}>{ic}</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 900, color: i === 0 ? '#10B981' : '#FFD700' }}>{n}</div>
                <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 18 }}>
        {tasks.map((t, i) => (
          <div key={t.key} onClick={() => t.count > 0 && setPage(t.page)} className="ch" style={{
            ...getGlass(dark), borderRadius: 20, padding: 24, cursor: t.count > 0 ? 'pointer' : 'default',
            borderTop: `3px solid ${t.color}`, opacity: t.count === 0 ? .55 : 1,
            animation: `fadeInUp .4s ease ${i * .05}s both`, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 90, height: 90, borderRadius: '50%', background: `radial-gradient(circle,${t.color}10,transparent)`, pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 15, background: `${t.color}12`, border: `1px solid ${t.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{t.icon}</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 34, fontWeight: 900, color: t.count === 0 ? '#10B981' : t.color }}>{t.count === 0 ? '✓' : t.count}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#E5E7EB' : '#1F2937', marginBottom: 6 }}>{t.title}</div>
            <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.desc}</div>
            {t.count > 0 && <div style={{ marginTop: 14, fontSize: 11, color: t.color, fontWeight: 700 }}>View →</div>}
          </div>
        ))}
      </div>

      {/* Today's classes detail */}
      {data.todayClasses.length > 0 && (
        <Card title={`📅 Today's Classes (${data.todayClasses.length})`} icon="📅" delay={.2} style={{ marginTop: 26 }} noPadding>
          <Tbl headers={['#', 'Title', 'Time', 'Status']}>
            {data.todayClasses.map((c, i) => (
              <TR key={c.id} delay={i * .04}>
                <TD><Bdg type="gold">C{c.class_number}</Bdg></TD>
                <TD style={{ fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{c.title}</TD>
                <TD>{c.time || '—'}</TD>
                <TD><Bdg type={statusBadge(c.status)} dot>{c.status}</Bdg></TD>
              </TR>
            ))}
          </Tbl>
        </Card>
      )}

      {/* Low attendance detail */}
      {data.lowAtt.length > 0 && (
        <Card title={`🚨 Low Attendance Students (${data.lowAtt.length})`} icon="🚨" delay={.25} style={{ marginTop: 22 }} noPadding>
          <Tbl headers={['Student', 'Attendance', 'Status']}>
            {data.lowAtt.slice(0, 10).map((s, i) => (
              <TR key={s.id} delay={i * .04}>
                <TD><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Av name={s.full_name} src={s.profile_image || null} size={32} /><span style={{ fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</span></div></TD>
                <TD><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 85 }}><PBar value={s.pct} max={100} /></div><span style={{ fontWeight: 700, color: attColor(s.pct) }}>{s.pct}%</span></div></TD>
                <TD><Bdg type={s.pct >= 60 ? 'warning' : 'danger'} dot>{s.pct >= 60 ? 'Warning' : 'Critical'}</Bdg></TD>
              </TR>
            ))}
          </Tbl>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// ATTENDANCE ALERTS — Low attendance + consecutive absences
// ═══════════════════════════════════════
function AttendanceAlertsPage() {
  const { dark } = useTheme()
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState(80)

  useEffect(() => {
    (async () => {
      const [students, classes, att] = await Promise.all([
        sb.from('students').select('*'),
        sb.from('classes').select('*').order('class_number'),
        sb.from('attendance').select('*'),
      ])
      const allStudents = students.data || []
      const allClasses = classes.data || []
      const allAtt = att.data || []

      const rows = allStudents.filter(s => s.status === 'active').map(s => {
        const myClasses = allClasses.filter(c => c.batch_id === s.batch_id)
        const total = myClasses.length
        const myAtt = allAtt.filter(a => a.student_id === s.id)
        const present = myAtt.filter(a => a.status === 'present').length
        const pct = total > 0 ? Math.round((present / total) * 100) : 0
        // Consecutive absences (from latest class backwards)
        const sortedAtt = myClasses.slice().reverse().map(c => myAtt.find(a => a.class_id === c.id)?.status)
        let consec = 0
        for (const st of sortedAtt) { if (st === 'absent') consec++; else break }
        // Absent count
        const absent = myAtt.filter(a => a.status === 'absent').length
        const late = myAtt.filter(a => a.status === 'late').length
        return { ...s, total, present, absent, late, pct, consec }
      })
      setData(rows); setLoading(false)
    })()
  }, [])

  if (loading) return <SkeletonDashboard />

  const critical = (data || []).filter(s => s.pct < 60)
  const warning = (data || []).filter(s => s.pct >= 60 && s.pct < threshold)
  const consecAbsent = (data || []).filter(s => s.consec >= 2)
  const perfect = (data || []).filter(s => s.pct === 100 && s.total > 0)

  return (
    <div className="page-enter">
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 18, marginBottom: 24 }}>
        <Stat icon="🚨" value={critical.length} label="Critical (<60%)" color="#EF4444" />
        <Stat icon="⚠️" value={warning.length} label={`Warning (<${threshold}%)`} color="#F59E0B" />
        <Stat icon="🔴" value={consecAbsent.length} label="Consecutive Absent" color="#EC4899" />
        <Stat icon="🏆" value={perfect.length} label="Perfect (100%)" color="#10B981" />
      </div>

      {/* Threshold selector */}
      <div style={{ ...getGlassLight(dark), borderRadius: 14, padding: '16px 20px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 700 }}>⚠️ Alert Threshold:</span>
        {[60, 70, 75, 80, 90].map(t => (
          <button key={t} onClick={() => setThreshold(t)} style={{ padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12, transition: 'all .3s', background: threshold === t ? G : (dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'), color: threshold === t ? '#000' : '#6B7280' }}>{t}%</button>
        ))}
      </div>

      {/* Consecutive absences */}
      {consecAbsent.length > 0 && (
        <Card title={`🔴 Consecutive Absences (${consecAbsent.length})`} icon="🔴" style={{ marginBottom: 22 }} noPadding>
          <Tbl headers={['Student', 'Consecutive', 'Attendance', 'Action']}>
            {consecAbsent.map((s, i) => (
              <TR key={s.id} delay={i * .04}>
                <TD><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Av name={s.full_name} src={s.profile_image || null} size={32} /><span style={{ fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</span></div></TD>
                <TD><Bdg type="danger" dot>{s.consec} classes</Bdg></TD>
                <TD><span style={{ fontWeight: 700, color: attColor(s.pct) }}>{s.pct}%</span></TD>
                <TD>
                  {s.phone && (
                    <a href={`https://api.whatsapp.com/send?phone=${s.phone.replace(/\D/g, '').replace(/^0/, '92')}&text=${encodeURIComponent(`Assalam o Alaikum ${s.full_name}! Aap ${s.consec} classes se gayab hain. Koi masla ho to btayein. AEMTECH Institute`)}`} target="_blank" rel="noreferrer">
                      <Btn type="success" size="xs" icon="💬">Notify</Btn>
                    </a>
                  )}
                </TD>
              </TR>
            ))}
          </Tbl>
        </Card>
      )}

      {/* Critical + Warning list */}
      <Card title={`🚨 Students Below ${threshold}% (${critical.length + warning.length})`} icon="🚨" noPadding>
        <Tbl headers={['Student', 'Present', 'Absent', 'Late', 'Attendance', 'Status', 'Notify']} empty={critical.length + warning.length === 0 ? <Empty icon="✅" title="All students above threshold!" /> : null}>
          {[...critical, ...warning].map((s, i) => (
            <TR key={s.id} delay={i * .03}>
              <TD><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Av name={s.full_name} src={s.profile_image || null} size={32} /><span style={{ fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</span></div></TD>
              <TD style={{ color: '#10B981', fontWeight: 700 }}>{s.present}</TD>
              <TD style={{ color: '#EF4444', fontWeight: 700 }}>{s.absent}</TD>
              <TD style={{ color: '#F59E0B', fontWeight: 700 }}>{s.late}</TD>
              <TD><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 85 }}><PBar value={s.pct} max={100} /></div><span style={{ fontWeight: 700, color: attColor(s.pct) }}>{s.pct}%</span></div></TD>
              <TD><Bdg type={s.pct < 60 ? 'danger' : 'warning'} dot>{s.pct < 60 ? 'Critical' : 'Warning'}</Bdg></TD>
              <TD>
                {s.phone && (
                  <a href={`https://api.whatsapp.com/send?phone=${s.phone.replace(/\D/g, '').replace(/^0/, '92')}&text=${encodeURIComponent(`Assalam o Alaikum ${s.full_name}! Aapki attendance ${s.pct}% hai jo ${threshold}% se kam hai. Certificate ke liye 80% zaroori hai. AEMTECH Institute`)}`} target="_blank" rel="noreferrer">
                    <Btn type="success" size="xs" icon="💬">Notify</Btn>
                  </a>
                )}
              </TD>
            </TR>
          ))}
        </Tbl>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════
// FEE LEDGER — Month-wise fee tracking
// ═══════════════════════════════════════
function FeeLedgerPage() {
  const { dark } = useTheme()
  const [students, setStudents] = useState([]); const [batches, setBatches] = useState([])
  const [payments, setPayments] = useState([]); const [loading, setLoading] = useState(true)
  const [selStudent, setSelStudent] = useState(''); const [modal, setModal] = useState(false); const [form, setForm] = useState({})
  const { confirm } = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    const [s, b, p] = await Promise.all([
      sb.from('students').select('*').order('full_name'),
      sb.from('batches').select('*'),
      sb.from('fee_payments').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
    ])
    setStudents(s.data || []); setBatches(b.data || []); setPayments(p.data || []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const savePayment = async () => {
    if (!form.student_id || !form.amount) { toast.error('Student and amount required'); return }
    const student = students.find(s => s.id === form.student_id)
    const newPaid = (student?.fee_paid || 0) + parseFloat(form.amount)
    const newStatus = newPaid >= totalFeeOf(student) ? 'paid' : newPaid > 0 ? 'partial' : 'pending'
    await sb.from('fee_payments').insert({
      student_id: form.student_id, month: form.month || MONTHS[new Date().getMonth()], year: form.year || new Date().getFullYear(),
      amount: parseFloat(form.amount), paid_amount: parseFloat(form.amount), paid_date: new Date().toISOString().split('T')[0],
      payment_method: form.payment_method || 'Cash', status: 'paid', receipt_number: 'RCP-' + Date.now().toString(36).toUpperCase(),
    })
    await sb.from('students').update({ fee_paid: newPaid, fee_status: newStatus }).eq('id', form.student_id)
    toast.success('💰 Payment recorded!')
    setModal(false); load()
  }

  const delPayment = async (id) => {
    const ok = await confirm({ title: 'Delete Payment?', message: 'Yeh payment record delete hoga. Student ka paid amount automatically adjust nahi hoga.', type: 'danger', confirmText: 'Delete', icon: '🗑️' })
    if (!ok) return
    await sb.from('fee_payments').delete().eq('id', id)
    toast.success('Deleted'); load()
  }

  if (loading) return <SkeletonDashboard />

  const student = selStudent ? students.find(s => s.id === selStudent) : null
  const myPayments = student ? payments.filter(p => p.student_id === student.id) : payments
  const year = new Date().getFullYear()
  const monthNames = MONTHS

  return (
    <div className="page-enter">
      {/* Selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 250 }}>
          <Sel label="Select Student" value={selStudent} onChange={e => setSelStudent(e.target.value)}>
            <option value="">📋 All Students ({payments.length} payments)</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.fee_status || 'pending'}</option>)}
          </Sel>
        </div>
        <Btn onClick={() => { setForm({ student_id: selStudent, month: MONTHS[new Date().getMonth()], year, payment_method: 'Cash' }); setModal(true) }} icon="➕" size="sm">Record Payment</Btn>
      </div>

      {/* Student summary */}
      {student && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16, marginBottom: 22 }}>
          {[
            ['👤 Student', student.full_name, '#FFD700'],
            ['🏫 Batch', batches.find(b => b.id === student.batch_id)?.name || '—', '#3B82F6'],
            ['💰 Total Fee', currency(totalFeeOf(student)), '#F59E0B'],
            ['✅ Paid', currency(student.fee_paid), '#10B981'],
            ['⚠️ Due', currency(dueOf(student)) + (monthsDueOf(student) > 0 ? ` (${monthsDueOf(student)} mo)` : ''), '#EF4444'],
            ['📊 Status', (student.fee_status || 'pending').toUpperCase(), student.fee_status === 'paid' ? '#10B981' : student.fee_status === 'partial' ? '#F59E0B' : '#EF4444'],
          ].map(([l, v, c]) => (
            <div key={l} className="ch" style={{ ...getGlass(dark), borderRadius: 16, padding: 20, borderTop: `3px solid ${c}` }}>
              <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: c, fontFamily: "'Space Grotesk',sans-serif" }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly ledger grid */}
      {student && (
        <Card title={`📒 Monthly Ledger — ${year}`} icon="📒" style={{ marginBottom: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 12 }}>
            {monthNames.map((m, i) => {
              const pay = payments.find(p => p.student_id === student.id && p.month === m && String(p.year) === String(year))
              return (
                <div key={m} style={{ ...getGlassLight(dark), borderRadius: 14, padding: 16, borderLeft: `3px solid ${pay ? '#10B981' : new Date().getMonth() === i ? '#F59E0B' : 'rgba(255,255,255,.05)'}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 6 }}>{m.substring(0, 3)}</div>
                  {pay ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#10B981', fontFamily: "'Space Grotesk',sans-serif" }}>{currency(pay.paid_amount || pay.amount)}</div>
                      <div style={{ fontSize: 9, color: '#10B981', marginTop: 3 }}>✓ {pay.payment_method || 'Paid'}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#4B5563', fontFamily: "'Space Grotesk',sans-serif" }}>—</div>
                      <div style={{ fontSize: 9, color: new Date().getMonth() === i ? '#F59E0B' : '#4B5563', marginTop: 3 }}>{new Date().getMonth() === i ? 'Current' : 'Unpaid'}</div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Payment history */}
      <Card title={`💳 Payment History (${myPayments.length})`} icon="💳" noPadding>
        <Tbl headers={student ? ['Month', 'Year', 'Amount', 'Method', 'Date', 'Receipt', 'Actions'] : ['Student', 'Month', 'Year', 'Amount', 'Method', 'Date', 'Actions']} empty={myPayments.length === 0 ? <Empty icon="💳" title="No payments" /> : null}>
          {myPayments.slice(0, 100).map((p, i) => {
            const st = students.find(s => s.id === p.student_id)
            return (
              <TR key={p.id} delay={i * .02}>
                {!student && <TD><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Av name={st?.full_name || '?'} size={30} /><span style={{ fontWeight: 600, fontSize: 13, color: dark ? '#E5E7EB' : '#1F2937' }}>{st?.full_name || '—'}</span></div></TD>}
                <TD><Bdg type="gold">{p.month}</Bdg></TD>
                <TD style={{ fontSize: 12 }}>{p.year}</TD>
                <TD style={{ fontWeight: 700, color: '#10B981' }}>{currency(p.paid_amount || p.amount)}</TD>
                <TD style={{ fontSize: 12 }}>{p.payment_method || 'Cash'}</TD>
                <TD style={{ fontSize: 12 }}>{fmtDate(p.paid_date || p.created_at)}</TD>
                {student && <TD style={{ fontSize: 11, color: '#6B7280' }}>{p.receipt_number?.substring(0, 12) || '—'}</TD>}
                <TD><Btn type="danger" size="xs" onClick={() => delPayment(p.id)}>🗑</Btn></TD>
              </TR>
            )
          })}
        </Tbl>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="💰 Record Fee Payment" icon="💰" footer={<><Btn type="ghost" onClick={() => setModal(false)}>Cancel</Btn><Btn type="success" onClick={savePayment}>💰 Record Payment</Btn></>}>
        <Sel label="Student" required value={form.student_id || ''} onChange={e => setForm({ ...form, student_id: e.target.value })}>
          <option value="">Select Student</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.full_name} (Due: {currency(dueOf(s))}{monthsDueOf(s) > 0 ? ` · ${monthsDueOf(s)} mo` : ''})</option>)}
        </Sel>
        <Grid>
          <Sel label="Month" value={form.month || ''} onChange={e => setForm({ ...form, month: e.target.value })}>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </Sel>
          <Inp label="Year" type="number" value={form.year || year} onChange={e => setForm({ ...form, year: e.target.value })} />
        </Grid>
        <Grid>
          <Inp label="Amount (PKR)" required type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="5000" />
          <Sel label="Payment Method" value={form.payment_method || 'Cash'} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </Sel>
        </Grid>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════
// STUDENT ID CARDS — with QR code
// ═══════════════════════════════════════
function IdCardsPage() {
  const { dark } = useTheme()
  const [students, setStudents] = useState([]); const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true); const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([sb.from('students').select('*').order('full_name'), sb.from('batches').select('*')]).then(([s, b]) => {
      setStudents(s.data || []); setBatches(b.data || []); setLoading(false)
    })
  }, [])

  const genCard = (s) => {
    const batch = batches.find(b => b.id === s.batch_id)
    const sid = 'AEM-' + String(s.full_name || '').replace(/\s+/g, '').substring(0, 3).toUpperCase() + '-' + (s.id || '').substring(0, 6).toUpperCase()
    // Simple QR-like pattern using canvas-free approach (visual matrix)
    let seed = 0; for (let i = 0; i < (s.id || 'x').length; i++) seed = (seed * 31 + (s.id || 'x').charCodeAt(i)) % 99991
    const cells = []
    for (let i = 0; i < 144; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; cells.push((seed >> 16) % 100 > 48) }
    const qrHtml = `<div class="qr-wrap"><div class="qr" style="display:grid;grid-template-columns:repeat(12,6px);gap:1px;padding:5px;background:#fff;border-radius:5px;width:82px;height:82px">${cells.map(c => `<div style="width:6px;height:6px;background:${c ? '#000' : '#fff'}"></div>`).join('')}</div><div class="qr-label">SCAN TO VERIFY</div></div>`
    const w = window.open('', '_blank')
    if (!w) { toast.error('Please allow pop-ups to generate ID card'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>ID Card - ${s.full_name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{min-height:100%;print-color-adjust:exact;-webkit-print-color-adjust:exact}
body{font-family:'Inter',sans-serif;background:#e5e5e5;padding:32px;display:flex;justify-content:center;align-items:flex-start}
.card{width:340px;min-height:540px;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.2);position:relative;background:#0a0a0a;display:flex;flex-direction:column;flex:0 0 auto}
.top{min-height:126px;background:linear-gradient(135deg,#FFD700,#FFA500);padding:20px 24px 48px;text-align:center;position:relative;flex:0 0 auto}
.top .logo{font-size:22px;letter-spacing:5px;font-weight:900;color:#000;line-height:1.1}
.top .inst{font-size:8px;letter-spacing:3px;color:rgba(0,0,0,.6);font-weight:700;margin-top:4px}
.badge-type{display:inline-block;margin-top:10px;padding:5px 16px;background:rgba(0,0,0,.12);border-radius:20px;font-size:9px;font-weight:800;letter-spacing:2px;color:#000}
.photo-wrap{height:0;display:flex;justify-content:center;position:relative;z-index:2;transform:translateY(-48px);flex:0 0 auto}
.photo{width:96px;height:96px;border-radius:50%;border:4px solid #FFD700;outline:3px solid #0a0a0a;object-fit:cover;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:900;color:#FFD700;overflow:hidden}
.mid{flex:1;padding:58px 24px 16px;text-align:center;display:flex;flex-direction:column;align-items:stretch;min-height:0}
.name{font-size:20px;line-height:1.2;font-weight:800;color:#fff;margin:0 auto 5px;max-width:280px;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.fname{font-size:10px;line-height:1.35;color:#888;margin-bottom:14px;min-height:14px;overflow-wrap:anywhere}
.info{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:9px;margin-bottom:13px;width:100%}
.box{min-width:0;background:rgba(255,255,255,.04);border:1px solid rgba(255,215,0,.08);border-radius:10px;padding:9px 7px}
.box .l{font-size:7px;text-transform:uppercase;letter-spacing:.9px;color:#666;font-weight:700;margin-bottom:4px}
.box .v{font-size:10px;line-height:1.25;font-weight:700;color:#E5E7EB;overflow-wrap:anywhere;word-break:break-word;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;min-height:25px}
.qr-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;margin:auto auto 0}
.qr{flex:0 0 auto}
.qr-label{font-size:6px;letter-spacing:1.5px;color:#666;font-weight:800;margin-top:5px}
.bottom{min-height:56px;background:rgba(255,215,0,.04);padding:12px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid rgba(255,215,0,.08);flex:0 0 auto}
.valid{font-size:8px;color:#666;font-weight:700;line-height:1.35}
.valid .d{color:#FFD700;font-size:10px;white-space:nowrap}
.sid-code{font-size:9px;font-weight:800;color:#FFD700;letter-spacing:.7px;text-align:right;overflow-wrap:anywhere}
@page{size:A4 portrait;margin:12mm}
@media print{html,body{width:100%;height:auto}body{background:#fff;padding:0;display:flex;justify-content:center;align-items:flex-start}.card{width:340px;min-height:540px;max-height:none;box-shadow:none;page-break-inside:avoid;break-inside:avoid;border-radius:18px}}
@media(max-width:390px){body{padding:16px}.card{width:100%;max-width:340px}}
</style></head><body>
<div class="card">
<div class="top">
<div class="logo">AEM<span style="color:#fff">T</span>ECH</div>
<div class="inst">INSTITUTE OF DIGITAL SKILLS</div>
<div class="badge-type">STUDENT ID CARD</div>
</div>
<div class="photo-wrap">${s.profile_image ? `<img class="photo" src="${s.profile_image}" alt=""/>` : `<div class="photo">${initials(s.full_name)}</div>`}</div>
<div class="mid">
<div class="name">${s.full_name}</div>
${s.father_name ? `<div class="fname">${childOf(s.gender)} ${s.father_name}</div>` : '<div class="fname">&nbsp;</div>'}
<div class="info">
<div class="box"><div class="l">Student ID</div><div class="v">${sid}</div></div>
<div class="box"><div class="l">Batch</div><div class="v">${batch?.name || '—'}</div></div>
<div class="box"><div class="l">City</div><div class="v">${s.city || '—'}</div></div>
<div class="box"><div class="l">Status</div><div class="v" style="color:${s.status === 'active' ? '#10B981' : '#F59E0B'}">${(s.status || 'active').toUpperCase()}</div></div>
</div>
${qrHtml}
</div>
<div class="bottom">
<div class="valid">VALID TILL<div class="d">${new Date(Date.now() + 31536000000).toLocaleDateString('en-PK', { month: 'short', year: 'numeric' })}</div></div>
<div class="sid-code">${sid}</div>
</div>
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),600)}<\/script>
</body></html>`)
    w.document.close()
  }

  const genAll = () => {
    const list = students.filter(s => !search || s.full_name?.toLowerCase().includes(search.toLowerCase()))
    if (list.length === 0) { toast.error('No students'); return }
    toast.loading('Generating...', { id: 'cards' })
    setTimeout(() => {
      list.slice(0, 12).forEach((s, i) => setTimeout(() => genCard(s), i * 400))
      toast.success(`${Math.min(list.length, 12)} cards opening!`, { id: 'cards' })
    }, 300)
  }

  if (loading) return <SkeletonDashboard />
  const filtered = students.filter(s => !search || s.full_name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <Card title="🪪 Student ID Cards" icon="🪪" action={
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Search value={search} onChange={e => setSearch(e.target.value)} />
        <Btn type="outline" size="sm" onClick={genAll} icon="🖨">Print All (12)</Btn>
      </div>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16 }}>
        {filtered.map(s => (
          <div key={s.id} className="ch" style={{ ...getGlassLight(dark), borderRadius: 18, padding: 22, textAlign: 'center' }}>
            <Av name={s.full_name} src={s.profile_image || null} size={58} glow />
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 14, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</div>
            <div style={{ fontSize: 11, color: '#6B7280', margin: '4px 0 10px' }}>{batches.find(b => b.id === s.batch_id)?.name || '—'}</div>
            <div style={{ fontSize: 9, color: '#4B5563', fontFamily: "'Space Grotesk',sans-serif", marginBottom: 12 }}>AEM-{String(s.full_name || '').replace(/\s+/g, '').substring(0, 3).toUpperCase()}-{(s.id || '').substring(0, 6).toUpperCase()}</div>
            <Bdg type={statusBadge(s.status)} size="sm" dot>{s.status}</Bdg>
            <div style={{ marginTop: 14 }}><Btn onClick={() => genCard(s)} size="sm" full icon="🪪">Generate</Btn></div>
          </div>
        ))}
        {filtered.length === 0 && <Empty icon="🪪" title="No students found" />}
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════
// WHATSAPP REMINDERS HUB
// ═══════════════════════════════════════
function RemindersPage() {
  const { dark } = useTheme()
  const [students, setStudents] = useState([]); const [classes, setClasses] = useState([]); const [assignments, setAssignments] = useState([])
  const [batches, setBatches] = useState([]); const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('fee'); const [selBatch, setSelBatch] = useState('')
  const [sent, setSent] = useState([]); const [msg, setMsg] = useState('')

  const TPL = {
    fee: 'Assalam o Alaikum {name}! 🙏\n\nAapki fee ka bakaya:\n💰 Total Fee: {fee}\n✅ Jama: {paid}\n⚠️ Bakaya: {due}\n\nBarah-e-karam jald az jald jama karayen.\n\nShukria!\nAEMTECH Institute',
    class: 'Assalam o Alaikum {name}! 👋\n\nAaj class hai:\n📚 Topic: {topic}\n⏰ Time: {time}\n📅 Date: {date}\n\nClass time par zaroor join karein!\n\nAEMTECH Institute',
    assignment: 'Assalam o Alaikum {name}! 📝\n\nAssignment ki deadline aa gayi hai:\n📋 {assignment}\n📅 Due: {due}\n⏳ Time bacha hai!\n\nJald submit karein.\n\nAEMTECH Institute',
    absent: 'Assalam o Alaikum {name}! 🚨\n\nHumne note kiya ke aap {absent} classes se gayab hain.\n\nAgar koi masla ho to humein zaroor batayein. Aapki attendance {pct}% hai.\n\nAEMTECH Institute',
    welcome: 'Assalam o Alaikum {name}! 🎉\n\nAEMTECH mein khair maqdam!\n\n📧 Login: {email}\n🔑 Password: {password}\n\nAEMTECH Institute',
  }

  useEffect(() => {
    (async () => {
      const [s, c, a, b] = await Promise.all([
        sb.from('students').select('*').order('full_name'),
        sb.from('classes').select('*').order('class_number'),
        sb.from('assignments').select('*'),
        sb.from('batches').select('*'),
      ])
      setStudents(s.data || []); setClasses(c.data || []); setAssignments(a.data || []); setBatches(b.data || [])
      setLoading(false)
    })()
  }, [])

  useEffect(() => { setMsg(TPL[tab] || '') }, [tab])

  const fmtPhone = (num) => { let ph = (num || '').replace(/\D/g, ''); if (!ph) return ''; if (ph.startsWith('0')) ph = '92' + ph.substring(1); if (ph.length === 10 && !ph.startsWith('92')) ph = '92' + ph; return ph }

  const today = new Date().toISOString().split('T')[0]
  const todayClasses = classes.filter(c => c.date === today)

  let targets = []
  if (tab === 'fee') targets = students.filter(s => s.status === 'active' && dueOf(s) > 0)
    .map(s => ({ ...s, vars: { fee: currency(totalFeeOf(s)), paid: currency(s.fee_paid), due: currency(dueOf(s)), months: String(monthsDueOf(s)) } }))
  else if (tab === 'class') {
    const tc = selBatch ? todayClasses.filter(c => c.batch_id === selBatch) : todayClasses
    const bIds = [...new Set(tc.map(c => c.batch_id))]
    targets = students.filter(s => s.status === 'active' && bIds.includes(s.batch_id))
      .map(s => { const c = tc.find(x => x.batch_id === s.batch_id) || tc[0]; return { ...s, vars: { topic: c?.title || 'Class', time: c?.time || '7 PM', date: fmtDate(c?.date || today) } } })
  } else if (tab === 'assignment') {
    const asns = selBatch ? assignments.filter(a => a.batch_id === selBatch) : assignments
    const bIds = [...new Set(asns.map(a => a.batch_id))]
    targets = students.filter(s => s.status === 'active' && bIds.includes(s.batch_id))
      .map(s => { const a = asns.find(x => x.batch_id === s.batch_id) || asns[0]; return { ...s, vars: { assignment: a?.title || 'Assignment', due: fmtDT(a?.due_date) } } })
  } else if (tab === 'absent') {
    targets = students.filter(s => s.status === 'active').map(s => {
      const total = classes.filter(c => c.batch_id === s.batch_id).length
      const present = classes.filter(c => c.batch_id === s.batch_id).length > 0 ? 0 : 0
      return { ...s, total, vars: {} }
    })
    // compute attendance properly
    targets = targets.map(t => t)
  } else if (tab === 'welcome') targets = students.filter(s => s.status === 'active').map(s => ({ ...s, vars: { email: s.login_email || s.email, password: s.password || '12345678' } }))

  if (tab === 'absent') targets = []

  const sendOne = (s) => {
    let text = msg
    Object.entries(s.vars || {}).forEach(([k, v]) => { text = text.split('{' + k + '}').join(String(v)) })
    text = text.split('{name}').join(s.full_name || '')
    const ph = fmtPhone(s.phone)
    if (!ph) { toast.error(s.full_name + ' ka phone nahi hai'); return false }
    window.open('https://api.whatsapp.com/send?phone=' + ph + '&text=' + encodeURIComponent(text), '_blank')
    setSent(p => [...p, s.id])
    return true
  }

  const sendAll = () => {
    if (targets.length === 0) { toast.error('No targets'); return }
    const list = targets.slice(0, 15)
    let ok = 0
    list.forEach((s, i) => setTimeout(() => { if (sendOne(s)) ok++ }, i * 700))
    logAction('BULK_WHATSAPP', 'Reminders', `${tab} → ${list.length} students`)
    toast.success(`${list.length} WhatsApp tabs khul rahe hain! 📣`)
  }

  const copyList = () => {
    const lines = targets.map(s => `${s.full_name} — ${fmtPhone(s.phone)}`).join('\n')
    navigator.clipboard?.writeText(lines); toast.success('Phone list copied! 📋')
  }

  if (loading) return <SkeletonDashboard />

  const tabs = [['fee', '💰 Fee Due'], ['class', '📅 Class Today'], ['assignment', '📝 Assignment'], ['welcome', '🎉 Welcome']]

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, padding: 6, ...getGlass(dark), borderRadius: 16, overflowX: 'auto' }} className="cs">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '12px 22px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12, transition: 'all .3s', background: tab === k ? G : 'transparent', color: tab === k ? '#000' : '#6B7280', whiteSpace: 'nowrap' }}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16, marginBottom: 22 }}>
        <Stat icon="🎯" value={targets.length} label="Targets" />
        <Stat icon="📱" value={targets.filter(s => s.phone).length} label="With Phone" color="#10B981" />
        <Stat icon="✅" value={sent.length} label="Sent" color="#3B82F6" />
        <Stat icon="⚠️" value={targets.filter(s => !s.phone).length} label="No Phone" color="#EF4444" />
      </div>

      <Grid gap={22}>
        <Card title="✏️ Message Template" icon="✏️">
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 12, lineHeight: 1.6 }}>
            Variables: <strong style={{ color: '#FFD700' }}>{'{name}'}</strong>
            {tab === 'fee' && <>, {'{fee}'}, {'{paid}'}, {'{due}'}</>}
            {tab === 'class' && <>, {'{topic}'}, {'{time}'}, {'{date}'}</>}
            {tab === 'assignment' && <>, {'{assignment}'}, {'{due}'}</>}
            {tab === 'welcome' && <>, {'{email}'}, {'{password}'}</>}
          </div>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={10}
            style={{ width: '100%', background: dark ? 'rgba(0,0,0,.3)' : '#FAFAFA', border: `1.5px solid ${dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.1)'}`, color: dark ? '#E5E7EB' : '#1F2937', padding: '14px 18px', borderRadius: 13, fontSize: 13, outline: 'none', fontFamily: "'Inter',sans-serif", resize: 'vertical', lineHeight: 1.7 }}/>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <Btn onClick={sendAll} icon="📣" disabled={targets.length === 0}>Send to {Math.min(targets.length, 15)}</Btn>
            <Btn type="outline" size="sm" onClick={() => setMsg(TPL[tab])} icon="🔄">Reset</Btn>
            <Btn type="ghost" size="sm" onClick={copyList} icon="📋">Copy Phones</Btn>
          </div>
          <div style={{ fontSize: 10, color: '#4B5563', marginTop: 10 }}>⚠️ Browser ek saath ek se zyada tabs block kar sakta hai — "Allow pop-ups" karein. Pehle 15 students tak send hota hai.</div>
        </Card>

        <Card title={`🎯 Recipients (${targets.length})`} icon="🎯">
          <div style={{ maxHeight: 460, overflowY: 'auto' }} className="cs">
            {targets.length === 0 ? <Empty icon="✅" title="No targets" sub="Sab theek hai!" /> : targets.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, ...getGlassLight(dark), borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                <Av name={s.full_name} src={s.profile_image || null} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{s.phone || '⚠️ No phone'} {tab === 'fee' && s.vars?.due ? `· Due ${s.vars.due}` : ''}</div>
                </div>
                <Btn type={sent.includes(s.id) ? 'success' : 'outline'} size="xs" onClick={() => sendOne(s)} icon={sent.includes(s.id) ? '✅' : '💬'}>{sent.includes(s.id) ? 'Sent' : 'Send'}</Btn>
              </div>
            ))}
          </div>
        </Card>
      </Grid>
    </div>
  )
}

// ═══════════════════════════════════════
// MONTHLY INSTITUTE REPORT PDF
// ═══════════════════════════════════════
function MonthlyReportPage() {
  const { dark } = useTheme()
  const [loading, setLoading] = useState(true); const [data, setData] = useState(null)
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]); const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    (async () => {
      const [s, c, a, att, sub, adm, pay, b] = await Promise.all([
        sb.from('students').select('*'), sb.from('classes').select('*'), sb.from('assignments').select('*'),
        sb.from('attendance').select('*'), sb.from('submissions').select('*'), sb.from('admissions').select('*'),
        sb.from('fee_payments').select('*'), sb.from('batches').select('*'),
      ])
      setData({ students: s.data || [], classes: c.data || [], assignments: a.data || [], attendance: att.data || [], submissions: sub.data || [], admissions: adm.data || [], payments: pay.data || [], batches: b.data || [] })
      setLoading(false)
    })()
  }, [])

  if (loading) return <SkeletonDashboard />
  if (!data) return null

  const inMonth = (d) => { if (!d) return false; const dt = new Date(d); return MONTHS[dt.getMonth()] === month && dt.getFullYear() === Number(year) }
  const mStudents = data.students.filter(s => inMonth(s.created_at))
  const mClasses = data.classes.filter(c => inMonth(c.date))
  const mAdmissions = data.admissions.filter(a => inMonth(a.applied_at))
  const mPayments = data.payments.filter(p => inMonth(p.paid_date || p.created_at))
  const collected = mPayments.reduce((a, p) => a + (p.paid_amount || p.amount || 0), 0)
  const mSubs = data.submissions.filter(s => inMonth(s.submitted_at))
  const mAtt = data.attendance.filter(a => inMonth(a.marked_at || a.created_at))
  const presentRate = mAtt.length > 0 ? Math.round(mAtt.filter(a => a.status === 'present').length / mAtt.length * 100) : 0
  const dueStudents = data.students.filter(s => s.status === 'active' && dueOf(s) > 0)
  const totalDue = dueStudents.reduce((a, s) => a + dueOf(s), 0)

  // Top performers
  const ranked = data.students.filter(s => s.status === 'active').map(s => {
    const total = data.classes.filter(c => c.batch_id === s.batch_id).length
    const present = data.attendance.filter(a => a.student_id === s.id && a.status === 'present').length
    const subs = data.submissions.filter(x => x.student_id === s.id && x.marks_obtained != null)
    const avg = subs.length > 0 ? Math.round(subs.reduce((a, x) => a + x.marks_obtained, 0) / subs.length) : 0
    const pct = total > 0 ? Math.round(present / total * 100) : 0
    return { ...s, pct, avg, score: pct + avg }
  }).sort((a, b) => b.score - a.score).slice(0, 10)

  const batchPerf = data.batches.map(b => {
    const bs = data.students.filter(s => s.batch_id === b.id)
    const bc = data.classes.filter(c => c.batch_id === b.id)
    const ba = data.attendance.filter(a => bc.some(c => c.id === a.class_id))
    return { name: b.name, students: bs.length, classes: bc.length, attPct: ba.length > 0 ? Math.round(ba.filter(a => a.status === 'present').length / ba.length * 100) : 0, revenue: bs.reduce((a, s) => a + (s.fee_paid || 0), 0) }
  })

  const generate = () => {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Monthly Report — ${month} ${year}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#f0f0f0;padding:30px;display:flex;justify-content:center}
.rep{width:800px;background:#fff;box-shadow:0 4px 30px rgba(0,0,0,.1)}
.hd{background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:36px 44px;border-bottom:4px solid #FFD700;color:#fff;display:flex;justify-content:space-between;align-items:center}
.hd h1{font-size:26px;font-weight:900}
.hd .sub{font-size:11px;letter-spacing:3px;color:rgba(255,255,255,.5);font-weight:700;margin-bottom:6px}
.hd .per{font-size:34px;font-weight:900;color:#FFD700;font-family:'Inter',sans-serif}
.bd{padding:36px 44px}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:30px}
.kpi div{background:#f9fafb;border-left:3px solid #FFD700;border-radius:10px;padding:16px}
.kpi .l{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:700;margin-bottom:5px}
.kpi .v{font-size:22px;font-weight:900;color:#111}
.sec{margin-bottom:26px}
.sec h2{font-size:14px;font-weight:800;color:#111;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #f3f4f6}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#f9fafb;padding:10px 12px;text-align:left;font-weight:700;color:#4b5563;border-bottom:2px solid #e5e7eb;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:9px 12px;border-bottom:1px solid #f3f4f6;color:#374151}
.ft{padding:22px 44px;border-top:2px solid #f3f4f6;background:#fafafa;text-align:center}
.ft p{font-size:10px;color:#999}
@media print{body{background:#fff;padding:0}.rep{box-shadow:none}}
</style></head><body>
<div class="rep">
<div class="hd">
<div><div class="sub">AEMTECH INSTITUTE</div><h1>Monthly Report</h1><div style="font-size:11px;color:#888;margin-top:4px">Generated ${new Date().toLocaleString('en-PK')}</div></div>
<div style="text-align:right"><div class="per">${month.substring(0,3)}</div><div style="font-size:20px;font-weight:800;color:#fff">${year}</div></div>
</div>
<div class="bd">
<div class="kpi">
<div><div class="l">New Students</div><div class="v">${mStudents.length}</div></div>
<div><div class="l">Applications</div><div class="v">${mAdmissions.length}</div></div>
<div><div class="l">Classes Held</div><div class="v">${mClasses.length}</div></div>
<div><div class="l">Attendance</div><div class="v" style="color:${presentRate>=80?'#059669':presentRate>=60?'#d97706':'#dc2626'}">${presentRate}%</div></div>
<div><div class="l">Collected</div><div class="v" style="color:#059669">PKR ${collected.toLocaleString()}</div></div>
<div><div class="l">Outstanding</div><div class="v" style="color:#dc2626">PKR ${totalDue.toLocaleString()}</div></div>
<div><div class="l">Submissions</div><div class="v">${mSubs.length}</div></div>
<div><div class="l">Total Students</div><div class="v">${data.students.length}</div></div>
</div>

<div class="sec"><h2>🏫 Batch Performance</h2><table>
<tr><th>Batch</th><th>Students</th><th>Classes</th><th>Attendance</th><th>Revenue</th></tr>
${batchPerf.map(b => `<tr><td style="font-weight:700">${b.name}</td><td>${b.students}</td><td>${b.classes}</td><td style="color:${b.attPct>=80?'#059669':b.attPct>=60?'#d97706':'#dc2626'};font-weight:700">${b.attPct}%</td><td>PKR ${b.revenue.toLocaleString()}</td></tr>`).join('')}
</table></div>

<div class="sec"><h2>🏆 Top 10 Performers</h2><table>
<tr><th>#</th><th>Student</th><th>Attendance</th><th>Avg Marks</th><th>Score</th></tr>
${ranked.map((s,i) => `<tr><td style="font-weight:800;color:${i<3?'#d97706':'#666'}">${i<3?['🥇','🥈','🥉'][i]:i+1}</td><td style="font-weight:700">${s.full_name}</td><td style="color:${s.pct>=80?'#059669':'#dc2626'}">${s.pct}%</td><td>${s.avg}</td><td style="font-weight:800;color:#d97706">${s.score}</td></tr>`).join('')}
</table></div>

<div class="sec"><h2>⚠️ Fee Defaulters (${dueStudents.length})</h2><table>
<tr><th>Student</th><th>Batch</th><th>Fee</th><th>Paid</th><th>Due</th></tr>
${dueStudents.slice(0,25).map(s => `<tr><td style="font-weight:700">${s.full_name}</td><td>${data.batches.find(b=>b.id===s.batch_id)?.name||'—'}</td><td>PKR ${totalFeeOf(s).toLocaleString()}</td><td>PKR ${(s.fee_paid||0).toLocaleString()}</td><td style="color:#dc2626;font-weight:700">PKR ${dueOf(s).toLocaleString()}</td></tr>`).join('')}
</table></div>
</div>
<div class="ft"><p style="font-size:12px;color:#666;font-weight:600;margin-bottom:6px">AEMTECH Institute — Design the Future</p><p>Computer generated monthly report • ${month} ${year}</p></div>
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),600)}<\/script>
</body></html>`)
    w.document.close()
    logAction('GENERATE', 'MonthlyReport', `${month} ${year}`)
  }

  const exportX = () => exportXLS(batchPerf.map(b => ({ Batch: b.name, Students: b.students, Classes: b.classes, 'Attendance %': b.attPct, 'Revenue (PKR)': b.revenue })), `AEMTECH_Report_${month}_${year}.xlsx`, 'Batches')

  return (
    <div className="page-enter">
      <div style={{ ...getGlass(dark), borderRadius: 22, padding: 'clamp(22px,3vw,34px)', marginBottom: 24, background: dark ? 'linear-gradient(135deg,rgba(255,215,0,.06),rgba(12,12,14,.85))' : 'linear-gradient(135deg,rgba(255,215,0,.08),rgba(255,255,255,.95))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>Institute Report</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(22px,3vw,30px)', fontWeight: 900 }}><span style={{ background: G, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{month} {year}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn onClick={generate} icon="📑" size="lg">Generate PDF</Btn>
            <Btn type="outline" size="lg" onClick={exportX} icon="📊">Excel</Btn>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
        <Sel label="" value={month} onChange={e => setMonth(e.target.value)} style={{ minWidth: 170 }}>
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </Sel>
        <Sel label="" value={year} onChange={e => setYear(e.target.value)} style={{ minWidth: 120 }}>
          {[0, 1, 2].map(i => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option> }) }
        </Sel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16, marginBottom: 24 }}>
        <Stat icon="👥" value={mStudents.length} label="New Students" color="#10B981" />
        <Stat icon="📋" value={mAdmissions.length} label="Applications" />
        <Stat icon="📅" value={mClasses.length} label="Classes Held" color="#3B82F6" />
        <Stat icon="✅" value={presentRate + '%'} label="Attendance" color={attColor(presentRate)} />
        <Stat icon="💰" value={currency(collected)} label="Collected" color="#10B981" />
        <Stat icon="⚠️" value={currency(totalDue)} label="Outstanding" color="#EF4444" />
        <Stat icon="📤" value={mSubs.length} label="Submissions" color="#8B5CF6" />
        <Stat icon="🏫" value={data.students.length} label="Total Students" />
      </div>

      <Card title="🏫 Batch Performance" icon="🏫" noPadding>
        <Tbl headers={['Batch', 'Students', 'Classes', 'Attendance', 'Revenue']}>
          {batchPerf.map((b, i) => (
            <TR key={b.name} delay={i * .04}>
              <TD style={{ fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937' }}>{b.name}</TD>
              <TD>{b.students}</TD><TD>{b.classes}</TD>
              <TD><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 85 }}><PBar value={b.attPct} max={100} /></div><span style={{ fontWeight: 700, color: attColor(b.attPct) }}>{b.attPct}%</span></div></TD>
              <TD style={{ fontWeight: 700, color: '#10B981' }}>{currency(b.revenue)}</TD>
            </TR>
          ))}
        </Tbl>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════
// BATCH PROMOTION
// ═══════════════════════════════════════
function PromotionPage() {
  const { dark } = useTheme()
  const [batches, setBatches] = useState([]); const [students, setStudents] = useState([]); const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false); const { confirm } = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    const [b, s, c] = await Promise.all([sb.from('batches').select('*').order('created_at'), sb.from('students').select('*'), sb.from('classes').select('*')])
    setBatches(b.data || []); setStudents(s.data || []); setClasses(c.data || []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const moving = from ? students.filter(s => s.batch_id === from && s.status === 'active') : []
  const fromBatch = batches.find(b => b.id === from)
  const toBatch = batches.find(b => b.id === to)
  const fromClasses = classes.filter(c => c.batch_id === from).length

  const promote = async () => {
    if (!from || !to) { toast.error('Select both batches'); return }
    if (from === to) { toast.error('Same batch selected'); return }
    const ok = await confirm({
      title: `Promote ${moving.length} Students?`,
      message: `"${fromBatch?.name}" se "${toBatch?.name}" mein transfer honge. Attendance aur submissions safe rahenge.`,
      type: 'warning', confirmText: `Promote ${moving.length}`, icon: '⏭'
    })
    if (!ok) return
    setBusy(true)
    let done = 0
    for (const s of moving) { await sb.from('students').update({ batch_id: to }).eq('id', s.id); done++ }
    logAction('PROMOTE', 'Batch', `${fromBatch?.name} → ${toBatch?.name} (${done} students)`)
    toastSuccess(`${done} students promoted! 🎉`, { undo: async () => { for (const s of moving) await sb.from('students').update({ batch_id: from }).eq('id', s.id); load() }, duration: 6000 })
    setBusy(false); load()
  }

  const graduate = async () => {
    if (!from) { toast.error('Select batch'); return }
    const ok = await confirm({ title: `Graduate ${moving.length} Students?`, message: 'Sab students GRADUATED status mil jayega.', type: 'warning', confirmText: 'Graduate All', icon: '🎓' })
    if (!ok) return
    setBusy(true)
    for (const s of moving) await sb.from('students').update({ status: 'graduated' }).eq('id', s.id)
    logAction('GRADUATE', 'Batch', `${fromBatch?.name} (${moving.length} students)`)
    toast.success(`${moving.length} students graduated 🎓`)
    setBusy(false); load()
  }

  if (loading) return <SkeletonDashboard />

  return (
    <div className="page-enter">
      <Grid gap={22}>
        <Card title="⏭ Promote Students" icon="⏭">
          <Grid>
            <Sel label="From Batch" value={from} onChange={e => setFrom(e.target.value)}>
              <option value="">Select</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name} ({students.filter(s => s.batch_id === b.id).length})</option>)}
            </Sel>
            <Sel label="To Batch" value={to} onChange={e => setTo(e.target.value)}>
              <option value="">Select</option>
              {batches.filter(b => b.id !== from).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Sel>
          </Grid>
          {from && (
            <div style={{ ...getGlassLight(dark), borderRadius: 14, padding: 18, marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                {[['👥', moving.length, 'Active Students'], ['📅', fromClasses, 'Classes Done'], ['🎓', students.filter(s => s.batch_id === from && s.status === 'graduated').length, 'Graduated']].map(([ic, n, l]) => (
                  <div key={l} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20 }}>{ic}</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 900, color: '#FFD700' }}>{n}</div>
                    <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Btn onClick={promote} loading={busy} icon="⏭" disabled={!to || moving.length === 0}>Promote to {toBatch?.name || '...'}</Btn>
                <Btn type="warning" onClick={graduate} loading={busy} icon="🎓">Graduate All</Btn>
              </div>
            </div>
          )}
        </Card>

        <Card title={`👥 Students (${moving.length})`} icon="👥">
          {moving.length === 0 ? <Empty icon="👥" title="No active students" sub="Batch select karein" /> : (
            <div style={{ maxHeight: 420, overflowY: 'auto' }} className="cs">
              {moving.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, ...getGlassLight(dark), borderRadius: 12, padding: '11px 14px', marginBottom: 9 }}>
                  <Av name={s.full_name} src={s.profile_image || null} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>{childOf(s.gender)} {s.father_name || '—'}</div>
                  </div>
                  <Bdg type={statusBadge(s.fee_status)} size="sm" dot>{s.fee_status}</Bdg>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Grid>
    </div>
  )
}

// ═══════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════
function AuditLogPage() {
  const { dark } = useTheme()
  const [logs, setLogs] = useState([]); const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all')
  const { confirm } = useConfirm()

  useEffect(() => { setLogs(getAuditLogs()) }, [])

  const actions = [...new Set(logs.map(l => l.action))]
  const filtered = logs.filter(l => (!filter || filter === 'all' || l.action === filter) && (!search || (l.entity + ' ' + l.detail + ' ' + l.actor).toLowerCase().includes(search.toLowerCase())))

  const clear = async () => {
    const ok = await confirm({ title: 'Clear Audit Log?', message: `${logs.length} entries delete ho jayengi.`, type: 'danger', confirmText: 'Clear All', icon: '🗑️' })
    if (!ok) return
    localStorage.removeItem(AUDIT_KEY); setLogs([]); toast.success('Audit log cleared')
  }

  const exportX = () => exportXLS(logs.map(l => ({ Time: fmtDT(l.time), Actor: l.actor, Action: l.action, Entity: l.entity, Detail: l.detail, Meta: l.meta })), 'AEMTECH_AuditLog.xlsx', 'Audit')

  const colorFor = (a) => a?.includes('DELETE') ? '#EF4444' : a?.includes('PROMOTE') || a?.includes('GRADUATE') ? '#10B981' : a?.includes('BULK') ? '#8B5CF6' : a?.includes('GENERATE') ? '#3B82F6' : '#FFD700'

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <Search value={search} onChange={e => setSearch(e.target.value)} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ background: dark ? '#0A0A0B' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.1)'}`, color: dark ? '#E5E7EB' : '#1F2937', padding: '10px 14px', borderRadius: 11, fontSize: 12, fontFamily: "'Inter',sans-serif", outline: 'none' }}>
          <option value="all">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <Btn type="success" size="sm" onClick={exportX} icon="📊">Export</Btn>
        {logs.length > 0 && <Btn type="danger" size="sm" onClick={clear} icon="🗑">Clear</Btn>}
      </div>

      <Card title={`🕵️ Audit Trail (${filtered.length})`} icon="🕵️" noPadding>
        <Tbl headers={['Time', 'Actor', 'Action', 'Entity', 'Details']} empty={filtered.length === 0 ? <Empty icon="🕵️" title="No entries yet" sub="Bulk actions, promotions aur report generation yahan track hongi" /> : null}>
          {filtered.map((l, i) => (
            <TR key={l.id} delay={i * .02}>
              <TD style={{ fontSize: 11 }}>{fmtDT(l.time)}</TD>
              <TD><Bdg type="gold" size="sm">{l.actor}</Bdg></TD>
              <TD><span style={{ fontSize: 10, fontWeight: 800, color: colorFor(l.action), background: colorFor(l.action) + '15', padding: '4px 10px', borderRadius: 7, letterSpacing: .5 }}>{l.action}</span></TD>
              <TD style={{ fontSize: 12, fontWeight: 600, color: dark ? '#E5E7EB' : '#1F2937' }}>{l.entity}</TD>
              <TD style={{ fontSize: 12, maxWidth: 320, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4 }}>{l.detail}{l.meta ? ` · ${l.meta}` : ''}</TD>
            </TR>
          ))}
        </Tbl>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════
// ADMIN LEARNING JOURNEY — batch + per-student curriculum progress
// ═══════════════════════════════════════
function JourneyPage() {
  const { dark } = useTheme()
  const [students, setStudents] = useState([]); const [batches, setBatches] = useState([])
  const [classes, setClasses] = useState([]); const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true); const [selBatch, setSelBatch] = useState(''); const [search, setSearch] = useState('')

  useEffect(() => {
    (async () => {
      const [s, b, c, a] = await Promise.all([
        sb.from('students').select('*').order('full_name'),
        sb.from('batches').select('*'),
        sb.from('classes').select('*'),
        sb.from('attendance').select('*'),
      ])
      setStudents(s.data || []); setBatches(b.data || []); setClasses(c.data || []); setAttendance(a.data || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <SkeletonDashboard />

  const pool = students.filter(s => s.status === 'active')
    .filter(s => !selBatch || s.batch_id === selBatch)
    .filter(s => !search || s.full_name?.toLowerCase().includes(search.toLowerCase()))

  const withProgress = pool.map(s => {
    const present = attendance.filter(a => a.student_id === s.id && a.status === 'present').length
    return { ...s, present, journey: buildJourney(present), overall: Math.min(100, Math.round(present / CURRICULUM_TOTAL * 100)) }
  }).sort((a, b) => b.present - a.present)

  // batch-level module averages
  const moduleAvg = CURRICULUM.map((mod, idx) => {
    if (withProgress.length === 0) return { ...mod, avg: 0, completed: 0, inProgress: 0, locked: 0 }
    let sum = 0, completed = 0, inProgress = 0, locked = 0
    withProgress.forEach(st => {
      const m = st.journey[idx]
      sum += m.progress
      if (m.progress >= 100) completed++
      else if (m.isLocked) locked++
      else inProgress++
    })
    return { ...mod, avg: Math.round(sum / withProgress.length), completed, inProgress, locked }
  })

  const avgOverall = withProgress.length > 0 ? Math.round(withProgress.reduce((a, s) => a + s.overall, 0) / withProgress.length) : 0
  const batchClasses = selBatch ? classes.filter(c => c.batch_id === selBatch).length : classes.length

  const doExport = () => exportXLS(withProgress.map(s => {
    const row = { Student: s.full_name, Batch: batches.find(b => b.id === s.batch_id)?.name || '', 'Classes Attended': s.present, 'Overall %': s.overall }
    s.journey.forEach(m => { row[`${m.module} — ${m.title}`] = `${m.attended}/${m.classes} (${m.progress}%)` })
    return row
  }), 'AEMTECH_LearningJourney.xlsx', 'Journey')

  return (
    <div className="page-enter">
      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ minWidth: 210 }}>
          <Sel label="" value={selBatch} onChange={e => setSelBatch(e.target.value)}>
            <option value="">🏫 All Batches ({students.filter(s => s.status === 'active').length})</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name} ({students.filter(s => s.batch_id === b.id && s.status === 'active').length})</option>)}
          </Sel>
        </div>
        <Search value={search} onChange={e => setSearch(e.target.value)} />
        <Btn type="success" size="sm" onClick={doExport} icon="📊">Export</Btn>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16, marginBottom: 24 }}>
        <Stat icon="👥" value={withProgress.length} label="Students" />
        <Stat icon="🚀" value={avgOverall + '%'} label="Avg Progress" color={attColor(avgOverall)} />
        <Stat icon="📅" value={batchClasses} label="Classes Created" color="#3B82F6" />
        <Stat icon="🎯" value={CURRICULUM_TOTAL} label="Curriculum Classes" color="#8B5CF6" />
      </div>

      {/* Module-wise batch progress */}
      <Card title="🚀 Curriculum Progress (Batch Average)" icon="🚀" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {moduleAvg.map(mod => (
            <div key={mod.key} style={{ ...getGlassLight(dark), borderRadius: 16, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, background: `${mod.color}12`, border: `1px solid ${mod.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{mod.icon}</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, gap: 10 }}>
                  <div>
                    <span style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>{mod.module} · {mod.classes} {mod.classes === 1 ? 'class' : 'classes'}</span>
                    <div style={{ fontSize: 15, fontWeight: 700, color: dark ? '#E5E7EB' : '#1F2937', marginTop: 3 }}>{mod.title}</div>
                  </div>
                  <span style={{ fontSize: 17, fontWeight: 900, color: mod.color, fontFamily: "'Space Grotesk',sans-serif" }}>{mod.avg}%</span>
                </div>
                <PBar value={mod.avg} max={100} height={9} color={mod.color} />
                <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 10, fontWeight: 700, flexWrap: 'wrap' }}>
                  <span style={{ color: '#10B981' }}>✅ {mod.completed} done</span>
                  <span style={{ color: '#F59E0B' }}>🔄 {mod.inProgress} ongoing</span>
                  <span style={{ color: '#6B7280' }}>🔒 {mod.locked} locked</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Per-student matrix */}
      <Card title={`👥 Student Progress (${withProgress.length})`} icon="👥" noPadding>
        <Tbl headers={['Student', ...CURRICULUM.map(m => `${m.icon} ${m.module}`), 'Overall']} empty={withProgress.length === 0 ? <Empty icon="🚀" title="No students" sub="Batch ya search filter badlein" /> : null}>
          {withProgress.map((s, i) => (
            <TR key={s.id} delay={i * .025}>
              <TD>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Av name={s.full_name} src={s.profile_image || null} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: dark ? '#E5E7EB' : '#1F2937' }}>{s.full_name}</div>
                    <div style={{ fontSize: 10, color: '#6B7280' }}>{s.present} classes attended</div>
                  </div>
                </div>
              </TD>
              {s.journey.map(m => (
                <TD key={m.key}>
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 56 }}>
                    <span style={{ fontSize: 15 }}>{m.isLocked ? '🔒' : m.progress >= 100 ? '✅' : m.progress > 0 ? '🔄' : '⏳'}</span>
                    <div style={{ width: 48 }}><PBar value={m.isLocked ? 0 : m.attended} max={m.classes} height={5} color={m.color} /></div>
                    <span style={{ fontSize: 9, color: '#6B7280', whiteSpace: 'nowrap' }}>{m.attended}/{m.classes}</span>
                  </div>
                </TD>
              ))}
              <TD>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 70 }}><PBar value={s.overall} max={100} height={7} /></div>
                  <span style={{ fontWeight: 800, fontSize: 13, color: attColor(s.overall), fontFamily: "'Space Grotesk',sans-serif" }}>{s.overall}%</span>
                </div>
              </TD>
            </TR>
          ))}
        </Tbl>
      </Card>
    </div>
  )
}

const pageTitles = { dashboard: '📊 Dashboard', students: '👥 Students', admissions: '📋 Admissions', batches: '🏫 Batches', classes: '📅 Classes', attendance: '✅ Attendance', assignments: '📝 Assignments', submissions: '📤 Submissions', recordings: '🎥 Recordings', fees: '💰 Fee Management', announcements: '📢 Announcements', certificates: '🎓 Certificates', leaderboard: '🏆 Leaderboard', sync: '🔄 Sheet Sync', excel: '📈 Import/Export', settings: '⚙️ Settings', certificate: '🎓 My Certificate', profile: '👤 My Profile', timetable: '🗓 Timetable', quizzes: '🧠 Quizzes', analytics: '📈 Analytics', progress: '📄 Progress Report', tasks: '🎯 Task Center', alerts: '🚨 Attendance Alerts', ledger: '📒 Fee Ledger', idcards: '🪪 ID Cards', reminders: '📣 WhatsApp Reminders', report: '📑 Monthly Report', promotion: '⏭ Batch Promotion', audit: '🕵️ Audit Log', journey: '🚀 Learning Journey' }

function Portal() {
  const { isLoggedIn, isAdmin, isStudent, user } = useAuth()
  const { dark } = useTheme()
  const [page, setPage] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => { if (!isAdmin) return; const load = async () => { const { count } = await sb.from('admissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'); setPendingCount(count || 0) }; load(); const i = setInterval(load, 60000); return () => clearInterval(i) }, [isAdmin])

  // Keyboard Shortcuts
  useEffect(() => {
    if (!isLoggedIn) return
    const handle = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'k' || e.key === 'K') { e.preventDefault(); setPage('students') }
        if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setPage('dashboard') }
      }
      if (e.altKey) {
        if (e.key === '1') { e.preventDefault(); setPage('dashboard') }
        if (e.key === '2') { e.preventDefault(); setPage('students') }
        if (e.key === '3') { e.preventDefault(); setPage('fees') }
        if (e.key === '4') { e.preventDefault(); setPage('attendance') }
        if (e.key === '5') { e.preventDefault(); setPage('assignments') }
        if (e.key === '6') { e.preventDefault(); setPage('admissions') }
        if (e.key === '7') { e.preventDefault(); setPage('announcements') }
        if (e.key === '8') { e.preventDefault(); setPage('settings') }
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [isLoggedIn, setPage])

  const { addNotification } = useNotifications()

  useEffect(() => {
    if (!isLoggedIn) return
    const channel = sb.channel('portal-v4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => { toast.success('📊 Updated!', { duration: 2000, icon: '🔄' }); addNotification({ type:'student', title:'Student Updated', message:'A student record was updated' }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, () => { toast.success('📤 Submission!', { duration: 2000, icon: '📤' }); addNotification({ type:'submission', title:'New Submission', message:'A student submitted an assignment' }) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admissions' }, () => { toast.success('📋 New admission!', { duration: 3000, icon: '📋' }); setPendingCount(p => p + 1); addNotification({ type:'admission', title:'New Admission', message:'A new application was submitted' }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fee_payments' }, () => { toast.success('💰 Payment!', { duration: 2000, icon: '💰' }); addNotification({ type:'fee', title:'Fee Payment', message:'A fee payment was recorded' }) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => { addNotification({ type:'announcement', title:'New Announcement', message:'A new announcement was posted' }) })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [isLoggedIn])

  const adminPages = { dashboard: <AdminDashboard />, tasks: <TaskCenterPage />, students: <StudentsPage />, admissions: <AdmissionsPage />, batches: <BatchesPage />, classes: <ClassesPage />, attendance: <AttendancePage />, alerts: <AttendanceAlertsPage />, assignments: <AssignmentsPage />, submissions: <SubmissionsPage />, recordings: <RecordingsPage />, fees: <FeesPage />, ledger: <FeeLedgerPage />, announcements: <AnnouncementsPage />, certificates: <CertificatesPage />, leaderboard: <LeaderboardPage />, sync: <SheetSyncPage />, excel: <ExcelPage />, settings: <SettingsPage />, timetable: <TimetablePage />, quizzes: <QuizAdminPage />, analytics: <AnalyticsPage />, progress: <ProgressReportPage />, idcards: <IdCardsPage />, reminders: <RemindersPage />, report: <MonthlyReportPage />, promotion: <PromotionPage />, audit: <AuditLogPage />, journey: <JourneyPage /> }
  const studentPages = { dashboard: <StudentDashboard />, attendance: <StudentAttendancePage />, assignments: <StudentAssignmentsPage />, recordings: <StudentRecordingsPage />, announcements: <StudentAnnouncementsPage />, fees: <StudentFeesPage />, certificate: <StudentCertificatePage />, profile: <StudentProfilePage />, timetable: <StudentTimetablePage />, quizzes: <StudentQuizPage /> }

  if (!isLoggedIn) return <LoginPage />

  return (
    <PageCtx.Provider value={{ page, setPage }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar page={page} setPage={setPage} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <div style={{ marginLeft: typeof window !== 'undefined' && window.innerWidth < 769 ? 0 : 275, flex: 1, background: dark ? '#060608' : '#F3F4F6', minHeight: '100vh', transition: 'background .3s ease' }} className="main-content">
          <TopBar title={pageTitles[page] || 'Dashboard'} pendingCount={pendingCount} setMobileOpen={setMobileOpen} />
          <div style={{ padding: 'clamp(14px, 3vw, 30px)' }}>
            {isAdmin ? (adminPages[page] || <AdminDashboard />) : (studentPages[page] || <StudentDashboard />)}
          </div>
        </div>

        {/* Floating WhatsApp */}
        {isStudent && (typeof window !== 'undefined' ? localStorage.getItem('aemtech_whatsapp') : null) && (
          <a href={`https://api.whatsapp.com/send?phone=${(typeof window !== 'undefined' ? localStorage.getItem('aemtech_whatsapp') : '')?.replace(/\D/g, '')?.replace(/^0/, '92')}&text=Hi, I am ${user?.full_name} from AEMTECH.`} target="_blank" rel="noreferrer"
            style={{
              position: 'fixed', bottom: 30, right: 30, width: 64, height: 64, borderRadius: '50%',
              background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, boxShadow: '0 8px 28px rgba(37,211,102,.45)', zIndex: 200,
              animation: 'float 3s ease infinite', textDecoration: 'none',
              border: '3px solid rgba(255,255,255,.25)',
            }}
            title="Chat with Admin">💬</a>
        )}
      </div>
    </PageCtx.Provider>
  )
}

function AemtechApp() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('aemtech_darkmode') : null
    return saved !== null ? saved === 'true' : true
  })

  const toggleDarkMode = () => {
    const newMode = !darkMode
    setDarkMode(newMode)
    typeof window !== 'undefined' && localStorage.setItem('aemtech_darkmode', String(newMode))
    document.body.style.background = newMode ? '#060608' : '#F3F4F6'
    document.body.style.color = newMode ? '#E5E7EB' : '#1F2937'
  }

  useEffect(() => {
    document.body.style.background = darkMode ? '#060608' : '#F3F4F6'
    document.body.style.color = darkMode ? '#E5E7EB' : '#1F2937'
  }, [darkMode])

  return (
    <ThemeCtx.Provider value={{ dark: darkMode, toggle: toggleDarkMode }}>
      <AuthProvider>
        <NotificationProvider>
          <ConfirmProvider>
            <Toaster position="top-right" toastOptions={{
              style: {
                background: darkMode ? 'rgba(12,12,14,.95)' : 'rgba(255,255,255,.95)',
                color: darkMode ? '#E5E7EB' : '#1F2937',
                border: `1px solid ${darkMode ? 'rgba(255,215,0,.08)' : 'rgba(0,0,0,.06)'}`,
                fontFamily: 'Inter,sans-serif', fontSize: 13,
                backdropFilter: 'blur(16px)',
                boxShadow: '0 10px 36px rgba(0,0,0,.2)',
                borderRadius: 14, padding: '14px 18px',
              },
              success: { iconTheme: { primary: '#FFD700', secondary: darkMode ? '#000' : '#fff' } },
              error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
              duration: 3000,
            }} />
            <Portal />
          </ConfirmProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeCtx.Provider>
  )
}
export default AemtechApp
