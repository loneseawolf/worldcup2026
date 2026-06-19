import { useState } from 'react'
import { useI18n } from '../i18n'
import Icon from '../components/Icon'
import './faq.css'

// q/a key pairs, in display order — copy lives in i18n (English; auto-fallback)
const FAQS: [q: string, a: string][] = [
  ['faqQRatings', 'faqARatings'],
  ['faqQMatch', 'faqAMatch'],
  ['faqQForecast', 'faqAForecast'],
  ['faqQModes', 'faqAModes'],
  ['faqQTable', 'faqATable'],
  ['faqQRoad', 'faqARoad'],
  ['faqQPickems', 'faqAPickems'],
  ['faqQDisclaimer', 'faqADisclaimer'],
]

export default function FAQ() {
  const { t } = useI18n()
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="faq-page">
      <div className="page-head">
        <h1>{t('faqTitle')}</h1>
        <p>{t('faqSub')}</p>
      </div>

      <div className="faq-list">
        {FAQS.map(([q, a], i) => {
          const isOpen = open === i
          return (
            <section className={`card faq-item${isOpen ? ' open' : ''}`} key={q}>
              <button
                type="button"
                className="faq-q"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span>{t(q)}</span>
                <Icon name="chevron" size={18} className="faq-chevron" />
              </button>
              {isOpen && (
                <div className="faq-a">
                  {t(a)
                    .split('\n\n')
                    .map((para) => (
                      <p key={para.slice(0, 24)}>{para}</p>
                    ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
