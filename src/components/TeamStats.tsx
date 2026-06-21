import type { Match, TeamStatRow } from '../types'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { useSettings } from '../settings/SettingsContext'
import { isDarkTheme, type TeamBarColors, teamBarColors } from '../utils/teamAccent'
import Flag from './Flag'
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

interface SideId {
  team: ReturnType<typeof useAppData>['teams'][string] | undefined
  code: string | null
}

/** one mirrored comparison row: home value | label | away value, split bar below */
function Row({
  r,
  label,
  home,
  away,
  bars,
}: {
  r: TeamStatRow
  label: string
  home: SideId
  away: SideId
  bars: TeamBarColors
}) {
  const h = r.home ?? 0
  const a = r.away ?? 0
  const total = h + a
  const hPct = total > 0 ? (h / total) * 100 : 50
  const aPct = total > 0 ? (a / total) * 100 : 50
  return (
    <div className="ts-row">
      <div className="ts-head">
        <span className="ts-val home">
          {home.team && <Flag team={home.team} size={16} />}
          {home.code && <span className="ts-code">{home.code}</span>}
          <span className="tnum">{fmt(r.home, r.pct)}</span>
        </span>
        <span className="ts-label">{label}</span>
        <span className="ts-val away">
          <span className="tnum">{fmt(r.away, r.pct)}</span>
          {away.code && <span className="ts-code">{away.code}</span>}
          {away.team && <Flag team={away.team} size={16} />}
        </span>
      </div>
      <div className="ts-bar">
        <span
          className="ts-bar-h"
          style={{ width: `${hPct}%`, ...(bars.home ? { background: bars.home } : null) }}
        />
        <span className="ts-bar-gap" />
        <span
          className="ts-bar-a"
          style={{ width: `${aPct}%`, ...(bars.away ? { background: bars.away } : null) }}
        />
      </div>
    </div>
  )
}

/** ESPN team match-statistics, home-vs-away. Renders nothing when absent. */
export default function TeamStats({ m }: { m: Match }) {
  const { t } = useI18n()
  const { matchStats, teams } = useAppData()
  const { settings } = useSettings()
  const rows = matchStats[m.id]?.team
  if (!rows || rows.length === 0) return null

  const home: SideId = { team: m.home ? teams[m.home.code] : undefined, code: m.home?.code ?? null }
  const away: SideId = { team: m.away ? teams[m.away.code] : undefined, code: m.away?.code ?? null }
  // per-team bar fills (contrast-guarded; distinctness-guarded so the two sides
  // never read as the same color) — null sides keep the CSS default colors
  const bars = teamBarColors(home.team?.colors, away.team?.colors, isDarkTheme(settings.theme))

  return (
    <section className="card ts-card">
      {rows.map((r) => (
        <Row
          key={r.key}
          r={r}
          label={LABEL_KEY[r.key] ? t(LABEL_KEY[r.key]) : r.label}
          home={home}
          away={away}
          bars={bars}
        />
      ))}
      <p className="ts-derived small">{t('teamStatsSource')}</p>
    </section>
  )
}
