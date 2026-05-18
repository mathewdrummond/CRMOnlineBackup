import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, CheckCircle2, Download, ExternalLink, FileDown, Film, Filter, GraduationCap, LifeBuoy, Map, RotateCcw, Search, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  HELP_ARTICLES,
  HELP_ARTICLE_MAP,
  HELP_ARTICLE_TYPES,
  HELP_CATEGORIES,
  HELP_TRAINING_PACKS,
  BEGINNER_HELP_NEXT_STEPS,
  COMMON_HELP_MISTAKES,
  COMMON_HELP_TASKS,
  GUIDED_TOURS,
  filterHelpArticles,
  getArticlesForPack,
  getHelpArticle,
  getHelpContextForPath,
  getHelpTour,
} from "@/lib/helpContent";
import { buildHelpDocumentHtml, downloadHtmlDocument, openHtmlDocumentInNewTab, printHelpDocument } from "@/lib/helpExport";
import { getHelpArticleViewCounts, getRecentHelpArticleIds, recordHelpArticleView } from "@/lib/helpStorage";
import { useHelp } from "@/lib/HelpContext";
import ProcessWalkthrough from "@/components/help/ProcessWalkthrough";
import {
  HELP_RECORDINGS,
  filterHelpRecordings,
  getHelpRecording,
  getRecordingForTour,
  getRecordingCategories,
  getRecordingsForArticle,
  getRecommendedRecordings,
} from "@/lib/helpRecordings";

function toSentenceCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getFeaturedArticles() {
  return HELP_ARTICLES.filter((article) => article.featured).slice(0, 6);
}

