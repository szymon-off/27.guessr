import { MAX_ATTEMPTS } from '../game/rules';
import { winRate, type Stats } from '../storage/stats';
import { Modal } from './Modal';

interface Props {
  stats: Stats;
  onClose: () => void;
}

export function StatsModal({ stats, onClose }: Props) {
  const max = Math.max(1, ...stats.distribution);
  const tiles = [
    { value: stats.played, label: 'Rozegrane' },
    { value: `${winRate(stats)}%`, label: 'Skuteczność' },
    { value: stats.currentStreak, label: 'Seria' },
    { value: stats.maxStreak, label: 'Rekord' },
  ];

  return (
    <Modal title="Statystyki" onClose={onClose}>
      <div className="stats-grid">
        {tiles.map(({ value, label }) => (
          <div className="stat-tile" key={label}>
            <span className="stat-value">{value}</span>
            <span className="stat-label">{label}</span>
          </div>
        ))}
      </div>

      <p style={{ marginBottom: 8 }}>
        <strong>Rozkład prób</strong>
      </p>
      {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
        const count = stats.distribution[i] ?? 0;
        return (
          <div className="dist-row" key={i}>
            <span className="dist-index">{i + 1}</span>
            <div
              className={`dist-bar${count === max && count > 0 ? ' dist-bar--best' : ''}`}
              style={{ width: `${Math.max(6, (count / max) * 100)}%` }}
            >
              {count}
            </div>
          </div>
        );
      })}

      {stats.played === 0 && (
        <p style={{ marginTop: 12 }}>Zagraj pierwszą rundę dnia, żeby zobaczyć wykres.</p>
      )}
    </Modal>
  );
}
