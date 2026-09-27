import type { ComponentProps, ReactNode } from 'react';

const INPUT =
  'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-surface p-5 ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: ComponentProps<'input'>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`${INPUT} ${className}`} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  const { className = '', ...rest } = props;
  return <textarea {...rest} className={`${INPUT} ${className}`} />;
}

export function Select(props: ComponentProps<'select'>) {
  const { className = '', ...rest } = props;
  return <select {...rest} className={`${INPUT} ${className}`} />;
}

type ButtonTone = 'primary' | 'default' | 'ghost' | 'danger';

const TONES: Record<ButtonTone, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  default: 'border border-border bg-background hover:bg-surface',
  ghost: 'text-muted hover:text-foreground',
  danger: 'text-muted hover:text-red-500',
};

export function Button({
  tone = 'default',
  className = '',
  ...rest
}: ComponentProps<'button'> & { tone?: ButtonTone }) {
  return (
    <button
      {...rest}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${TONES[tone]} ${className}`}
    />
  );
}

export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}
