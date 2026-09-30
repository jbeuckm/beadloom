import { useStore } from '../store/useStore';
import { Icon } from './icons';
import { cloudStatusLook, cloudStatusText } from '../lib/cloud/status';

/** The cloud icon for Cloud Storage's state: busy while updating, crossed
 *  out offline or on a problem. Its tooltip says which. */
export default function CloudStatusIcon({ size = 15 }: { size?: number }) {
  const info = useStore((s) => s.cloudInfo);
  const look = cloudStatusLook(info);
  return (
    <span
      className={'cloud-status' + (look.busy ? ' busy' : '') + (look.alert ? ' alert' : '')}
      title={cloudStatusText(info)}
      role="img"
      aria-label={cloudStatusText(info)}
    >
      <Icon name={look.icon} size={size} />
    </span>
  );
}
