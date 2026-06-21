import { useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import MatchView from '../components/MatchView'

export default function MatchDetail() {
  const { id } = useParams()
  const { t } = useI18n()
  const { matches } = useAppData()

  const m = matches.find((x) => x.id === id)
  if (!m) {
    return (
      <div className="card">
        <div className="empty">
          <p>{t('matchNotFound')}</p>
        </div>
      </div>
    )
  }

  return <MatchView m={m} />
}
