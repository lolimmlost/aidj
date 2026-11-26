import { Children, createContext, useContext, useState, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

/**
 * Settings building blocks. One page body serves both layouts: grouped glass lists on glass phones
 * (iOS Settings), cards on desktop / classic. The Settings route provides the look.
 * Everything saves on change through the preference setters (optimistic, see preferences store).
 */
type Look = 'glass' | 'classic';
const LookContext = createContext<Look>('classic');
export const SettingsLookProvider = LookContext.Provider;
export const useSettingsLook = () => useContext(LookContext);

/** Await a preference save; tell the user only when it failed (the store already rolled it back). */
export async function saveOrWarn(save: Promise<boolean>, what = 'setting') {
  if (!(await save)) toast.error(`Couldn’t save that ${what}. Check your connection and try again.`);
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
  const look = useSettingsLook();
  const items = Children.toArray(children);
  if (look === 'glass') {
    return (
      <section className="flex flex-col gap-2">
        {title && <h2 className="px-1 font-display text-[17px] font-bold tracking-[-0.01em]">{title}</h2>}
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
          {title && <CardTitle className="flex items-center gap-2 [&_svg]:size-5">{icon}{title}</CardTitle>}
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
  const look = useSettingsLook();
  return <div className={cn(look === 'glass' && 'px-3.5 py-3.5', className)}>{children}</div>;
}

function RowText({ label, description, htmlFor }: { label: ReactNode; description?: ReactNode; htmlFor?: string }) {
  const glass = useSettingsLook() === 'glass';
  return (
    <div className="min-w-0 flex-1 space-y-0.5">
      <Label htmlFor={htmlFor} className={cn(glass && 'text-[15px] font-semibold')}>
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
  disabled,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const glass = useSettingsLook() === 'glass';
  return (
    <div className={cn('flex items-center gap-4', glass && 'min-h-[56px] px-3.5 py-3', disabled && 'opacity-60')}>
      <RowText label={label} description={description} htmlFor={htmlFor} />
      {children}
    </div>
  );
}

export function SettingsSwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsRow label={label} description={description} htmlFor={id} disabled={disabled}>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </SettingsRow>
  );
}

/**
 * A slider that follows your finger locally and saves once, when you let go (not one request per
 * step). `onChange` runs live while dragging for real-time effects (e.g. the player's volume).
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
  const glass = useSettingsLook() === 'glass';
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  return (
    <div className={cn('space-y-3', glass && 'px-3.5 py-3.5', disabled && 'opacity-60')}>
      <div className="flex items-baseline justify-between gap-4">
        <Label htmlFor={id} className={cn(glass && 'text-[15px] font-semibold')}>
          {label}
        </Label>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">{format(shown)}</span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[shown]}
        disabled={disabled}
        onValueChange={([v]) => {
          setDraft(v);
          onChange?.(v);
        }}
        onValueCommit={([v]) => {
          setDraft(null);
          if (v !== value) onCommit(v);
        }}
        className="touch-none py-1"
      />
      {description != null && (
        <p className={cn('text-muted-foreground', glass ? 'text-[13px] leading-snug' : 'text-sm')}>{description(shown)}</p>
      )}
    </div>
  );
}

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

/** A stack of sections with the right spacing for each look. */
export function SettingsStack({ children }: { children: ReactNode }) {
  const glass = useSettingsLook() === 'glass';
  return <div className={cn('flex flex-col', glass ? 'gap-6 pb-6' : 'gap-8')}>{children}</div>;
}
