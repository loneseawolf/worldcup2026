import { useMemo } from 'react'
import type { Match } from '../types'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { buildMatchTimeline } from '../utils/matchTimeline'
import type { TimelineEvent } from '../utils/matchTimeline'
import Flag from './Flag'
import './match.css'

/** pick an emoji for an ESPN commentary item from its type/text */
function commentaryIcon(type: string | null | undefined, text: string): string {
  const s = `${type ?? ''} ${text}`.toLowerCase()
  if (s.includes('goal') && !s.includes('no goal')) return '⚽'
  if (s.includes('red card')) return '🟥'
  if (s.includes('yellow') || s.includes('booking')) return '🟨'
  if (s.includes('substitut')) return '↔'
  if (s.includes('penalty')) return '🥅'
  if (s.includes('corner')) return '🚩'
  if (s.includes('half') || s.includes('whistle') || s.includes('kick-off')) return '⏱'
  return '•'
}

function timelineIcon(e: TimelineEvent): string {
  if (e.kind === 'goal') return '⚽'
  if (e.kind === 'card') return e.card === 'r' ? '🟥' : '🟨'
  return '↔'
}

/**
 * Live commentary feed, shown near the top of the match view. Renders ESPN
 * commentary when available; otherwise falls back to the key-events timeline
 * built from FIFA lineup data, so the section is never empty for a live match.
 */
export default function Commentary({ m }: { m: Match }) {
  const { t } = useI18n()
  const { commentary, lineups, teams } = useAppData()
  const items = commentary[m.id]

  const fallback = useMemo(
    () => buildMatchTimeline(m, lineups[m.id]).sort((a, b) => b.minNum - a.minNum),
    [m, lineups],
  )

  if (items && items.length > 0) {
    const sorted = items.slice().sort((a, b) => b.minNum - a.minNum)
    return (
      <div className="card mc-feed">
        {sorted.map((c, i) => (
          <div className="mc-row" key={`${c.minNum}-${i}`}>
            <span className="mc-min tnum">{c.minute ?? ''}</span>
            <span className="mc-icon" aria-hidden="true">
              {commentaryIcon(c.type, c.text)}
            </span>
            <span className="mc-text">
              {c.type && <span className="mc-type">{c.type}</span>}
              {c.text}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // graceful fallback: the key-events timeline (goals / cards / subs)
  if (fallback.length === 0) {
    return <div className="empty">{t('liveNoEvents')}</div>
  }
  const label = (e: TimelineEvent) => {
    if (e.kind === 'goal') return e.own ? t('liveOwnGoal') : e.pen ? t('livePen') : t('liveGoal')
    if (e.kind === 'card') return e.card === 'r' ? t('liveRed') : t('liveYellow')
    return t('liveSubOnOff')
  }
  return (
    <div className="card mc-feed">
      <p className="mc-derived small">{t('commentaryFallback')}</p>
      {fallback.map((e) => (
        <div className="mc-row" key={e.key}>
          <span className="mc-min tnum">{e.minute ?? ''}</span>
          <span className="mc-icon" aria-hidden="true">
            {timelineIcon(e)}
          </span>
          <span className="mc-text">
            <span className="mc-type">{label(e)}</span>
            {e.code && teams[e.code] && <Flag team={teams[e.code]} size={16} />} {e.name}
            {e.kind === 'sub' && e.offName ? ` ↓ ${e.offName}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
