import React from "react";

export default function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="mb-2 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-[1.8rem] font-semibold leading-tight text-foreground md:text-[2.1rem]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 pt-1 sm:gap-2.5 xl:w-auto xl:max-w-[52%] xl:justify-end xl:self-start">
          {actions}
        </div>
      ) : null}
      {children ? <div className="w-full">{children}</div> : null}
    </div>
  );
}