function renderArticleSection(section) {
  return (
    <section key={section.heading} className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="text-base font-semibold text-foreground">{section.heading}</h3>
      {(section.paragraphs || []).map((paragraph) => (
        <p key={paragraph} className="text-sm leading-6 text-muted-foreground">{paragraph}</p>
      ))}
      {(section.bullets || []).length ? (
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>
      ) : null}
      {(section.steps || []).length ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          {section.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      ) : null}
      {(section.notes || []).length ? (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50/70 p-3 text-sm text-amber-900">
          {section.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      ) : null}
      {section.why ? (
        <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 p-3 text-sm text-emerald-950">
          <p className="font-semibold">Why this matters</p>
          <p className="mt-1 leading-6">{section.why}</p>
        </div>
      ) : null}
    </section>
  );
}

function HelpShortcutList({ title, items, onOpenArticle, onStartTour, icon: Icon = Map }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="rounded-xl border p-3">
            <button
              type="button"
              className="w-full text-left text-sm font-medium text-foreground hover:underline"
              onClick={() => onOpenArticle(getHelpArticle(item.articleId))}
            >
              {item.label}
            </button>
            {item.tourId ? (
              <Button type="button" variant="link" className="mt-1 h-auto min-h-[36px] p-0 text-xs" onClick={() => onStartTour(item.tourId)}>
                Start step-by-step help
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function HelpCenter() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { beginnerMode, completedTourIds, restartGuidedTours, setBeginnerMode, startTour } = useHelp();
  const routeContext = useMemo(() => getHelpContextForPath(location.state?.fromPath || ""), [location.state?.fromPath]);
  const currentScreenContext = useMemo(() => getHelpContextForPath(location.pathname === "/help" ? "" : location.pathname), [location.pathname]);
  const effectiveScreenContext = routeContext || currentScreenContext;
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "all");
  const [type, setType] = useState(searchParams.get("type") || "all");
  const [selectedArticleId, setSelectedArticleId] = useState(searchParams.get("article") || routeContext?.articleId || currentScreenContext?.articleId || getFeaturedArticles()[0]?.id || HELP_ARTICLES[0]?.id || "");
  const [selectedPackId, setSelectedPackId] = useState(searchParams.get("pack") || "");
  const [recordingCategory, setRecordingCategory] = useState(searchParams.get("videoCategory") || "all");
  const [recordingLevel, setRecordingLevel] = useState(searchParams.get("videoLevel") || "all");
  const [selectedRecordingId, setSelectedRecordingId] = useState(searchParams.get("recording") || "");

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (query) params.set("q", query); else params.delete("q");
    if (category !== "all") params.set("category", category); else params.delete("category");
    if (type !== "all") params.set("type", type); else params.delete("type");
    if (selectedArticleId) params.set("article", selectedArticleId); else params.delete("article");
    if (selectedPackId) params.set("pack", selectedPackId); else params.delete("pack");
    if (recordingCategory !== "all") params.set("videoCategory", recordingCategory); else params.delete("videoCategory");
    if (recordingLevel !== "all") params.set("videoLevel", recordingLevel); else params.delete("videoLevel");
    if (selectedRecordingId) params.set("recording", selectedRecordingId); else params.delete("recording");
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      setSearchParams(params, { replace: true });
    }
  }, [category, query, recordingCategory, recordingLevel, searchParams, selectedArticleId, selectedPackId, selectedRecordingId, setSearchParams, type]);

  const filteredArticles = useMemo(() => {
    const articles = filterHelpArticles({ query, category, type });
    if (!beginnerMode) return articles;
    return articles.filter((article) => !article.advanced && article.type !== "review" && article.category !== "UX Review");
  }, [beginnerMode, query, category, type]);

  const selectedArticle = useMemo(
    () => getHelpArticle(selectedArticleId) || filteredArticles[0] || HELP_ARTICLES[0] || null,
    [filteredArticles, selectedArticleId]
  );

  useEffect(() => {
    if (selectedArticle?.id) {
      recordHelpArticleView(selectedArticle.id);
    }
  }, [selectedArticle?.id]);

  const recentArticles = useMemo(
    () => getRecentHelpArticleIds().map((articleId) => HELP_ARTICLE_MAP.get(articleId)).filter(Boolean),
    [selectedArticle?.id]
  );

  const popularArticles = useMemo(() => {
    const counts = getHelpArticleViewCounts();
    return [...HELP_ARTICLES]
      .sort((left, right) => {
        const countCompare = Number(counts[right.id] || 0) - Number(counts[left.id] || 0);
        if (countCompare !== 0) return countCompare;
        return Number(Boolean(right.featured)) - Number(Boolean(left.featured));
      })
      .slice(0, 6);
  }, [selectedArticle?.id]);

  const selectedPack = selectedPackId ? HELP_TRAINING_PACKS.find((pack) => pack.id === selectedPackId) || null : null;
  const packArticles = selectedPack ? getArticlesForPack(selectedPack.id) : [];
  const selectedRecording = selectedRecordingId ? getHelpRecording(selectedRecordingId) : null;
  const articleRecordings = selectedArticle ? getRecordingsForArticle(selectedArticle.id) : [];
  const recommendedRecordings = useMemo(() => getRecommendedRecordings(5), []);
  const screenRecording = useMemo(
    () => (effectiveScreenContext?.tourId ? getRecordingForTour(effectiveScreenContext.tourId) : null),
    [effectiveScreenContext?.tourId]
  );
  const filteredRecordings = useMemo(
    () => filterHelpRecordings({ query, category: recordingCategory, level: beginnerMode ? "beginner" : recordingLevel }),
    [beginnerMode, query, recordingCategory, recordingLevel]
  );

  const printCurrentSelection = () => {
    const title = selectedPack ? selectedPack.title : selectedArticle?.title || "JoinerFlow Help";
    const subtitle = selectedPack ? selectedPack.summary : selectedArticle?.summary || "";
    const articles = selectedPack ? packArticles : selectedArticle ? [selectedArticle] : [];
    const html = buildHelpDocumentHtml({ title, subtitle, articles });
    printHelpDocument(html);
  };

  const exportCurrentSelectionHtml = () => {
    const title = selectedPack ? selectedPack.title : selectedArticle?.title || "JoinerFlow Help";
    const subtitle = selectedPack ? selectedPack.summary : selectedArticle?.summary || "";
    const articles = selectedPack ? packArticles : selectedArticle ? [selectedArticle] : [];
    const html = buildHelpDocumentHtml({ title, subtitle, articles });
    const filename = `${String(title).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "joinerflow-help"}.html`;
    downloadHtmlDocument(filename, html);
  };

  const openArticleDocument = (article) => {
    if (!article) return;
    setSelectedPackId("");
    setSelectedArticleId(article.id);
    const html = buildHelpDocumentHtml({
      title: article.title || "JoinerFlow Help",
      subtitle: article.summary || "",
      articles: [article],
    });
    openHtmlDocumentInNewTab(html);
  };

  const launchTour = (tourId) => {
    const tour = getHelpTour(tourId);
    if (!tour) return;
    if (tour.startRoute) {
      navigate(tour.startRoute);
    }
    startTour(tourId);
  };

  const openArticleById = (articleId) => {
    const article = getHelpArticle(articleId);
    if (article) openArticleDocument(article);
  };

  const currentArticleTour = useMemo(
    () => (selectedArticle ? GUIDED_TOURS.find((tour) => tour.articleId === selectedArticle.id) || null : null),
    [selectedArticle]
  );

  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Help Centre"
        subtitle="Searchable onboarding, guided workflows, troubleshooting, and Millbrook workshop training."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant={beginnerMode ? "default" : "outline"} size="sm" className="min-h-[40px] gap-2" onClick={() => setBeginnerMode(!beginnerMode)}>
              <GraduationCap className="h-4 w-4" />
              Beginner Mode {beginnerMode ? "On" : "Off"}
            </Button>
            <Button variant="outline" size="sm" className="min-h-[40px] gap-2" onClick={restartGuidedTours}>
              <RotateCcw className="h-4 w-4" />
              Restart Guided Tours
            </Button>
            <Button variant="outline" size="sm" className="min-h-[40px] gap-2" onClick={printCurrentSelection}>
              <FileDown className="h-4 w-4" />
              Print / Save PDF
            </Button>
            <Button variant="outline" size="sm" className="min-h-[40px] gap-2" onClick={exportCurrentSelectionHtml}>
              <Download className="h-4 w-4" />
              Export HTML
            </Button>
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="rounded-2xl border-border/80 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Articles</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{HELP_ARTICLES.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Built from the current app routes, tabs, and workflows.</p>
          </Card>
          <Card className="rounded-2xl border-border/80 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Training Packs</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{HELP_TRAINING_PACKS.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Workshop, office, quoting, import, install, recovery, and Millbrook method packs.</p>
          </Card>
          <Card className="rounded-2xl border-border/80 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Guided Tours</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{GUIDED_TOURS.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{completedTourIds.length} completed. Restartable walkthroughs for first-time staff onboarding.</p>
          </Card>
          <Card className="rounded-2xl border-border/80 p-4 md:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Show Me How Videos</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{HELP_RECORDINGS.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Short Scribe-style process recordings with captions, pause points, screenshots, and written step guides.</p>
              </div>
              <Button type="button" variant="outline" className="min-h-[40px] gap-2" onClick={() => setSelectedRecordingId(recommendedRecordings[0]?.id || "")}>
                <Film className="h-4 w-4" />
                Watch first example
              </Button>
            </div>
          </Card>
        </div>
      </PageHeader>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <HelpShortcutList title="Most Common Tasks" items={COMMON_HELP_TASKS} onOpenArticle={openArticleDocument} onStartTour={launchTour} icon={CheckCircle2} />
        <HelpShortcutList title="Most Common Mistakes" items={COMMON_HELP_MISTAKES} onOpenArticle={openArticleDocument} onStartTour={launchTour} icon={ShieldCheck} />
        <HelpShortcutList title="Recommended Next Steps" items={BEGINNER_HELP_NEXT_STEPS} onOpenArticle={openArticleDocument} onStartTour={launchTour} icon={GraduationCap} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help..." className="pl-9" />
              </div>
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {HELP_CATEGORIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All article types</SelectItem>
                      {HELP_ARTICLE_TYPES.map((value) => <SelectItem key={value} value={value}>{toSentenceCase(value)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Help Articles</h2>
            </div>
            <div className="space-y-2">
              {filteredArticles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => openArticleDocument(article)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${selectedArticle?.id === article.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{article.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{article.summary}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">{article.category}</Badge>
                  </div>
                </button>
              ))}
              {filteredArticles.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No help articles matched that search. Try a broader term such as “quote”, “Mozaik”, “crew”, or “GST”.</div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Film className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Video Library</h2>
            </div>
            <div className="grid gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Video category</Label>
                <Select value={recordingCategory} onValueChange={setRecordingCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All video categories</SelectItem>
                    {getRecordingCategories().map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Video level</Label>
                <Select value={recordingLevel} onValueChange={setRecordingLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All levels</SelectItem>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {filteredRecordings.slice(0, 8).map((recording) => (
                <button
                  key={recording.id}
                  type="button"
                  aria-label={`Open video: ${recording.title}`}
                  onClick={() => setSelectedRecordingId(recording.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${selectedRecordingId === recording.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                >
                  <div className="flex gap-3">
                    {recording.thumbnailUrl ? (
                      <img src={recording.thumbnailUrl} alt={`${recording.title} thumbnail`} className="h-14 w-24 shrink-0 rounded-md border object-cover" loading="lazy" />
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{recording.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{recording.summary}</p>
                    </div>
                  </div>
                </button>
              ))}
              {filteredRecordings.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No walkthrough videos matched that search. Try “quote”, “import”, “GST”, “time”, or clear the video filters.
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {selectedRecording ? (
            <ProcessWalkthrough
              recording={selectedRecording}
              onOpenArticle={openArticleById}
              onStartTour={launchTour}
            />
          ) : null}
          {selectedPack ? (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Training pack</p>
                  <h2 className="mt-2 text-2xl font-semibold text-foreground">{selectedPack.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{selectedPack.summary}</p>
                </div>
                <Button variant="outline" onClick={() => setSelectedPackId("")}>Back to article view</Button>
              </div>
              <div className="mt-4 space-y-4">
                {packArticles.map((article) => (
                  <div key={article.id} className="rounded-xl border bg-muted/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{article.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{article.summary}</p>
                      </div>
                      <Badge variant="secondary">{article.category}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : selectedArticle ? (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{selectedArticle.category}</Badge>
                      <Badge variant="outline">{toSentenceCase(selectedArticle.type)}</Badge>
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-foreground">{selectedArticle.title}</h2>
                    <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{selectedArticle.summary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedArticle.openRoute ? (
                      <Button variant="outline" size="sm" className="gap-2" asChild>
                        <Link to={selectedArticle.openRoute}>
                          <ExternalLink className="h-4 w-4" />
                          Open screen
                        </Link>
                      </Button>
                    ) : null}
                    {currentArticleTour ? (
                      <Button size="sm" className="gap-2" onClick={() => launchTour(currentArticleTour.id)}>
                        <Map className="h-4 w-4" />
                        Start tour
                      </Button>
                    ) : null}
                    {articleRecordings[0] ? (
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => setSelectedRecordingId(articleRecordings[0].id)}>
                        <Film className="h-4 w-4" />
                        Watch example
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
              {articleRecordings.length ? (
                <Card className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Film className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">Related walkthroughs</h3>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {articleRecordings.slice(0, 4).map((recording) => (
                      <button key={recording.id} type="button" onClick={() => setSelectedRecordingId(recording.id)} className="rounded-xl border px-3 py-3 text-left hover:bg-muted/40">
                        <p className="text-sm font-medium text-foreground">{recording.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{recording.summary}</p>
                      </button>
                    ))}
                  </div>
                </Card>
              ) : null}
              <div className="space-y-4">
                {selectedArticle.sections.map((section) => renderArticleSection(section))}
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Current screen help</h2>
            </div>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              {effectiveScreenContext ? (
                <>
                  <p>{effectiveScreenContext.label}</p>
                  <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => {
                    openArticleDocument(getHelpArticle(effectiveScreenContext.articleId));
                  }}>
                    <BookOpen className="mr-2 h-4 w-4" />
                    Open related article
                  </Button>
                  {effectiveScreenContext.tourId ? (
                    <Button size="sm" className="w-full justify-start" onClick={() => launchTour(effectiveScreenContext.tourId)}>
                      <Map className="mr-2 h-4 w-4" />
                      Start guided tour
                    </Button>
                  ) : null}
                  {screenRecording ? (
                    <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => setSelectedRecordingId(screenRecording.id)}>
                      <Film className="mr-2 h-4 w-4" />
                      Show Me How
                    </Button>
                  ) : null}
                </>
              ) : (
                <p>Use the Help button in the header from any major screen to jump back here with contextual guidance.</p>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Training packs</h2>
            <div className="mt-3 space-y-2">
              {HELP_TRAINING_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelectedPackId(pack.id)}
                  className="w-full rounded-xl border px-3 py-3 text-left hover:bg-muted/40"
                >
                  <p className="font-medium text-foreground">{pack.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pack.summary}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Recent articles</h2>
            <div className="mt-3 space-y-2">
              {recentArticles.length > 0 ? recentArticles.map((article) => (
                <button key={article.id} type="button" onClick={() => openArticleDocument(article)} className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/40">
                  <p className="text-sm font-medium text-foreground">{article.title}</p>
                </button>
              )) : <p className="text-sm text-muted-foreground">Recent help will appear here as people use the Help Centre.</p>}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Popular articles</h2>
            <div className="mt-3 space-y-2">
              {popularArticles.map((article) => (
                <button key={article.id} type="button" onClick={() => openArticleDocument(article)} className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/40">
                  <p className="text-sm font-medium text-foreground">{article.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{article.category}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
