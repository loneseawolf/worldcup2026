import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BroadcastChannel, Match } from '../types'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { useSettings } from '../settings/SettingsContext'
import { fmtDateLong, fmtTime, displayTz } from '../utils/time'
import {
  detectMarketOrNull,
  flagEmoji,
  localizedNote,
  pad2,
  placeholderLabel,
  sortMatches,
  STAGE_LABEL_KEY,
} from '../utils/helpers'
import { buildMatchTimeline } from '../utils/matchTimeline'
import type { TimelineEvent } from '../utils/matchTimeline'
import Flag from '../components/Flag'
import Icon from '../components/Icon'
import './live.css'

const TYPE_KEY: Record<BroadcastChannel['type'], string> = {
  tv: 'typeTv',
  streaming: 'typeStreaming',
  'tv+streaming': 'typeTvStreaming',
}

// community-maintained free live-TV / sports stream index (unofficial, third-party)
const FMHY_URL = 'https://fmhy.net/video#live-tv'

/** ticking countdown to a future kickoff (updates every second) */
function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const diff = Date.parse(iso) - now
  if (!Number.isFinite(diff) || diff <= 0) return null
  const s = Math.floor(diff / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const str = d > 0 ? `${d}d ${h}h ${m}m` : `${pad2(h)}:${pad2(m)}:${pad2(sec)}`
  return <span className="live-countdown tnum">{str}</span>
}

/** unofficial free-live-streams CTA (folded in from the former Watch page) */
function FreeStreams() {
  const { t } = useI18n()
  return (
    <section className="card watch-panel watch-streams">
      <div className="section-title livetv-head">
        <Icon name="broadcast" />
        <h2>{t('liveTvStreamsHead')}</h2>
        <span className="chip livetv-tag">{t('liveTvUnofficial')}</span>
      </div>
      <p className="muted small">{t('liveTvStreamsBody')}</p>
      <a className="btn btn-primary livetv-cta" href={FMHY_URL} target="_blank" rel="noopener noreferrer">
        {t('liveTvStreamsLink')}
        <Icon name="external" size={16} />
      </a>
    </section>
  )
}

/** big header for the featured/secondary match: flags + names + score or kickoff */
function MatchHead({ m, secondary }: { m: Match; secondary?: boolean }) {
  const { t, pick, locale } = useI18n()
  const { teams, venues } = useAppData()
  const { settings } = useSettings()
  const venue = m.venueId ? (venues[m.venueId] ?? null) : null
  const tz = displayTz(settings, venue)
  const showScore = m.status === 'live' || m.status === 'finished'
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

  return (
    <div className={`card live-hero${m.status === 'live' ? ' live' : ''}`}>
      <div className="live-hero-top">
        <span className={m.stage === 'final' ? 'chip chip-accent' : 'chip'}>
          {t(STAGE_LABEL_KEY[m.stage])}
        </span>
        <span className="small muted">{t('matchN', { n: m.n })}</span>
        {m.status === 'live' && <span className="chip chip-live">{t('statusLive')}</span>}
        {m.status === 'finished' && <span className="chip">{t('statusFinished')}</span>}
        {m.status === 'postponed' && <span className="chip">{t('statusPostponed')}</span>}
      </div>

      <div className="live-hero-main">
        <Link to={m.home ? `/team/${m.home.code}` : '#'} className="live-side">
          <Flag team={m.home ? teams[m.home.code] : null} size={40} />
          <span className="live-side-name">{homeLabel}</span>
        </Link>

        <div className="live-score">
          {showScore && m.home && m.away ? (
            <>
              <div className="live-score-big tnum">
                {m.home.score ?? '–'} : {m.away.score ?? '–'}
              </div>
              {(m.home.pen ?? 0) + (m.away.pen ?? 0) > 0 && (
                <div className="small muted">
                  {t('pens')} {m.home.pen ?? 0}–{m.away.pen ?? 0}
                </div>
              )}
              {m.status === 'live' && m.time && <div className="live-minute tnum">{m.time}</div>}
            </>
          ) : (
            <>
              <div className="small muted">{t('liveKickoffIn')}</div>
              <Countdown iso={m.date} />
              <div className="small muted live-ko-time tnum">{fmtTime(m.date, locale, tz)}</div>
            </>
          )}
        </div>

        <Link to={m.away ? `/team/${m.away.code}` : '#'} className="live-side away">
          <Flag team={m.away ? teams[m.away.code] : null} size={40} />
          <span className="live-side-name">{awayLabel}</span>
        </Link>
      </div>

      <div className="live-hero-meta small muted">
        <span>{fmtDateLong(m.date, locale, tz)}</span>
        {venue && (
          <span>
            {' · '}
            {pick(venue.cityName, venue.city)}
          </span>
        )}
        {!secondary && (
          <Link className="live-detail-link" to={`/match/${m.id}`}>
            {t('officialPage')}
          </Link>
        )}
      </div>
    </div>
  )
}

