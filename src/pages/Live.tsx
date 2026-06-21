import { useMemo } from 'react'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { sortMatches } from '../utils/helpers'
import GroupStandings from '../components/GroupStandings'
import Icon from '../components/Icon'
import MatchCard from '../components/MatchCard'
import MatchView from '../components/MatchView'
import './live.css'

export default function Live() {
  const { t } = useI18n()
  const { matches, standings } = useAppData()

  const featured = useMemo(() => {
    const sorted = sortMatches(matches)
    const live = sorted.find((m) => m.status === 'live')
    const next = sorted.find((m) => m.status === 'scheduled')
    const recent = [...sorted].reverse().find((m) => m.status === 'finished')
    return { match: live ?? next ?? recent ?? null, recent: recent ?? null }
  }, [matches])

  // group standings to surface under the match: the featured match's own group
  // if it's a group-stage tie, else the most-recent (then next) group-stage
  // match's group — gated on the group actually having standing rows
  const groupLetter = useMemo(() => {
    const fm = featured.match
    if (fm?.stage === 'group' && fm.group) return fm.group
    const groupMatches = sortMatches(matches).filter((x) => x.stage === 'group' && x.group)
    const recent = [...groupMatches].reverse().find((x) => x.status === 'finished')
    const next = groupMatches.find((x) => x.status === 'scheduled')
    return recent?.group ?? next?.group ?? groupMatches[0]?.group ?? null
  }, [featured.match, matches])
  const showStandings = groupLetter && (standings.groups[groupLetter]?.length ?? 0) > 0

  // when the featured match is upcoming, also surface the most-recent result so
  // the page is never just a pre-match view
  const secondary =
    featured.match &&
    featured.match.status === 'scheduled' &&
    featured.recent &&
    featured.recent.id !== featured.match.id
      ? featured.recent
      : null

  return (
    <div>
      <div className="page-head">
        <h1>{t('liveTitle')}</h1>
        <p>{t('liveSub')}</p>
      </div>

      {!featured.match ? (
        <div className="empty">
          <Icon name="broadcast" size={30} />
          <div>{t('liveNoMatch')}</div>
        </div>
      ) : (
        <>
          <MatchView m={featured.match} live />

          {secondary && (
            <>
              <div className="section-title">
                <h2>{t('liveMostRecent')}</h2>
              </div>
              <div className="cards-grid">
                <MatchCard match={secondary} />
              </div>
            </>
          )}

          {showStandings && groupLetter && (
            <>
              <div className="section-title">
                <h2>{t('liveGroupStandings', { x: groupLetter })}</h2>
              </div>
              <section className="card gp-card">
                <GroupStandings group={groupLetter} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
