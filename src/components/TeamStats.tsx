import type { Match, TeamStatRow } from '../types'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import './match.css'

// our stat keys -> i18n label keys (fall back to the ESPN label when missing)
const LABEL_KEY: Record<string, string> = {
  possession: 'tsPossession',
  totalShots: 'tsShots',
  shotsOnTarget: 'tsShotsOnTarget',
  corners: 'tsCorners',
  fouls: 'tsFouls',
  accuratePasses: 'tsAccuratePasses',
  passPct: 'tsPassPct',
}

function fmt(v: number | null, pct?: boolean): string {
  if (v == null) return '–'
  const n = Math.round(v * 10) / 10
  return pct ? `${n}%` : String(n)
}

/** one mirrored comparison row: home value | label | away value, split bar below */
function Row({ r, label }: { r: TeamStatRow; label: string }) {
  const h = r.home ?? 0
  const a = r.away ?? 0
  const total = h + a
  const hPct = total > 0 ? (h / total) * 100 : 50
  const aPct = total > 0 ? (a / total) * 100 : 50
  return (
    <div className="ts-row">
      <div className="ts-head">
        <span className="ts-val home tnum">{fmt(r.home, r.pct)}</span>
        <span className="ts-label">{label}</span>
        <span className="ts-val away tnum">{fmt(r.away, r.pct)}</span>
      </div>
      <div className="ts-bar">
        <span className="ts-bar-h" style={{ width: `${hPct}%` }} />
        <span className="ts-bar-gap" />
        <span className="ts-bar-a" style={{ width: `${aPct}%` }} />
      </div>
    </div>
  )
}

/** ESPN team match-statistics, home-vs-away. Renders nothing when absent. */
export default function TeamStats({ m }: { m: Match }) {
  const { t } = useI18n()
  const { matchStats } = useAppData()
  const rows = matchStats[m.id]?.team
  if (!rows || rows.length === 0) return null
  return (
    <section className="card ts-card">
      {rows.map((r) => (
        <Row key={r.key} r={r} label={LABEL_KEY[r.key] ? t(LABEL_KEY[r.key]) : r.label} />
      ))}
      <p className="ts-derived small">{t('teamStatsSource')}</p>
    </section>
  )
}
