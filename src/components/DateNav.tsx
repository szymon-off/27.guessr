import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { formatDay } from '../game/daily';

interface Props {
  day: number;
  today: number;
  onChange: (day: number) => void;
}

/** Archive navigation. Past days are replayable; tomorrow stays locked. */
export function DateNav({ day, today, onChange }: Props) {
  const isToday = day === today;
  return (
    <div className="date-nav">
      <button
        type="button"
        className="date-nav-btn"
        onClick={() => onChange(day - 1)}
        disabled={day <= 1}
        aria-label="Poprzedni dzień"
      >
        <ChevronLeft className="icon-sm" aria-hidden="true" />
      </button>

      <div className="date-display">
        <span className="day-number-badge">Dzień #{day}</span>
        <span className="date-text">{formatDay(day)}</span>
        {isToday && <span className="date-badge">Dzisiaj</span>}
      </div>

      <button
        type="button"
        className="date-nav-btn"
        onClick={() => onChange(day + 1)}
        disabled={isToday}
        aria-label={isToday ? 'Jutrzejszy utwór jest zablokowany' : 'Następny dzień'}
      >
        {isToday ? (
          <Lock className="icon-sm" aria-hidden="true" />
        ) : (
          <ChevronRight className="icon-sm" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
