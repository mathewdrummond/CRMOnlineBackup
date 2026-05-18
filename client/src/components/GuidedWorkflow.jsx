import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GuidedWorkflow({
  title,
  subtitle,
  steps = [],
  actionHref,
  actionLabel,
  secondaryAction,
  className = "",
}) {
  return (
    <section className={`jf-reference-panel p-4 ${className}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {(actionHref || secondaryAction) ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {secondaryAction || null}
            {actionHref ? (
              <Link to={actionHref}>
                <Button size="sm" className="min-h-[40px] gap-2">
                  {actionLabel || "Start"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      {steps.length > 0 ? (
        <ol className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={`${step.title}-${index}`}
              className={`flex min-h-[72px] gap-3 rounded-lg border border-border/45 bg-card/45 p-3 ${step.current ? "border-primary/45 bg-[#efe0cf]/55 dark:bg-[#3a2a1d]/55" : ""} ${step.done ? "border-[#c9d7be] bg-[#e6ece0]/55 dark:border-[#506143] dark:bg-[#263321]/55" : ""}`}
            >
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step.done ? "bg-[#e6ece0] text-[#4f6540] dark:bg-[#263321] dark:text-[#dbe8d2]" : step.current ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  {step.optional ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Optional</span> : null}
                </div>
                {step.detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p> : null}
                {step.action && step.onAction ? (
                  <Button
                    type="button"
                    variant={step.current ? "default" : "outline"}
                    size="sm"
                    className="mt-3 min-h-[36px]"
                    onClick={step.onAction}
                    disabled={step.disabled}
                  >
                    {step.action}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
