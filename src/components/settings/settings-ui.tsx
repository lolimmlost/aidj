import { Children, createContext, useContext, useState, type ReactNode } from 'react';
import { ChevronRight, Minus, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

/**
 * Settings building blocks (canvas "Settings redraw"). One page body serves both layouts: grouped
 * glass lists with iOS-size controls in the glass design, cards in the classic one. The Settings
 * route provides the look. Everything saves on change through the preference setters (optimistic,
 * see the preferences store).
 */
type Look = 'glass' | 'classic';
const LookContext = createContext<Look>('classic');
export const SettingsLookProvider = LookContext.Provider;
export const useSettingsLook = () => useContext(LookContext);
const useGlass = () => useSettingsLook() === 'glass';

/** Await a preference save; tell the user only when it failed (the store already rolled it back). */
export async function saveOrWarn(save: Promise<boolean>, what = 'setting') {
  if (!(await save)) toast.error(`Couldn’t save that ${what}. Check your connection and try again.`);
}

/** The violet → gold wash the page heroes use. */
export const HERO_WASH =
  'bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_32%,transparent),color-mix(in_oklch,#E0AE4A_20%,transparent))]';

/** The card at the top of a settings page that shows what the page is about. */
export function SettingsHero({ children, className, wash = false }: { children: ReactNode; className?: string; wash?: boolean }) {
  if (useGlass()) {
    return <div className={cn('glass-surface relative overflow-hidden rounded-[24px] p-[18px]', wash && HERO_WASH, className)}>{children}</div>;
  }
  return <Card className={cn('p-6', wash && HERO_WASH, className)}>{children}</Card>;
}

/** Icon chip for a row: violet tint, like the Settings index. */
export function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-primary/15 text-primary [&_svg]:size-[18px]">
      {children}
    </span>
  );
}

export function SettingsSection({
  title,
  description,
  icon,
  footer,
  children,
}: {
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  if (useGlass()) {
    return (
      <section className="flex flex-col gap-2">
        {title != null && <h2 className="px-1 font-display text-[17px] font-bold tracking-[-0.01em]">{title}</h2>}
        {description != null && <p className="-mt-1 px-1 text-[13px] leading-snug text-muted-foreground">{description}</p>}
        <div className="glass-surface divide-y divide-foreground/10 overflow-hidden rounded-[20px]">{items}</div>
        {footer != null && <p className="px-1 text-[12px] leading-snug text-muted-foreground">{footer}</p>}
      </section>
    );
  }
  return (
    <Card>
      {(title != null || description != null) && (
        <CardHeader>
          {title != null && <CardTitle className="flex items-center gap-2 [&_svg]:size-5">{icon}{title}</CardTitle>}
          {description != null && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className="divide-y divide-border/60 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0 [&>*]:py-4">
        {items}
      </CardContent>
      {footer != null && <p className="px-6 pb-6 text-sm text-muted-foreground">{footer}</p>}
    </Card>
  );
}

/** Free content inside a section (forms, notices, buttons), padded like a row. */
export function SettingsBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(useGlass() && 'px-3.5 py-3.5', className)}>{children}</div>;
}

function RowText({ label, description, htmlFor, tone }: { label: ReactNode; description?: ReactNode; htmlFor?: string; tone?: 'danger' }) {
  const glass = useGlass();
  return (
    <div className="min-w-0 flex-1 space-y-0.5">
      <Label htmlFor={htmlFor} className={cn(glass && 'text-[15px] font-semibold', tone === 'danger' && 'text-destructive')}>
        {label}
      </Label>
      {description != null && (
        <p className={cn('text-muted-foreground', glass ? 'text-[13px] leading-snug' : 'text-sm')}>{description}</p>
      )}
    </div>
  );
}

/** Label + description on the left, a control (or a value) on the right. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  icon,
  disabled,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  icon?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const glass = useGlass();
  return (
    <div className={cn('flex items-center gap-3', glass ? 'min-h-[58px] px-3.5 py-2.5' : 'gap-4', disabled && 'opacity-60')}>
      {glass && icon != null && <RowIcon>{icon}</RowIcon>}
      <RowText label={label} description={description} htmlFor={htmlFor} />
      {children}
    </div>
  );
}

/** A row you tap to go somewhere or open something: value + chevron on the right. */
export function SettingsLinkRow({
  label,
  description,
  icon,
  value,
  onClick,
  tone,
}: {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  value?: ReactNode;
  onClick: () => void;
  tone?: 'danger';
}) {
  const glass = useGlass();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 text-left [-webkit-tap-highlight-color:transparent]',
        glass ? 'min-h-[58px] px-3.5 py-2.5 active:bg-foreground/5' : 'gap-4 hover:opacity-80',
      )}
    >
      {glass && icon != null && <RowIcon>{icon}</RowIcon>}
      <RowText label={label} description={description} tone={tone} />
      {value != null && <span className="shrink-0 text-sm text-muted-foreground">{value}</span>}
      {tone !== 'danger' && <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />}
    </button>
  );
}

