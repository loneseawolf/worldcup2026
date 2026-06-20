import { useMemo } from 'react'
import type { Match } from '../types'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { flagSrc, placeholderLabel } from '../utils/helpers'
import { pitchAnnotations } from '../utils/pitchAnnotations'
import Pitch from './Pitch'

/**
 * Self-contained pitch for the Live page: resolves lineups, names, flags,
 * per-player annotations and ESPN-derived ratings for a match, then renders the
 * shared <Pitch>. Returns null when no lineup data exists.
 */
export default function MatchPitch({ m }: { m: Match }) {
  const { t, pick } = useI18n()
  const { teams, lineups, matchStats } = useAppData()
  const lu = lineups[m.id]

  const ratings = useMemo(() => {
    const players = matchStats[m.id]?.players
    if (!players) return undefined
    const out: Record<string, number> = {}
    for (const [pid, ps] of Object.entries(players)) if (ps.rating != null) out[pid] = ps.rating
    return Object.keys(out).length ? out : undefined
  }, [matchStats, m.id])

  const anno = useMemo(() => pitchAnnotations(lu), [lu])

  if (!lu || (!lu.home && !lu.away)) return null

  const homeLabel = m.home
    ? pick(teams[m.home.code]?.name, m.home.code)
    : m.phA
      ? placeholderLabel(m.phA, t)
      : t('tbd')
  const awayLabel = m.away
    ? pick(teams[m.away.code]?.name, m.away.code)
    : m.phB
      ? placeholderLabel(m.phB, t)
      : t('tbd')
  const homeIso2 = m.home ? teams[m.home.code]?.iso2 : null
  const awayIso2 = m.away ? teams[m.away.code]?.iso2 : null

  return (
    <div className="card md-pitch-card">
      <Pitch
        home={lu.home}
        away={lu.away}
        homeName={homeLabel}
        awayName={awayLabel}
        homeCode={m.home?.code}
        awayCode={m.away?.code}
        homeFlag={homeIso2 ? flagSrc(homeIso2) : undefined}
        awayFlag={awayIso2 ? flagSrc(awayIso2) : undefined}
        marks={anno.marks}
        subOff={anno.subOff}
        goals={anno.goals}
        ratings={ratings}
      />
      {ratings && <p className="ts-derived small">{t('ratingsNote')}</p>}
    </div>
  )
}
