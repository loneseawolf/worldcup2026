import { Fragment, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import type { Match } from '../types'
import { useI18n } from '../i18n'
import { useSettings } from '../settings/SettingsContext'
import { useAppData } from '../data/DataContext'
import { displayTz, dayKey, fmtDateLong, relativeDay } from '../utils/time'
import { involvesTeams, sortMatches, STAGE_LABEL_KEY } from '../utils/helpers'
import MatchCard from '../components/MatchCard'
import HeroMatches from '../components/HeroMatches'
import Flag from '../components/Flag'
import Trophy from '../components/Trophy'
import Icon from '../components/Icon'
import './matches.css'

/** stage filter values: real stages + 'ko' = all knockout rounds */
const STAGE_FILTERS = ['group', 'ko', 'r32', 'r16', 'qf', 'sf', 'third', 'final'] as const
type StageFilter = (typeof STAGE_FILTERS)[number]

export default function Matches() {
  const { t, pick, locale } = useI18n()
  const { settings } = useSettings()
  const { matches, teams, venues, meta } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  // remember the filter bar across visits: a shared/typed URL always wins, but
  // arriving with no params restores the last-used selection. Keyed on
  // location.key (not just mount) so navigating away and back — or clicking the
  // Matches nav link while already here — restores instead of wiping the saved
  // filters; the user's own in-page filter changes are never overridden.
  const selfChange = useRef(false)
  const restoredFor = useRef<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: must run once per navigation (location.key), not on every searchParams change
  useEffect(() => {
    if (restoredFor.current === location.key) return
    restoredFor.current = location.key
    if (selfChange.current) {
      // this navigation came from our own filter controls: nothing to restore
      selfChange.current = false
      return
    }
    if ([...searchParams.keys()].length > 0) return
    try {
      const saved = localStorage.getItem('wc2026-matches-filters')
      if (saved) {
        setSearchParams(new URLSearchParams(saved), { replace: true })
      }
    } catch {
      /* blocked storage */
    }
  }, [location.key])
  useEffect(() => {
    if (restoredFor.current === null) return
    try {
      localStorage.setItem('wc2026-matches-filters', searchParams.toString())
    } catch {
      /* best-effort */
    }
  }, [searchParams])

  // ---- filters from URL (shareable links), validated against data ----
  const rawStage = searchParams.get('stage') ?? ''
  const stage: StageFilter | '' = (STAGE_FILTERS as readonly string[]).includes(rawStage)
    ? (rawStage as StageFilter)
    : ''
  const rawVenue = searchParams.get('venue') ?? ''
  const venueId = rawVenue && venues[rawVenue] ? rawVenue : ''
  const teamsParam = searchParams.get('teams') ?? ''

  const teamCodes = useMemo(() => {
    const out: string[] = []
    for (const raw of teamsParam.split(',')) {
      const c = raw.trim().toUpperCase()
      if (c && teams[c] && !out.includes(c)) out.push(c)
    }
    return out
  }, [teamsParam, teams])

  const anyFilter = stage !== '' || venueId !== '' || teamCodes.length > 0

  // mobile: collapsible filter panel; start open when arriving with filters in the URL
  // title-odds strip: deliberately dismissible (remembered); a tiny trophy
  // chip stays behind to bring it back
  const [oddsHidden, setOddsHiddenState] = useState(() => {
    try {
      return localStorage.getItem('wc2026-odds-hidden') === '1'
    } catch {
      return false
    }
  })
  const setOddsHidden = (v: boolean) => {
    setOddsHiddenState(v)
    try {
      localStorage.setItem('wc2026-odds-hidden', v ? '1' : '0')
    } catch {
      /* blocked storage */
    }
  }

  // schedule view: a window around "now" by default; the user can reveal the
  // full list or collapse it entirely (remembered across visits)
  const [scheduleMode, setScheduleModeState] = useState<'window' | 'full' | 'hidden'>(() => {
    try {
      const s = localStorage.getItem('wc2026-schedule-mode')
      if (s === 'full' || s === 'hidden' || s === 'window') return s
    } catch {
      /* blocked storage */
    }
    return 'window'
  })
  const setScheduleMode = (v: 'window' | 'full' | 'hidden') => {
    setScheduleModeState(v)
    try {
      localStorage.setItem('wc2026-schedule-mode', v)
    } catch {
      /* blocked storage */
    }
  }

  // filters panel: remembered across visits; first visit defaults to open on
  // wide screens, and to open-when-filters-active on narrow ones
  const [open, setOpenState] = useState(() => {
    try {
      const saved = localStorage.getItem('wc2026-filters-open')
      if (saved !== null) return saved === '1'
    } catch {
      /* blocked storage */
    }
    return window.matchMedia('(min-width: 760px)').matches || anyFilter
  })
  const setOpen = (fn: (o: boolean) => boolean) =>
    setOpenState((o) => {
      const v = fn(o)
      try {
        localStorage.setItem('wc2026-filters-open', v ? '1' : '0')
      } catch {
        /* blocked storage */
      }
      return v
    })

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    selfChange.current = true
    setSearchParams(next, { replace: true })
  }
  const toggleTeam = (code: string) => {
    const next = teamCodes.includes(code) ? teamCodes.filter((c) => c !== code) : [...teamCodes, code]
    setParam('teams', next.join(','))
  }
  const clearAll = () => {
    selfChange.current = true
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  // ---- option lists ----
  const allCodes = useMemo(() => Object.keys(teams).sort(), [teams])
  const venueList = useMemo(
    () =>
      Object.values(venues)
        .slice()
        .sort((a, b) => a.realName.localeCompare(b.realName)),
    [venues],
  )
  const favs = useMemo(() => settings.favorites.filter((c) => Boolean(teams[c])), [settings.favorites, teams])
  const favsActive =
    favs.length > 0 && teamCodes.length === favs.length && favs.every((c) => teamCodes.includes(c))

  // ---- filtering + grouping by calendar day in the display timezone ----
  const filtered = useMemo(() => {
    let list = sortMatches(matches)
    if (stage === 'ko') list = list.filter((m) => m.stage !== 'group')
    else if (stage !== '') list = list.filter((m) => m.stage === stage)
    if (venueId) list = list.filter((m) => m.venueId === venueId)
    if (teamCodes.length) list = list.filter((m) => involvesTeams(m, teamCodes))
    return list
  }, [matches, stage, venueId, teamCodes])

  const days = useMemo(() => {
    const map = new Map<string, Match[]>()
    for (const m of filtered) {
      const venue = m.venueId ? venues[m.venueId] : null
      const k = dayKey(m.date, displayTz(settings, venue))
      const arr = map.get(k)
      if (arr) arr.push(m)
      else map.set(k, [m])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered, venues, settings])

  // jump targets: opener / now / first knockout day / the final. "now" is the
  // last finished match in on-page (display) order, so the freshest result sits
  // on top, right before the first live match. match numbers are not in time
  // order, so we scan the rendered order (days asc, then sortMatches) and not
  // ids. before kickoff fall back to the first upcoming day, then the opener.
  const jumps = useMemo(() => {
    const todayK = dayKey(new Date().toISOString(), displayTz(settings, null))
    let nowMatchId: string | undefined
    for (const [, ms] of days) for (const m of ms) if (m.status === 'finished') nowMatchId = m.id
    return {
      opener: days[0]?.[0],
      nowMatchId,
      nowFallbackDay: days.find(([k]) => k >= todayK)?.[0] ?? days[0]?.[0],
      ko: days.find(([, ms]) => ms.some((m) => m.stage !== 'group'))?.[0],
      final: days.find(([, ms]) => ms.some((m) => m.stage === 'final'))?.[0] ?? days[days.length - 1]?.[0],
    }
  }, [days, settings])

  // default view: a window around "now" — yesterday → next ~3 days (or the first
  // ~5 upcoming days pre-tournament). The user can expand to the full schedule.
  const windowDays = useMemo(() => {
    if (!days.length) return days
    if (!jumps.nowMatchId) {
      const fi = Math.max(
        0,
        days.findIndex(([k]) => k === jumps.nowFallbackDay),
      )
      return days.slice(fi, fi + 5)
    }
    const nowIdx = days.findIndex(([, ms]) => ms.some((m) => m.id === jumps.nowMatchId))
    const i = nowIdx < 0 ? 0 : nowIdx
    return days.slice(Math.max(0, i - 1), i + 4)
  }, [days, jumps])

  // a filter is an explicit search → always show every matching day. Otherwise
  // honor the schedule mode.
  const visibleDays =
    scheduleMode === 'hidden' ? [] : scheduleMode === 'full' || anyFilter ? days : windowDays
  const hiddenCount = days.length - windowDays.length

  const scrollToDay = (k: string | undefined, behavior: ScrollBehavior = 'smooth') => {
    if (k) document.getElementById(`mxp-day-${k}`)?.scrollIntoView({ block: 'start', behavior })
  }

  // jump shortcuts must mount the target day first: switch to the full schedule,
  // then scroll once React has committed the now-visible days
  const jumpToDay = (k: string | undefined) => {
    setScheduleMode('full')
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToDay(k)))
  }
  const jumpNow = () => {
    setScheduleMode('full')
    requestAnimationFrame(() => requestAnimationFrame(() => goNow()))
  }

  // scroll a single match card clear of the sticky header + filter block + the
  // sticky day header that pins above it (scrollIntoView can't see those)
  const scrollToMatch = (id: string | undefined, behavior: ScrollBehavior = 'smooth') => {
    if (!id) return
    const el = document.getElementById(`mxp-match-${id}`)
    if (!el) return
    const head = el.closest('.mxp-day')?.querySelector<HTMLElement>('.day-head')
    const hdr =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')) || 58
    const offset =
      hdr +
      (oddsRef.current?.offsetHeight ?? 0) +
      (stickyRef.current?.offsetHeight ?? 0) +
      (head?.offsetHeight ?? 0) +
      4
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior })
  }

  const goNow = (behavior: ScrollBehavior = 'smooth') => {
    if (jumps.nowMatchId) scrollToMatch(jumps.nowMatchId, behavior)
    else scrollToDay(jumps.nowFallbackDay, behavior)
  }

  // default position: "now" (instant, one-shot once the list is rendered)
  const jumpedRef = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot initial scroll keyed on the rendered day list only
  useEffect(() => {
    if (jumpedRef.current || days.length === 0) return
    jumpedRef.current = true
    const firstId = days[0]?.[1]?.[0]?.id
    // skip if "now" is already the very first card / day at the top
    const atTop = jumps.nowMatchId ? jumps.nowMatchId === firstId : jumps.nowFallbackDay === days[0]?.[0]
    if (!atTop) requestAnimationFrame(() => goNow('auto'))
  }, [days])

  // everything above the list is sticky; expose its height so day headers can
  // stack right below it and anchored scrolling lands clear of it
  const stickyRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = stickyRef.current
    if (!el) return
    const set = () => el.parentElement?.style.setProperty('--mxp-sticky-h', `${el.offsetHeight}px`)
    set() // before the initial-position scroll reads the scroll margins
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // the floating odds banner pins under the nav; expose its height so the filter
  // block + day headers stack right below it (mirror of --mxp-sticky-h)
  const oddsRef = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach when the odds banner mounts (titleOdds becomes available)
  useLayoutEffect(() => {
    const el = oddsRef.current
    if (!el) return
    const set = () => el.parentElement?.style.setProperty('--mxp-odds-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [meta.titleOdds])

  const teamChip = (code: string) => {
    const team = teams[code]
    const on = teamCodes.includes(code)
    return (
      <button
        key={code}
        type="button"
        className={`mxp-tchip${on ? ' on' : ''}`}
        title={pick(team.name, code)}
        aria-pressed={on}
        onClick={() => toggleTeam(code)}
      >
        <Flag team={team} size={18} />
        {code}
      </button>
    )
  }

  const titleOdds = meta.titleOdds

  return (
    <div className="mxp">
      {titleOdds && titleOdds.length > 0 && (
        <div className={`mxp-odds-wrap${oddsHidden ? '' : ' open'}`} ref={oddsRef}>
          <Link to="/forecast" className="mxp-odds" tabIndex={oddsHidden ? -1 : 0}>
            {titleOdds[0].p >= 100 ? (
              <div className="mxp-odds-decided">
                <span className="mxp-odds-label">
                  <Trophy size={18} /> {t('champion')}
                </span>
                <span className="mxp-odds-champ">
                  <Flag team={teams[titleOdds[0].c]} size={28} />
                  {pick(teams[titleOdds[0].c]?.name, titleOdds[0].c)}
                </span>
              </div>
            ) : (
              <>
                <span className="mxp-odds-label">
                  <Trophy size={18} /> {t('titleOdds')}
                </span>
                <ol className="mxp-odds-board tnum">
                  {titleOdds.slice(0, 5).map((o) => (
                    <li key={o.c} className="mxp-odds-row">
                      <Flag team={teams[o.c]} size={20} />
                      <span className="mxp-odds-name">{pick(teams[o.c]?.name, o.c)}</span>
                      <span className="mxp-odds-bar">
                        <span
                          className="mxp-odds-fill"
                          style={{ width: `${(o.p / titleOdds[0].p) * 100}%` }}
                        />
                      </span>
                      <span className="mxp-odds-pct">{o.p}%</span>
                    </li>
                  ))}
                </ol>
                <span className="mxp-odds-cta">{t('runForecast')} →</span>
              </>
            )}
            <button
              type="button"
              className="mxp-odds-close"
              aria-label={t('probHide')}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setOddsHidden(true)
              }}
            >
              ×
            </button>
          </Link>
        </div>
      )}
      <HeroMatches />
      <Link to="/pickems" className="mxp-cta">
        <Icon name="pencil" size={22} className="mxp-cta-icon" />
        <span className="mxp-cta-text">
          <span className="mxp-cta-title">{t('pickemTitle')}</span>
          <span className="mxp-cta-sub">{t('pickemCtaSub')}</span>
        </span>
        <span className="mxp-cta-arrow">→</span>
      </Link>
      <div className="mxp-sticky" ref={stickyRef}>
        <div className="page-head mxp-head">
          <h1>{t('navMatches')}</h1>
          <span className="mxp-head-right">
            {titleOdds && titleOdds.length > 0 && (
              <button
                type="button"
                className={`mxp-odds-restore${oddsHidden ? ' on' : ''}`}
                title={t('titleOdds')}
                aria-label={t('titleOdds')}
                tabIndex={oddsHidden ? 0 : -1}
                aria-hidden={!oddsHidden}
                onClick={() => setOddsHidden(false)}
              >
                <Trophy size={16} />
              </button>
            )}
            <span className="muted small tnum">{t('matchesShown', { n: filtered.length })}</span>
          </span>
        </div>

        <div className="mxp-bar">
          {/* mobile-only toggle row */}
          <div className="mxp-toggle-row">
            <button
              type="button"
              className={`btn${open ? ' on' : ''}`}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {`${t('filters')}${t('colon')}${stage ? t('filterStageSel') : t('filterStage')} · ${
                venueId ? t('filterVenueSel') : t('filterVenue')
              } · ${teamCodes.length > 0 ? t('filterTeamsSel', { n: teamCodes.length }) : t('filterTeams')}`}
            </button>
            {anyFilter && (
              <button type="button" className="btn" onClick={clearAll}>
                {t('clearFilters')}
              </button>
            )}
          </div>

          <div className={`mxp-panel${open ? ' open' : ''}`}>
            <div className="mxp-panel-in">
              <div className="mxp-teams-row">
                <div className="mxp-quick">
                  <button
                    type="button"
                    className={`mxp-tchip${teamCodes.length === 0 ? ' on' : ''}`}
                    onClick={() => setParam('teams', '')}
                  >
                    {t('allTeams')}
                  </button>
                  {favs.length > 0 && (
                    <button
                      type="button"
                      className={`mxp-tchip${favsActive ? ' on' : ''}`}
                      onClick={() => setParam('teams', favs.join(','))}
                    >
                      <Icon name="star" size={14} />
                      {t('favoritesOnly')}
                    </button>
                  )}
                  <span className="mxp-quick-selects">
                    <select
                      className="input mxp-select"
                      value={stage}
                      aria-label={t('filterStage')}
                      onChange={(e) => setParam('stage', e.target.value)}
                    >
                      <option value="">{t('allStages')}</option>
                      {STAGE_FILTERS.map((s) => (
                        <option key={s} value={s}>
                          {s === 'ko' ? t('filterKnockout') : t(STAGE_LABEL_KEY[s])}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input mxp-select"
                      value={venueId}
                      aria-label={t('filterVenue')}
                      onChange={(e) => setParam('venue', e.target.value)}
                    >
                      <option value="">{t('allVenues')}</option>
                      {venueList.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.realName} · {pick(v.cityName, v.city)}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
                <div className="mxp-teams">{allCodes.map(teamChip)}</div>
              </div>
            </div>
          </div>

          <div className="mxp-jump">
            <button type="button" className="mxp-jump-btn" onClick={() => jumpToDay(jumps.opener)}>
              {t('jumpOpener')}
            </button>
            <button type="button" className="mxp-jump-btn" onClick={jumpNow}>
              {t('jumpNow')}
            </button>
            {jumps.ko && (
              <button type="button" className="mxp-jump-btn" onClick={() => jumpToDay(jumps.ko)}>
                {t('filterKnockout')}
              </button>
            )}
            <button type="button" className="mxp-jump-btn" onClick={() => jumpToDay(jumps.final)}>
              {t('stageFinal')}
            </button>

            {!anyFilter && days.length > 0 && (
              <span className="mxp-sched">
                {scheduleMode === 'hidden' ? (
                  <button type="button" className="mxp-jump-btn" onClick={() => setScheduleMode('window')}>
                    {t('schedShow')}
                  </button>
                ) : (
                  <>
                    {scheduleMode === 'full' ? (
                      <button
                        type="button"
                        className="mxp-jump-btn"
                        onClick={() => setScheduleMode('window')}
                      >
                        {t('schedShowLess')}
                      </button>
                    ) : (
                      hiddenCount > 0 && (
                        <button
                          type="button"
                          className="mxp-jump-btn"
                          onClick={() => setScheduleMode('full')}
                        >
                          {t('schedShowFull')}
                          <span className="mxp-sched-hint">{t('schedMoreDays', { n: hiddenCount })}</span>
                        </button>
                      )
                    )}
                    <button type="button" className="mxp-jump-btn" onClick={() => setScheduleMode('hidden')}>
                      {t('schedHideAll')}
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {days.length === 0 ? (
        <div className="empty">
          <p>{t('noMatchesFound')}</p>
          <button type="button" className="btn" onClick={clearAll}>
            {t('clearFilters')}
          </button>
        </div>
      ) : (
        visibleDays.map(([k, ms]) => {
          const first = ms[0]
          const tz0 = displayTz(settings, first.venueId ? venues[first.venueId] : null)
          const rel = relativeDay(first.date, tz0)
          return (
            <Fragment key={k}>
              <section className="mxp-day" id={`mxp-day-${k}`}>
                <div className="day-head">
                  <span>{fmtDateLong(first.date, locale, tz0)}</span>
                  {rel !== null && (
                    <span className="chip rel">
                      {t(rel === 0 ? 'today' : rel === 1 ? 'tomorrow' : 'yesterday')}
                    </span>
                  )}
                </div>
                <div className="cards-grid three">
                  {ms.map((m) => (
                    <MatchCard key={m.id} match={m} hideDate showWeather domId={`mxp-match-${m.id}`} />
                  ))}
                </div>
              </section>
            </Fragment>
          )
        })
      )}
    </div>
  )
}
