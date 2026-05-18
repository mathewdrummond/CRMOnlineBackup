import { useEffect, useMemo, useState } from "react";
import { Database, FolderCog, FolderOpen, FolderPlus, PauseCircle, PlayCircle, RefreshCw, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { crmApi } from "@/api/localApiClient";
import FolderPickerModal from "@/components/ai/FolderPickerModal";
import IndexedFolderCard from "@/components/ai/IndexedFolderCard";

const DEFAULT_SOURCE_FORM = {
  label: "",
  root_path: "",
  enabled: true,
  allowed_extensions: "txt,md,csv,json,xml,html,log,pdf,docx,xlsx,pptx,bxf,mozaik,cnc,cutlist",
  excluded_patterns: ".git/,node_modules/,@eaDir/,#recycle/",
  max_file_size_bytes: 15728640,
  chunk_size: 1200,
  chunk_overlap: 120,
  scan_interval_minutes: 60,
};

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AiKnowledgeIndexing() {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState([]);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [sourceForm, setSourceForm] = useState(DEFAULT_SOURCE_FORM);
  const [saving, setSaving] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sourcesResponse, statusResponse, statsResponse] = await Promise.all([
        crmApi.ai.listKnowledgeSources(),
        crmApi.ai.knowledgeStatus(),
        crmApi.ai.knowledgeStats(),
      ]);
      setSources(Array.isArray(sourcesResponse?.sources) ? sourcesResponse.sources : []);
      setStatus(statusResponse || null);
      setStats(statsResponse || null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to load AI knowledge indexing",
        description: error instanceof Error ? error.message : "Unexpected error.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const queueSummary = useMemo(() => {
    const entries = Array.isArray(status?.queue?.queue) ? status.queue.queue : [];
    return entries.reduce((acc, entry) => acc + Number(entry.count || 0), 0);
  }, [status]);

  const handleCreateSource = async () => {
    setSaving(true);
    try {
      await crmApi.ai.createKnowledgeSource({
        label: sourceForm.label,
        root_path: sourceForm.root_path,
        enabled: sourceForm.enabled,
        allowed_extensions: parseList(sourceForm.allowed_extensions),
        excluded_patterns: parseList(sourceForm.excluded_patterns),
        max_file_size_bytes: Number(sourceForm.max_file_size_bytes || 0),
        chunk_size: Number(sourceForm.chunk_size || 0),
        chunk_overlap: Number(sourceForm.chunk_overlap || 0),
        scan_interval_minutes: Number(sourceForm.scan_interval_minutes || 0),
      });
      setSourceForm(DEFAULT_SOURCE_FORM);
      toast({ title: "Knowledge source added." });
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to add source",
        description: error instanceof Error ? error.message : "Unexpected error.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFolder = (folderPath) => {
    if (editingSource) {
      void handleUpdateSourceFolder(editingSource, folderPath);
      return;
    }
    setSourceForm((current) => ({
      ...current,
      root_path: folderPath,
      label: current.label || folderPath.split("/").filter(Boolean).slice(-1)[0] || "Indexed Folder",
    }));
  };

  const handleUpdateSourceFolder = async (source, folderPath) => {
    try {
      await crmApi.ai.updateKnowledgeSource(source.id, { root_path: folderPath });
      toast({ title: "Knowledge source folder updated." });
      setEditingSource(null);
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to update folder",
        description: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  };

  const handleDeleteSource = async (sourceId) => {
    try {
      await crmApi.ai.deleteKnowledgeSource(sourceId);
      toast({ title: "Knowledge source removed." });
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to remove source",
        description: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  };

  const handleToggleSource = async (source, enabled) => {
    try {
      await crmApi.ai.updateKnowledgeSource(source.id, { enabled });
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to update source",
        description: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  };

  const handleReindex = async (sourceId = "") => {
    try {
      await crmApi.ai.reindexKnowledge(sourceId ? { source_id: sourceId } : {});
      toast({ title: "Reindex queued." });
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to queue reindex",
        description: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  };

  const handlePauseToggle = async (paused) => {
    try {
      await crmApi.ai.pauseKnowledge(paused);
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to update queue state",
        description: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  };

  const handleSearch = async () => {
    const nextQuery = query.trim();
    if (!nextQuery) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await crmApi.ai.knowledgeSearch({
        query: nextQuery,
        limit: 10,
      });
      setSearchResults(Array.isArray(response?.results) ? response.results : []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Knowledge search failed",
        description: error instanceof Error ? error.message : "Unexpected error.",
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <FolderPickerModal
        open={folderPickerOpen}
        onOpenChange={(open) => {
          setFolderPickerOpen(open);
          if (!open) setEditingSource(null);
        }}
        value={editingSource?.root_path || sourceForm.root_path}
        indexedPaths={sources.map((source) => source.root_path)}
        onSelect={handleSelectFolder}
        title={editingSource ? "Change Indexed Folder" : "Add Indexed Folder"}
      />
      <PageHeader
        title="AI Knowledge Indexing"
        subtitle="Configure NAS folders, monitor indexing, and run secure local semantic retrieval."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handlePauseToggle(!status?.paused)}
              disabled={loading}
            >
              {status?.paused ? <PlayCircle className="mr-1.5 h-4 w-4" /> : <PauseCircle className="mr-1.5 h-4 w-4" />}
              {status?.paused ? "Resume Queue" : "Pause Queue"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleReindex()} disabled={loading}>
              <FolderCog className="mr-1.5 h-4 w-4" />
              Reindex All
            </Button>
            <Button type="button" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Refresh
            </Button>
          </div>
        )}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Sources</p>
          <p className="mt-2 text-2xl font-semibold">{Number(stats?.totals?.source_count || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Files Indexed</p>
          <p className="mt-2 text-2xl font-semibold">{Number(stats?.totals?.file_count || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Chunks</p>
          <p className="mt-2 text-2xl font-semibold">{Number(stats?.totals?.chunk_count || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Queue Pending</p>
          <p className="mt-2 text-2xl font-semibold">{queueSummary}</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Add Indexed Folder</h2>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingSource(null);
                setFolderPickerOpen(true);
              }}
            >
              <FolderPlus className="h-4 w-4" />
              Browse Folder
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={sourceForm.label}
                onChange={(event) => setSourceForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Cabinet Archives"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Selected Folder</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={sourceForm.root_path}
                  readOnly
                  placeholder="No NAS folder selected"
                  className="font-mono text-xs"
                  aria-label="Selected indexed folder path"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingSource(null);
                    setFolderPickerOpen(true);
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Folders must be selected from configured NAS allowlisted roots.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Max File Size (bytes)</Label>
                <Input
                  type="number"
                  value={sourceForm.max_file_size_bytes}
                  onChange={(event) => setSourceForm((current) => ({ ...current, max_file_size_bytes: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Scan Interval (min)</Label>
                <Input
                  type="number"
                  value={sourceForm.scan_interval_minutes}
                  onChange={(event) => setSourceForm((current) => ({ ...current, scan_interval_minutes: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Chunk Size</Label>
                <Input
                  type="number"
                  value={sourceForm.chunk_size}
                  onChange={(event) => setSourceForm((current) => ({ ...current, chunk_size: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Chunk Overlap</Label>
                <Input
                  type="number"
                  value={sourceForm.chunk_overlap}
                  onChange={(event) => setSourceForm((current) => ({ ...current, chunk_overlap: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Allowed Extensions (comma-separated)</Label>
              <Textarea
                rows={2}
                value={sourceForm.allowed_extensions}
                onChange={(event) => setSourceForm((current) => ({ ...current, allowed_extensions: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Excluded Paths/Patterns (comma-separated)</Label>
              <Textarea
                rows={2}
                value={sourceForm.excluded_patterns}
                onChange={(event) => setSourceForm((current) => ({ ...current, excluded_patterns: event.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Enable indexing now</p>
                <p className="text-xs text-muted-foreground">Disabled sources remain configured but are not scanned.</p>
              </div>
              <Switch
                checked={Boolean(sourceForm.enabled)}
                onCheckedChange={(checked) => setSourceForm((current) => ({ ...current, enabled: checked }))}
              />
            </div>
            <Button type="button" onClick={() => void handleCreateSource()} disabled={saving || !sourceForm.label || !sourceForm.root_path}>
              {saving ? "Saving..." : "Add Folder Source"}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Configured Sources</h2>
            <Badge variant="secondary">{sources.length}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading sources…</p>
            ) : sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No folder sources configured.</p>
            ) : (
              sources.map((source) => (
                <IndexedFolderCard
                  key={source.id}
                  source={source}
                  onToggle={(nextSource, checked) => void handleToggleSource(nextSource, checked)}
                  onReindex={(sourceId) => void handleReindex(sourceId)}
                  onDelete={(sourceId) => void handleDeleteSource(sourceId)}
                  onChangeFolder={(nextSource) => {
                    setEditingSource(nextSource);
                    setFolderPickerOpen(true);
                  }}
                />
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Knowledge Retrieval Test</h2>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find all historical walnut kitchen installs with curved islands"
            className="max-w-3xl"
          />
          <Button type="button" onClick={() => void handleSearch()} disabled={searching}>
            <Search className="mr-1.5 h-4 w-4" />
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No retrieval results yet.</p>
          ) : (
            searchResults.map((result) => (
              <div key={result.chunk_id || `${result.file_id}:${result.line_start}`} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{result.source_reference || result.relative_path}</p>
                  <Badge variant="outline">{Math.round(Number(result.score || 0) * 100)}%</Badge>
                </div>
                <p className="mt-1 text-sm">{result.snippet || result.chunk_text}</p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
