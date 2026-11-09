import { Icon } from "@getpaseo/plugin/client/ui";

export function IconButton({
  icon,
  label,
  title = label,
  onClick,
  busy = false,
  pressed,
}: {
  readonly icon: string;
  readonly label: string;
  readonly title?: string;
  readonly onClick: () => void;
  readonly busy?: boolean;
  readonly pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className="review-icon-button"
      aria-label={label}
      title={title}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={onClick}
    >
      <span aria-hidden="true">
        <Icon name={icon} size={15} color="currentColor" />
      </span>
    </button>
  );
}
