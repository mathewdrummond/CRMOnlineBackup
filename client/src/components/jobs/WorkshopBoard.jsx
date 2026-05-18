import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, FileText, Printer, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/helpers";
import {
  WORKSHOP_BOARD_STAGES,
  buildWorkshopBoardCards,
  getWorkshopStageStatus,
  groupWorkshopCardsByStage,
} from "@/lib/workshopBoard";

const ALL_FILTER_VALUE = "all";

function WorkshopCard({ card, onMoveStage, onDragStart, onPrintHandover, onAssignInstall, onMarkReady }) {
  return (
    <article
      draggable
      data-testid={`workshop-card-${card.id}`}
      onDragStart={(event) => {
        event.dataTransfer?.setData("text/plain", card.id);
        onDragStart(card.id);
      }}
      className="rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{card.jobNumber || "Job"}</p>
          <h3 className="mt-1 text-base font-semibold leading-tight text-foreground">{card.title}</h3>
          {card.client ? <p className="mt-1 text-sm text-muted-foreground">{card.client}</p> : null}
        </div>
        {card.warnings.length ? (
          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {card.warnings.length}
          </Badge>
        ) : (
          <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">OK</Badge>
        )}
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span>{card.installDate ? formatDate(card.installDate) : "No install date"}</span>
        </div>
        <p className="rounded-lg bg-muted/50 px-2 py-1 text-xs capitalize text-muted-foreground">
          {String(card.status || "").replace(/_/g, " ")}
        </p>
      </div>

      {card.warnings.length ? (
        <ul className="mt-3 space-y-1">
          {card.warnings.slice(0, 3).map((warning) => (
            <li key={warning} className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">{warning}</li>
          ))}
        </ul>
      ) : null}

      {card.notes.length ? (
        <p className="mt-3 line-clamp-2 rounded-lg border border-dashed px-2 py-2 text-xs text-muted-foreground">
          {card.notes[0]}
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Select value={card.stageId} onValueChange={(stageId) => onMoveStage(card, stageId)}>
          <SelectTrigger className="min-h-[44px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKSHOP_BOARD_STAGES.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {card.quoteId ? (
          <Button type="button" asChild variant="outline" className="min-h-[44px] text-xs">
            <Link to={`/quotes/${card.quoteId}`}>
              <FileText className="mr-1 h-3.5 w-3.5" />
              Quote
            </Link>
          </Button>
        ) : (
          <Button type="button" asChild variant="outline" className="min-h-[44px] text-xs">
            <Link to={`/jobs/${card.id}`}>Open Job</Link>
          </Button>
        )}
        <Button type="button" variant="outline" className="min-h-[44px] text-xs" onClick={() => onPrintHandover?.(card)}>
          <Printer className="mr-1 h-3.5 w-3.5" />
          Handover
        </Button>
        <Button type="button" variant="outline" className="min-h-[44px] text-xs" onClick={() => onAssignInstall?.(card)}>
          <Truck className="mr-1 h-3.5 w-3.5" />
          Install
        </Button>
        <Button type="button" className="col-span-2 min-h-[44px] text-xs" onClick={() => onMarkReady?.(card)}>
          Mark Ready
        </Button>
      </div>
    </article>
  );
}

export default function WorkshopBoard({
  jobs = [],
  quotes = [],
  jobOperations = [],
  onMoveStage,
  onPrintHandover,
  onAssignInstall,
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState(ALL_FILTER_VALUE);
  const [warningFilter, setWarningFilter] = useState(ALL_FILTER_VALUE);
  const [draggedCardId, setDraggedCardId] = useState("");
  const cards = useMemo(() => buildWorkshopBoardCards({ jobs, quotes, jobOperations }), [jobOperations, jobs, quotes]);
  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesSearch = !query || `${card.title} ${card.client} ${card.jobNumber}`.toLowerCase().includes(query);
      const matchesStage = stageFilter === ALL_FILTER_VALUE || card.stageId === stageFilter;
      const matchesWarnings = warningFilter === ALL_FILTER_VALUE || (warningFilter === "warnings" ? card.warnings.length > 0 : card.warnings.length === 0);
      return matchesSearch && matchesStage && matchesWarnings;
    });
  }, [cards, search, stageFilter, warningFilter]);
  const groups = groupWorkshopCardsByStage(filteredCards);

  const moveCard = (card, stageId) => {
    if (!card || card.stageId === stageId) return;
    onMoveStage?.(card, stageId, getWorkshopStageStatus(stageId));
  };

  return (
    <div className="space-y-4" data-testid="workshop-board">
      <div className="grid gap-3 rounded-2xl border bg-card p-3 md:grid-cols-[1fr_220px_180px]">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search job, client, or number"
          className="min-h-[48px]"
        />
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="min-h-[48px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All stages</SelectItem>
            {WORKSHOP_BOARD_STAGES.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={warningFilter} onValueChange={setWarningFilter}>
          <SelectTrigger className="min-h-[48px]">
            <SelectValue placeholder="Warnings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All jobs</SelectItem>
            <SelectItem value="warnings">Needs attention</SelectItem>
            <SelectItem value="clear">No warnings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-3 2xl:grid-cols-6">
        {WORKSHOP_BOARD_STAGES.map((stage) => {
          const stageCards = groups.get(stage.id) || [];
          return (
            <section
              key={stage.id}
              data-testid={`workshop-stage-${stage.id}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const cardId = event.dataTransfer?.getData("text/plain") || draggedCardId;
                const card = cards.find((item) => item.id === cardId);
                moveCard(card, stage.id);
                setDraggedCardId("");
              }}
              className="min-h-[420px] min-w-[280px] rounded-2xl border bg-muted/30 p-3"
            >
              <div className="mb-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{stage.label}</h2>
                  <Badge variant="secondary">{stageCards.length}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{stage.description}</p>
              </div>
              <div className="space-y-3">
                {stageCards.map((card) => (
                  <WorkshopCard
                    key={card.id}
                    card={card}
                    onMoveStage={moveCard}
                    onDragStart={setDraggedCardId}
                    onPrintHandover={onPrintHandover}
                    onAssignInstall={onAssignInstall}
                    onMarkReady={(readyCard) => moveCard(readyCard, "ready_for_production")}
                  />
                ))}
                {stageCards.length === 0 ? (
                  <p className="rounded-xl border border-dashed bg-card/50 px-3 py-8 text-center text-sm text-muted-foreground">
                    No jobs here.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
