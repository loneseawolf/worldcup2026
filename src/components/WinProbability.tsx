import { useState } from 'react'
import type { Match } from '../types'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import './match.css'

/** one home/draw/away split bar with a legend underneath */
function ProbBar({
  homeCode,
  awayCode,
  h,
  d,
  a,
  drawLabel,
}: {
  homeCode: string
  awayCode: string
  h: number
  d: number
  a: number
  drawLabel: string
}) {
  return (
    <>
      <div
        className="md-prob-bar"
        role="img"
        aria-label={`${homeCode} ${h}% · ${drawLabel} ${d}% · ${awayCode} ${a}%`}
      >
        <span className="md-prob-h" style={{ width: `${h}%` }} />
        <span className="md-prob-d" style={{ width: `${d}%` }} />
        <span className="md-prob-a" style={{ width: `${a}%` }} />
      </div>
      <div className="md-prob-legend small tnum">
        <span>
          {homeCode} {h}%
        </span>
        <span>
          {drawLabel} {d}%
        </span>
        <span>
          {awayCode} {a}%
        </span>
      </div>
    </>
  )
}

/**
 * Shared win-probability section: the Elo pre-match estimate (probs[matchId])
 * plus, when ESPN provides one, a live in-match win-prob row. Reused by the Live
 * page and the match detail page. `card` wraps it in a standalone card (Live);
 * inside the detail hero it renders inline (card=false).
 */
export default function WinProbability({ m, card }: { m: Match; card?: boolean }) {
  const { t } = useI18n()
  const { probs, matchStats } = useAppData()
  const [showProbPast, setShowProbPast] = useState(false)
  const p = probs[m.id]
  if (!m.home || !m.away || !p) return null
  const homeCode = m.home.code
  const awayCode = m.away.code
  const live = matchStats[m.id]?.live ?? null

  // finished matches hide the bar behind a reveal button (matches prior
  // behaviour); live matches show it by default so the live win-prob is visible
  const collapsed = m.status === 'finished' && !showProbPast
  const inner = (
    <>
      {m.status === 'finished' && (
        <button
          type="button"
          className="md-prob-show small"
          aria-expanded={showProbPast}
          onClick={() => setShowProbPast((v) => !v)}
        >
          {t(showProbPast ? 'probHide' : 'probShow')}
        </button>
      )}
      {!collapsed && (
        <div className={card ? 'md-prob card-pad' : 'md-prob'}>
          <div className="md-prob-head small">
            <span>{t('probTitle')}</span>
          </div>
          {live && (
            <div className="md-prob-row">
              <div className="md-prob-rowhead small">
                <span className="chip chip-live">{t('statusLive')}</span>
              </div>
              <ProbBar
                homeCode={homeCode}
                awayCode={awayCode}
                h={live.h}
                d={live.d}
                a={live.a}
                drawLabel={t('probDraw')}
              />
            </div>
          )}
          <div className="md-prob-row">
            {live && <div className="md-prob-rowhead small">{t('probPreMatch')}</div>}
            <ProbBar
              homeCode={homeCode}
              awayCode={awayCode}
              h={p.h}
              d={p.d}
              a={p.a}
              drawLabel={t('probDraw')}
            />
          </div>
          {p.eh != null ? (
            <table className="md-prob-path small tnum">
              <thead>
                <tr>
                  <td />
                  <th scope="col">{homeCode}</th>
                  <th scope="col">{awayCode}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{t('prob90')}</th>
                  <td>{p.h}%</td>
                  <td>{p.a}%</td>
                </tr>
                <tr>
                  <th scope="row">{t('probEt')}</th>
                  <td>+{p.eh}%</td>
                  <td>+{p.ea}%</td>
                </tr>
                <tr>
                  <th scope="row">{t('probPens')}</th>
                  <td>+{p.ph}%</td>
                  <td>+{p.pa}%</td>
                </tr>
                <tr className="md-prob-total">
                  <th scope="row">{t('probAdvance')}</th>
                  <td>{p.ah}%</td>
                  <td>{100 - (p.ah ?? 0)}%</td>
                </tr>
              </tbody>
            </table>
          ) : (
            p.ah != null && (
              <div className="md-prob-adv small muted">
                {t('probAdvance')}
                {t('colon')}
                {homeCode} {p.ah}% · {awayCode} {100 - (p.ah ?? 0)}%
              </div>
            )
          )}
          <p className="md-prob-note small muted">{t('probNote')}</p>
        </div>
      )}
    </>
  )

  return card ? <section className="card">{inner}</section> : inner
}
