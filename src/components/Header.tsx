import { BarChart3, CircleHelp, Droplet, Moon, RotateCcw, Sun, Calendar } from 'lucide-react';
import { Logo } from './Logo';
import type { Mode } from '../game/useGame';
import type { ThemeName } from '../useTheme';

interface Props {
  theme: ThemeName;
  onTheme: (theme: ThemeName) => void;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onHowTo: () => void;
  onStats: () => void;
}

const THEMES: { name: ThemeName; title: string; Icon: typeof Moon }[] = [
  { name: 'night', title: 'Nocny', Icon: Moon },
  { name: 'light', title: 'Jasny', Icon: Sun },
  { name: 'abyss', title: 'Otchłań', Icon: Droplet },
];

export function Header({ theme, onTheme, mode, onMode, onHowTo, onStats }: Props) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <Logo />
        <span className="brand-name">27.GUESSR</span>
        <span className="brand-tag">Heardle</span>
      </div>

      <nav className="header-actions">
        <div className="theme-toggle" role="group" aria-label="Motyw">
          {THEMES.map(({ name, title, Icon }) => (
            <button
              key={name}
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={theme === name}
              className={`theme-btn${theme === name ? ' theme-btn--active' : ''}`}
              onClick={() => onTheme(name)}
            >
              <Icon className="icon-sm" aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="mode-toggle" role="group" aria-label="Tryb gry">
          <button
            type="button"
            aria-pressed={mode === 'daily'}
            className={`mode-btn${mode === 'daily' ? ' mode-btn--active' : ''}`}
            onClick={() => onMode('daily')}
          >
            <Calendar className="icon-sm" aria-hidden="true" />
            <span className="mode-label">Dzień</span>
          </button>
          <button
            type="button"
            aria-pressed={mode === 'practice'}
            className={`mode-btn${mode === 'practice' ? ' mode-btn--active' : ''}`}
            onClick={() => onMode('practice')}
          >
            <RotateCcw className="icon-sm" aria-hidden="true" />
            <span className="mode-label">Trening</span>
          </button>
        </div>

        <button type="button" className="icon-btn" title="Jak grać" onClick={onHowTo}>
          <CircleHelp className="icon-md" aria-hidden="true" />
          <span className="sr-only">Jak grać</span>
        </button>
        <button type="button" className="icon-btn" title="Statystyki" onClick={onStats}>
          <BarChart3 className="icon-md" aria-hidden="true" />
          <span className="sr-only">Statystyki</span>
        </button>
      </nav>
    </header>
  );
}
