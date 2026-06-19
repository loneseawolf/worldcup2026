import { useMemo } from 'react'
import type { BroadcastChannel } from '../types'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { localizedNote } from '../utils/helpers'
import Flag from '../components/Flag'
import Icon from '../components/Icon'
import './watch.css'
import './livetv.css'

const TYPE_KEY: Record<BroadcastChannel['type'], string> = {
  tv: 'typeTv',
  streaming: 'typeStreaming',
  'tv+streaming': 'typeTvStreaming',
}

// community-maintained free live-TV / sports stream index (unofficial, third-party)
const FMHY_URL = 'https://fmhy.net/video#live-tv'

/** Personal "Live TV" page: third-party live-stream index + Philippine broadcasters. */
export default function LiveTv() {
  const { t, pick } = useI18n()
  const { broadcasters } = useAppData()

  const ph = useMemo(() => broadcasters?.markets.find((m) => m.iso2 === 'PH') ?? null, [broadcasters])
  // free channels first, mirroring the Watch page ordering
  const channels = ph ? ph.channels.slice().sort((a, b) => Number(b.free) - Number(a.free)) : []

  return (
    <div>
      <div className="page-head">
        <h1>{t('liveTvTitle')}</h1>
        <p>{t('liveTvSub')}</p>
      </div>

      <section className="card livetv-panel">
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

      <div className="section-title livetv-head">
        <Flag iso2="PH" size={24} />
        <h2>{t('liveTvPhHead')}</h2>
      </div>
      {channels.length ? (
        <section className="card watch-panel">
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
        </section>
      ) : (
        <div className="empty">
          <Icon name="tv" size={30} />
          <div>{t('liveTvNonePh')}</div>
        </div>
      )}

      <p className="muted small watch-disclaimer">{t('liveTvDisclaimer')}</p>
    </div>
  )
}
