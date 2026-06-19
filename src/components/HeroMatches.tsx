import { useMemo } from 'react'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { sortMatches } from '../utils/helpers'
import MatchCard from './MatchCard'

/**
 * HERO band at the top of the home page: the last 4 finished matches (most
 * recent first), or — before any result exists — the next 4 scheduled matches.
 * Reuses MatchCard, so live cards keep the hunter-green pulse.
 */
export default function HeroMatches() {
  const { t } = useI18n()
  const { matches } = useAppData()

  const { featured, results } = useMemo(() => {
    const sorted = sortMatches(matches)
    const finished = sorted.filter((m) => m.status === 'finished')
    if (finished.length) return { featured: finished.slice(-4).reverse(), results: true }
    return { featured: sorted.filter((m) => m.status === 'scheduled').slice(0, 4), results: false }
  }, [matches])

  if (!featured.length) return null

  return (
    <section className="hero-matches" aria-label={t(results ? 'heroRecent' : 'heroUpcoming')}>
      <div className="hero-head">
        <h2 className="hero-title">{t(results ? 'heroRecent' : 'heroUpcoming')}</h2>
      </div>
      <div className="hero-grid">
        {featured.map((m) => (
          <MatchCard key={m.id} match={m} showWeather={!results} />
        ))}
      </div>
    </section>
  )
}
