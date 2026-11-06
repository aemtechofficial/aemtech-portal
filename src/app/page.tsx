"use client";
import dynamic from 'next/dynamic'

function Splash() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(900px 500px at 50% -10%, rgba(255,215,0,.07), transparent 60%), #060608',
      fontFamily: "'Inter',sans-serif", padding: 24, textAlign: 'center',
    }}>
      <div style={{ animation: 'splashPulse 2.2s ease-in-out infinite' }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(38px,7vw,58px)', fontWeight: 800, letterSpacing: 4, lineHeight: 1, color: '#fff' }}>
          AEM<span style={{ color: '#FFD700', animation: 'goldGlow 2.2s ease-in-out infinite' }}>T</span>ECH
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,215,0,.55)', letterSpacing: 5, textTransform: 'uppercase', marginTop: 12, fontWeight: 700 }}>
          Design the Future
        </div>
      </div>
      <div style={{ width: 190, height: 3, borderRadius: 99, background: 'rgba(255,215,0,.12)', overflow: 'hidden', marginTop: 38 }}>
        <div style={{ width: '38%', height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#FFE873,#FFD700,#FFA500)', animation: 'splashBar 1.15s ease-in-out infinite' }} />
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: '#6B7280', letterSpacing: 2.5, textTransform: 'uppercase', fontWeight: 600 }}>
        Loading your portal
      </div>
    </div>
  )
}

const Portal = dynamic(() => import('./Portal'), { ssr: false, loading: () => <Splash /> })

export default function HomePage() {
  return <Portal />
}
