import { TbTrash } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';

export default function FxDeleteButton({ effect, onRemove }: { effect: string; onRemove: () => void }) {
  const { t } = useI18n();
  const label = t('fx.remove', { effect });
  return <button type="button" className="fx-delete" title={label} aria-label={label} onClick={onRemove}>
    <TbTrash aria-hidden="true" />
  </button>;
}
