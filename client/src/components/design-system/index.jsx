import React from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AppEmptyState from "@/components/EmptyState";
import AppReviewStateBadge from "@/components/ReviewStateBadge";
import AppStatusBadge from "@/components/StatusBadge";

export function PageShell({
  eyebrow,
  title,
  subtitle,
  actions,
  aside,
  children,
  className,
  contentClassName,
}) {
  return (
    <main className={cn("jf-page-shell", className)}>
      <div className={cn("mx-auto flex w-full max-w-[1600px] flex-col gap-6", contentClassName)}>
        {(title || subtitle || actions) && (
          <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} />
        )}
        {aside ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="min-w-0">{children}</div>
            <aside className="min-w-0">{aside}</aside>
          </div>
        ) : (
          children
        )}
      </div>
    </main>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className,
}) {
  return (
    <header className={cn("flex flex-col gap-3 md:flex-row md:items-start md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="jf-eyebrow mb-2">{eyebrow}</p> : null}
        {title ? <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-[2rem]">{title}</h1> : null}
        {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <ActionButtonGroup className="md:justify-end">{actions}</ActionButtonGroup> : null}
    </header>
  );
}

export function MetricStrip({ children, columns = "auto", className }) {
  const columnClass =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 3
        ? "sm:grid-cols-2 xl:grid-cols-3"
        : columns === 4
          ? "sm:grid-cols-2 xl:grid-cols-4"
          : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return <div className={cn("grid gap-3", columnClass, className)}>{children}</div>;
}

export function StatCard({
  label,
  title,
  value,
  helper,
  icon: Icon,
  tone = "neutral",
  trend,
  className,
}) {
  const toneClass = {
    neutral: "bg-card",
    warm: "bg-[#f3ebdd]",
    bronze: "bg-[#efe0cf]",
    sage: "bg-[#e6ece0]",
    blue: "bg-[#e3eaf0]",
    warning: "bg-[#f2e2c6]",
    danger: "bg-[#eedbd7]",
  }[tone] || "bg-card";

  return (
    <article className={cn("rounded-[var(--jf-radius-card)] p-5 shadow-jf", toneClass, className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label || title}</p>
          <p className="mt-2 truncate font-heading text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {helper ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p> : null}
          {trend ? <p className="mt-2 text-xs font-semibold text-accent">{trend}</p> : null}
        </div>
        {Icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-background/55 text-accent">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function EditorialCard({ eyebrow, title, description, actions, children, className }) {
  return (
    <section className={cn("jf-surface jf-tonal-surface rounded-[var(--jf-radius-panel)] p-6", className)}>
      {eyebrow ? <p className="jf-eyebrow mb-2">{eyebrow}</p> : null}
      {title ? <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">{title}</h2> : null}
      {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-5">{children}</div> : null}
      {actions ? <ActionButtonGroup className="mt-5">{actions}</ActionButtonGroup> : null}
    </section>
  );
}

export function WorkflowRail({ steps = [], currentStep, className }) {
  return (
    <nav className={cn("rounded-[var(--jf-radius-panel)] bg-muted/30 p-3", className)} aria-label="Workflow progress">
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const active = step.id ? step.id === currentStep : index === currentStep;
          const complete = step.complete || step.state === "complete";
          return (
            <li key={step.id || step.label || index}>
              <div
                className={cn(
                  "flex min-h-[44px] items-center gap-3 rounded-[var(--jf-radius-control)] px-3 py-2 text-sm transition-colors",
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                  complete && !active ? "text-[#4f6540]" : null
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    active ? "bg-primary text-primary-foreground" : complete ? "bg-[#e6ece0] text-[#4f6540]" : "bg-background text-muted-foreground"
                  )}
                >
                  {complete ? "✓" : index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{step.label}</span>
                {step.meta ? <span className="text-xs text-muted-foreground">{step.meta}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function DataTable({ columns = [], rows = [], getRowKey, emptyState, className, rowClassName }) {
  return (
    <div className={cn("overflow-hidden rounded-[var(--jf-radius-card)] bg-card/70 shadow-jf", className)}>
      <table className="jf-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key || column.header}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={getRowKey ? getRowKey(row, rowIndex) : row.id || rowIndex} className={typeof rowClassName === "function" ? rowClassName(row, rowIndex) : rowClassName}>
                {columns.map((column) => (
                  <td key={column.key || column.header}>
                    {column.render ? column.render(row, rowIndex) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={Math.max(columns.length, 1)} className="py-10 text-center text-sm text-muted-foreground">
                {emptyState || "No records to show yet."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ActionButtonGroup({ children, className, align = "start" }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        align === "end" ? "justify-end" : align === "center" ? "justify-center" : "justify-start",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ContextPanel({ title, description, children, actions, className }) {
  return (
    <aside className={cn("rounded-[var(--jf-radius-panel)] bg-[#efe0cf]/55 p-5 shadow-jf", className)}>
      {title ? <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">{title}</h2> : null}
      {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
      {actions ? <ActionButtonGroup className="mt-4">{actions}</ActionButtonGroup> : null}
    </aside>
  );
}

export function HelpBanner({ title, children, tone = "info", className }) {
  const Icon = tone === "warning" ? TriangleAlert : tone === "tip" ? Lightbulb : Info;
  const toneClass = {
    info: "bg-[#e3eaf0] text-[#40586c]",
    warning: "bg-[#f2e2c6] text-[#7a5621]",
    tip: "bg-[#efe0cf] text-[#794c2e]",
  }[tone] || "bg-[#e3eaf0] text-[#40586c]";

  return (
    <div className={cn("flex gap-3 rounded-[var(--jf-radius-card)] p-4 text-sm leading-6", toneClass, className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title ? "mt-1" : null)}>{children}</div>
      </div>
    </div>
  );
}

export const TouchButton = React.forwardRef(function TouchButton(
  { className, size = "lg", ...props },
  ref
) {
  return <Button ref={ref} size={size} className={cn("jf-workshop-target", className)} {...props} />;
});

export const StatusBadge = AppStatusBadge;
export const ReviewStateBadge = AppReviewStateBadge;
export const EmptyState = AppEmptyState;