/** chronological events ticker (newest-first) built from the match lineups */
function EventFeed({ m }: { m: Match }) {
  const { t } = useI18n()
  const { teams, lineups } = useAppData()
  const events = useMemo(
    () => buildMatchTimeline(m, lineups[m.id]).sort((a, b) => b.minNum - a.minNum),
    [m, lineups],
  )

  if (events.length === 0) {
    return <div className="empty live-noevents">{t('liveNoEvents')}</div>
  }

  const icon = (e: TimelineEvent) => {
    if (e.kind === 'goal') return '⚽'
    if (e.kind === 'card') return e.card === 'r' ? '🟥' : '🟨'
    return '↔'
  }
  const label = (e: TimelineEvent) => {
    if (e.kind === 'goal') return e.own ? t('liveOwnGoal') : e.pen ? t('livePen') : t('liveGoal')
    if (e.kind === 'card') return e.card === 'r' ? t('liveRed') : t('liveYellow')
    return t('liveSubOnOff')
  }

  return (
    <div className="card live-feed">
      {events.map((e) => (
        <div className={`live-ev live-ev-${e.kind}`} key={e.key}>
          <span className="live-ev-min tnum">{e.minute ?? ''}</span>
          <span className="live-ev-icon" aria-hidden="true">
            {icon(e)}
          </span>
          {e.code && teams[e.code] && <Flag team={teams[e.code]} size={18} />}
          <span className="live-ev-body">
            <span className="live-ev-label">{label(e)}</span>
            {e.kind === 'sub' ? (
              <span className="live-ev-players">
                <span className="live-ev-on">↑ {e.name}</span>
                {e.offName && <span className="live-ev-off">↓ {e.offName}</span>}
              </span>
            ) : (
              <span className="live-ev-players">{e.name}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Live() {
  const { t, countryName, pick } = useI18n()
  const { matches, broadcasters } = useAppData()
  const { settings, setMarket } = useSettings()

  const featured = useMemo(() => {
    const sorted = sortMatches(matches)
    const live = sorted.find((m) => m.status === 'live')
    const next = sorted.find((m) => m.status === 'scheduled')
    const recent = [...sorted].reverse().find((m) => m.status === 'finished')
    return { match: live ?? next ?? recent ?? null, recent: recent ?? null }
  }, [matches])

  // when the featured match is upcoming, also surface the most-recent result so
  // the page is never just a countdown
  const secondary =
    featured.match &&
    featured.match.status === 'scheduled' &&
    featured.recent &&
    featured.recent.id !== featured.match.id
      ? featured.recent
      : null

  // selected/detected broadcast market (folded in from the Watch page)
  const markets = useMemo(() => {
    const list = broadcasters?.markets ?? []
    return list.slice().sort((a, b) => a.iso2.localeCompare(b.iso2))
  }, [broadcasters])
  const codes = useMemo(() => new Set(markets.map((m) => m.iso2)), [markets])
  const sel = settings.market && codes.has(settings.market) ? settings.market : detectMarketOrNull(codes)
  const market = sel ? (markets.find((m) => m.iso2 === sel) ?? null) : null
  const channels = market ? market.channels.slice().sort((a, b) => Number(b.free) - Number(a.free)) : []

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
          <MatchHead m={featured.match} />
          <EventFeed m={featured.match} />
          <p className="muted small live-semilive">{t('semiLiveNote')}</p>

          {secondary && (
            <>
              <div className="section-title">
                <h2>{t('liveMostRecent')}</h2>
              </div>
              <MatchHead m={secondary} secondary />
              <EventFeed m={secondary} />
            </>
          )}
        </>
      )}

      {/* ---- where to watch (folded from Watch) ---- */}
      {markets.length > 0 && (
        <>
          <div className="section-title live-watch-head">
            <Icon name="tv" />
            <h2>{t('liveWhereToWatch')}</h2>
          </div>
          <section className="card watch-panel">
            <div className="watch-panel-head">
              <select
                className="watch-h2-select"
                value={market?.iso2 ?? ''}
                onChange={(e) => {
                  if (e.target.value) setMarket(e.target.value)
                }}
                aria-label={t('yourCountryHint')}
                title={t('yourCountryHint')}
              >
                {!market && <option value="">{t('none')}</option>}
                {markets.map((mk) => (
                  <option key={mk.iso2} value={mk.iso2}>
                    {flagEmoji(mk.iso2)}
                    {countryName(mk.iso2, mk.iso2)}
                  </option>
                ))}
              </select>
              <p className={market ? 'muted small watch-hint' : 'watch-hint watch-hint-strong'}>
                {t('yourCountryHint')}
              </p>
            </div>
            {market && (
              <div>
                {channels.map((c, i) => (
                  <div key={`${c.name}-${i}`} className="watch-ch">
                    <div className="watch-ch-line">
                      <strong className="watch-ch-name">{c.name}</strong>
                      <span className={c.free ? 'chip chip-free' : 'chip'}>
                        {c.free ? t('freeChannel') : t('paidChannel')}
                      </span>
                      <span className="chip">{t(TYPE_KEY[c.type])}</span>
                      {c.lang && <span className="chip watch-ch-lang">{c.lang.toUpperCase()}</span>}
                    </div>
                    {localizedNote(c.note, pick) && (
                      <div className="muted small watch-ch-note">{localizedNote(c.note, pick)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          <p className="muted small watch-disclaimer">{t('watchDisclaimer')}</p>
        </>
      )}

      <FreeStreams />
    </div>
  )
}
