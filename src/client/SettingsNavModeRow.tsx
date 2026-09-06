/**
 * Settings → General row: WHICH turn-navigation rail to show.
 *
 * Registered into `settings.general.item` (root scope) by the plugin's apply;
 * the General section renders each contribution as one row, so this component
 * draws its own title, description, and a three-way selector:
 *
 *   DSH official | Smoothly TN (Smoothly Turn Nav) | Hide all
 *
 * The choice is persisted browser-locally (see mode.ts) and drives both the
 * rail component (React-side visibility) and the official-rail stylesheet
 * override (body class).
 */

import { useState, useSyncExternalStore } from 'react'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { getRailMode, setRailMode, subscribeRailMode, type RailMode } from './mode.ts'
import type { TurnNavKey } from './locales.ts'

/** Registration-side preference face. */
export interface ModeRowInjected {
  t: (key: TurnNavKey, params?: Record<string, unknown>) => string
}

/** Full Settings-row props (the section supplies nothing). */
export type ModeRowProps = ModeRowInjected

const OPTIONS: readonly { id: RailMode; label: TurnNavKey }[] = [
  { id: 'official', label: 'modeOfficial' },
  { id: 'stn', label: 'modeSTN' },
  { id: 'hidden', label: 'modeHidden' },
]

/** Render the rail display-mode preference row. */
export function SettingsNavModeRow({ t }: ModeRowProps) {
  const mode = useSyncExternalStore(subscribeRailMode, getRailMode)
  const [open, setOpen] = useState(false)
  const selectedLabel = OPTIONS.find(option => option.id === mode)?.label ?? 'modeSTN'

  return (
    <div className="tn-mode-row">
      <div className="tn-mode-row-text">
        <div className="tn-mode-title">{t('modeRowTitle')}</div>
        <div className="tn-mode-desc">{t('modeRowDesc')}</div>
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={OPTIONS.map(option => ({ id: option.id, label: t(option.label) }))}
        selectedId={mode}
        onSelect={(id) => {
          setOpen(false)
          setRailMode(id as RailMode)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className="tn-mode-selector"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}
          >
            {t(selectedLabel)}
            <IconChevronDownOutline14 className="tn-mode-chevron" />
          </button>
        )}
      />
    </div>
  )
}
