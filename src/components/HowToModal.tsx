import { CATALOG } from '../data/catalog';
import { STEPS, formatSeconds } from '../game/rules';
import { Modal } from './Modal';

const LEGEND = [
  { color: 'var(--green)', text: 'Trafiony utwór — koniec rundy.' },
  { color: 'var(--yellow)', text: 'Ten sam album lub EP, ale inny utwór — jesteś blisko.' },
  { color: 'var(--red)', text: 'Pudło.' },
  { color: 'var(--text-dim)', text: 'Próba pominięta.' },
];

export function HowToModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Jak grać" onClose={onClose}>
      <p>
        Masz <strong>{STEPS.length} prób</strong>, żeby rozpoznać utwór 27.Fuckdemons z
        fragmentu na początku piosenki.
      </p>
      <ol className="rules-list">
        <li>Odsłuchaj fragment — na start tylko {formatSeconds(STEPS[0])}.</li>
        <li>Wpisz tytuł i wybierz go z podpowiedzi, albo pomiń próbę.</li>
        <li>
          Każda pomyłka i każde pominięcie odblokowuje więcej muzyki:{' '}
          {STEPS.map(formatSeconds).join(' → ')}.
        </li>
        <li>Im mniej prób, tym lepszy wynik.</li>
      </ol>

      <div className="legend">
        {LEGEND.map(({ color, text }) => (
          <div className="legend-row" key={text}>
            <span className="legend-swatch" style={{ background: color }} />
            <span>{text}</span>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 14 }}>
        <strong>Dzień</strong> to jeden utwór dla wszystkich, ten sam do północy. W{' '}
        <strong>Treningu</strong> losujesz do woli. W puli jest {CATALOG.length} utworów — solowych
        i gościnnych.
      </p>
    </Modal>
  );
}
