import React from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";

export default function StatCard({ title, value, subtitle, icon: Icon, href, hrefLabel, iconHref, iconLabel, trend, trendUp }) {
  const iconContent = Icon ? (
    <div className="ml-3 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted/55 text-accent transition-colors">
      <Icon className="w-5 h-5 text-primary" />
    </div>
  ) : null;

  const cardBody = (
    <Card className="min-h-[112px] rounded-lg border-border/45 bg-card/70 p-4 shadow-jf transition-[background-color,box-shadow] hover:bg-card/85 hover:shadow-jf-raised">
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
          <p className="truncate font-heading text-3xl font-semibold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && <p className={`text-xs font-semibold ${trendUp ? "text-[#4f6540]" : "text-[#7e4038]"}`}>{trendUp ? "↑" : "↓"} {trend}</p>}
        </div>
        {!href && iconHref ? (
          <Link
            to={iconHref}
            aria-label={iconLabel || `Open ${title}`}
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {iconContent}
          </Link>
        ) : iconContent}
      </div>
    </Card>
  );

  if (!href) {
    return cardBody;
  }

  return (
    <Link
      to={href}
      aria-label={hrefLabel || `Open ${title}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {cardBody}
    </Link>
  );
}
