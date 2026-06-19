import { useMemo } from 'react'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { sortMatches } from '../utils/helpers'
import MatchCard from './MatchCard'

/**
 * HERO bands at the top of the home page: the last 4 finished matches (most
 * recent first) AND the next 4 scheduled matches, each in its own band. Before
 * any result exists only Upcoming shows; after the final only Recent shows.
 * Reuses MatchCard, so live cards keep the hunter-green pulse.
 */
export default function HeroMatches() {
  const { t } = useI18n()
  const { matches } = useAppData()

  const { recent, upcoming } = useMemo(() => {
    const sorted = sortMatches(matches)
    return {
      recent: sorted
        .filter((m) => m.status === 'finished')
        .slice(-4)
        .reverse(),
      upcoming: sorted.filter((m) => m.status === 'scheduled').slice(0, 4),
    }
  }, [matches])

  if (!recent.length && !upcoming.length) return null

  return (
    <>
      {recent.length > 0 && (
        <section className="hero-matches" aria-label={t('heroRecent')}>
          <div className="hero-head">
            <h2 className="hero-title">{t('heroRecent')}</h2>
          </div>
          <div className="hero-grid">
            {recent.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section className="hero-matches" aria-label={t('heroUpcoming')}>
          <div className="hero-head">
            <h2 className="hero-title">{t('heroUpcoming')}</h2>
          </div>
          <div className="hero-grid">
            {upcoming.map((m) => (
              <MatchCard key={m.id} match={m} showWeather />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