export function SettingsSwitchRow({
  id,
  label,
  description,
  icon,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const glass = useGlass();
  return (
    <SettingsRow label={label} description={description} htmlFor={id} icon={icon} disabled={disabled}>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={cn(glass && 'ios-switch')} />
    </SettingsRow>
  );
}

/** A slider that follows your finger and reports `onCommit` once, when you let go. */
export function useSliderDraft(value: number, onCommit: (v: number) => void, onChange?: (v: number) => void) {
  const [draft, setDraft] = useState<number | null>(null);
  return {
    shown: draft ?? value,
    props: {
      value: [draft ?? value],
      onValueChange: ([v]: number[]) => {
        setDraft(v);
        onChange?.(v);
      },
      onValueCommit: ([v]: number[]) => {
        setDraft(null);
        if (v !== value) onCommit(v);
      },
    },
  };
}

export function SettingsSlider({ className, ...props }: React.ComponentProps<typeof Slider>) {
  return <Slider {...props} className={cn('touch-none py-1', useGlass() && 'chunky-slider py-2', className)} />;
}

/**
 * A slider row: label and value on top, slider below. Follows your finger locally and saves once,
 * on release. `onChange` runs live while dragging (e.g. the player's volume).
 */
export function SettingsSliderRow({
  id,
  label,
  description,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  onCommit,
  disabled,
}: {
  id: string;
  label: ReactNode;
  description?: (value: number) => ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
  onChange?: (value: number) => void;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const glass = useGlass();
  const { shown, props } = useSliderDraft(value, onCommit, onChange);
  return (
    <div className={cn('space-y-2', glass && 'px-3.5 py-3.5', disabled && 'opacity-60')}>
      <div className="flex items-baseline justify-between gap-4">
        <Label htmlFor={id} className={cn(glass && 'text-[15px] font-semibold')}>
          {label}
        </Label>
        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-primary">{format(shown)}</span>
      </div>
      <SettingsSlider id={id} min={min} max={max} step={step} disabled={disabled} {...props} />
      {description && (
        <p className={cn('text-muted-foreground', glass ? 'text-[13px] leading-snug' : 'text-sm')}>{description(shown)}</p>
      )}
    </div>
  );
}

/** Pill segmented control (replaces dropdowns for short option lists). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid gap-[3px] rounded-[14px] bg-foreground/[0.08] p-[3px]', disabled && 'pointer-events-none opacity-60', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => value !== o.value && onChange(o.value)}
          className={cn(
            'flex h-[34px] items-center justify-center gap-1.5 rounded-[11px] px-1 text-[13px] font-semibold transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent] [&_svg]:size-4',
            value === o.value ? 'bg-foreground text-background' : 'text-foreground/70',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A choice among a few options. Glass: label on top, segmented pills below. Classic: a select on the
 * right of the row.
 */
export function SettingsSelectRow<T extends string>({
  id,
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  if (useGlass()) {
    return (
      <div className={cn('space-y-2.5 px-3.5 py-3.5', disabled && 'opacity-60')}>
        <p id={`${id}-label`} className="text-[15px] font-semibold">
          {label}
        </p>
        <Segmented value={value} options={options} onChange={onChange} label={typeof label === 'string' ? label : id} disabled={disabled} />
        {description != null && <p className="text-[13px] leading-snug text-muted-foreground">{description}</p>}
      </div>
    );
  }
  return (
    <SettingsRow label={label} description={description} htmlFor={id} disabled={disabled}>
      <Select value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
        <SelectTrigger id={id} className="h-10 w-auto min-w-[9rem] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

/** − n + for small whole numbers. Saves on each tap. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const btn =
    'grid h-8 w-9 place-items-center rounded-[10px] text-foreground transition-colors touch-manipulation active:bg-foreground/10 disabled:opacity-35 [-webkit-tap-highlight-color:transparent]';
  return (
    <span role="group" aria-label={label} className="flex shrink-0 items-center gap-0.5 rounded-[14px] bg-foreground/[0.08] p-[3px]">
      <button type="button" className={btn} aria-label={`Fewer: ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="size-4" aria-hidden />
      </button>
      <output aria-live="polite" className="min-w-7 text-center font-mono text-sm font-bold tabular-nums">
        {value}
      </output>
      <button type="button" className={btn} aria-label={`More: ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="size-4" aria-hidden />
      </button>
    </span>
  );
}

export function SettingsStepperRow({
  label,
  description,
  icon,
  value,
  min,
  max,
  unit,
  onChange,
  disabled,
}: {
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsRow label={label} description={description} icon={icon} disabled={disabled}>
      <Stepper value={value} min={min} max={max} onChange={onChange} label={label} disabled={disabled} />
      {unit != null && <span className="w-10 shrink-0 text-sm text-muted-foreground">{unit}</span>}
    </SettingsRow>
  );
}

/** Status pill (On, Connected, This device…). */
export function StatusPill({ tone = 'neutral', children }: { tone?: 'good' | 'bad' | 'neutral' | 'accent'; children: ReactNode }) {
  const tones = {
    good: 'bg-success/15 text-success',
    bad: 'bg-destructive/15 text-destructive',
    neutral: 'bg-foreground/[0.07] text-muted-foreground',
    accent: 'bg-primary/15 text-primary',
  };
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold', tones[tone])}>
      {tone !== 'accent' && <span aria-hidden className="size-2 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** A stack of sections with the right spacing for each look. */
export function SettingsStack({ children }: { children: ReactNode }) {
  return <div className={cn('flex flex-col', useGlass() ? 'gap-[22px] pb-6' : 'gap-8')}>{children}</div>;
}
