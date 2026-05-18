import { useEffect, useState } from "react";
import { Layers3, Link2, LockKeyhole, Plus, Shield, Trash2 } from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import { useAuth } from "@/lib/AuthContext";
import { useModules } from "@/lib/ModuleContext";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";

const EMPTY_FORM = {
  email: "",
  full_name: "",
  role: "member",
};

export default function AccessAdmin() {
  const { user, isAdmin } = useAuth();
  const { moduleConfig, moduleDefinitions, toggleModule } = useModules();
  const [accessUsers, setAccessUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [savingModuleKey, setSavingModuleKey] = useState("");

  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const loadUsers = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const records = await crmApi.access.listUsers();
      setAccessUsers(records);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Access users could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    setSaving(true);
    try {
      await crmApi.access.createUser(form);
      setShowDialog(false);
      setForm(EMPTY_FORM);
      await loadUsers();
      toast({
        title: "User invited",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Invite failed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (record, role) => {
    try {
      await crmApi.access.updateUser(record.id, { role });
      await loadUsers();
      toast({
        title: "Role updated",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Role update failed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  const handleStatusChange = async (record, status) => {
    try {
      await crmApi.access.updateUser(record.id, { status });
      await loadUsers();
      toast({
        title: "Status updated",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Status update failed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  const handleDelete = async (recordId) => {
    const targetUser = accessUsers.find((record) => record.id === recordId);
    const confirmed = window.confirm(`Delete access for ${targetUser?.email || "this user"}?`);
    if (!confirmed) {
      return;
    }

    try {
      await crmApi.access.deleteUser(recordId);
      await loadUsers();
      toast({
        title: "User removed",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <Card className="p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Access Management</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Only CRM admins can invite or revoke users.
          </p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const coreModules = moduleDefinitions.filter((module) => module.group === "core");
  const optionalModules = moduleDefinitions.filter((module) => module.group === "optional");
  const moduleLookup = new Map(moduleDefinitions.map((module) => [module.key, module]));
  const enabledOptionalModules = optionalModules.filter((module) => module.enabled);
  const disabledOptionalModules = optionalModules.filter((module) => !module.enabled);

  const handleModuleToggle = async (moduleKey, enabled) => {
    setSavingModuleKey(moduleKey);
    try {
      await toggleModule(moduleKey, enabled);
      toast({
        title: enabled ? "Module enabled" : "Module disabled",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Module update failed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSavingModuleKey("");
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Access & Modules"
        subtitle="Manage user access and module activation from one place. Toggles persist globally and immediately drive navigation, routes, and shared UI."
        actions={
          <Button onClick={() => setShowDialog(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Invite User
          </Button>
        }
      />
      {loadError ? (
        <Alert className="mb-6 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void loadUsers()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-2xl border-border/80 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Layers3 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Application Modules</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Module state is stored centrally in the database. This layer defines what is core, what is optional, and how dependencies resolve.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {[
              { label: "Total", value: moduleConfig?.summary?.total ?? moduleDefinitions.length },
              { label: "Core", value: moduleConfig?.summary?.core ?? coreModules.length },
              { label: "Optional On", value: moduleConfig?.summary?.enabled_optional ?? enabledOptionalModules.length },
              { label: "Optional Off", value: moduleConfig?.summary?.disabled_optional ?? disabledOptionalModules.length },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border bg-muted/[0.18] p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-2xl border-border/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Core Modules</h2>
            <Badge variant="secondary">
              <LockKeyhole className="mr-1 h-3 w-3" />
              Always On
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            These stay enabled because startup, authentication, timeclock capture, and the staff/job/activity chain must always remain available.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {coreModules.map((module) => (
              <div key={module.key} className="rounded-xl border bg-muted/[0.16] p-4 min-h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{module.label}</p>
                      <Badge variant="secondary">
                        <LockKeyhole className="mr-1 h-3 w-3" />
                        Locked
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                    {module.dependencies?.length ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Depends on: {module.dependencies.map((dependency) => moduleLookup.get(dependency)?.label || dependency).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <Switch checked disabled aria-label={`${module.label} is locked on`} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mb-6 rounded-2xl border-border/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Optional Modules</h2>
          <Badge variant="outline">{enabledOptionalModules.length} enabled</Badge>
          <Badge variant="outline">{disabledOptionalModules.length} disabled</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Toggle non-critical areas on or off here. Required dependencies auto-enable when needed, hard dependents cascade off safely, and optional integrations are called out separately.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {optionalModules.map((module) => {
            const disabledBy = moduleLookup.get(module.disabled_by);
            const dependents = (module.dependents || [])
              .map((dependentKey) => moduleLookup.get(dependentKey)?.label || dependentKey);
            const allDependents = (module.disable_action?.auto_disable || [])
              .map((dependentKey) => moduleLookup.get(dependentKey)?.label || dependentKey);
            const autoEnable = (module.enable_action?.auto_enable || [])
              .map((dependencyKey) => moduleLookup.get(dependencyKey)?.label || dependencyKey);
            const optionalDependencies = (module.optional_dependencies || [])
              .map((dependencyKey) => moduleLookup.get(dependencyKey)?.label || dependencyKey);
            const optionalImpacts = (module.disable_action?.impacted_optional_modules || [])
              .map((dependencyKey) => moduleLookup.get(dependencyKey)?.label || dependencyKey);
            const isSaving = savingModuleKey === module.key;

            return (
              <div key={module.key} className="rounded-xl border p-4 min-h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{module.label}</p>
                      <Badge variant={module.enabled ? "default" : "outline"}>
                        {module.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      {disabledBy ? (
                        <Badge variant="secondary">
                          Blocked by {disabledBy.label}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                    {module.dependencies?.length ? (
                      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Link2 className="h-3 w-3" />
                        Requires {module.dependencies.map((dependency) => moduleLookup.get(dependency)?.label || dependency).join(", ")}
                      </p>
                    ) : null}
                    {optionalDependencies.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Optional integrations: {optionalDependencies.join(", ")}
                      </p>
                    ) : null}
                    {dependents.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Direct dependents: {dependents.join(", ")}
                      </p>
                    ) : null}
                    {autoEnable.length > 0 && !module.enabled ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Turning this on also enables: {autoEnable.join(", ")}
                      </p>
                    ) : null}
                    {allDependents.length > 0 && module.enabled ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Turning this off also disables: {allDependents.join(", ")}
                      </p>
                    ) : null}
                    {optionalImpacts.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Also affects related behaviour in: {optionalImpacts.join(", ")}
                      </p>
                    ) : null}
                    {module.blocking_dependencies?.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Current blocked state: {module.blocking_dependencies.map((dependency) => moduleLookup.get(dependency)?.label || dependency).join(", ")}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Key: {module.key}
                    </p>
                  </div>
                  <Switch
                    checked={module.enabled}
                    disabled={isSaving}
                    aria-label={`Toggle ${module.label}`}
                    onCheckedChange={(checked) => void handleModuleToggle(module.key, checked)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {accessUsers.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No invited users yet"
          description="Invite the first Google account that should be able to use the CRM."
          actionLabel="Invite User"
          onAction={() => setShowDialog(true)}
        />
      ) : (
        <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm">
          <div className="divide-y">
            {accessUsers.map((record) => (
              <div key={record.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[1.7fr_0.7fr_0.7fr_0.9fr_40px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{record.full_name || record.email}</p>
                    <Badge variant={String(record.status || "").toLowerCase() === "active" ? "default" : "secondary"}>
                      {record.status || "invited"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{record.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invited by {record.invited_by_email || user?.email || "admin"}
                    {record.last_login_date ? ` · Last login ${new Date(record.last_login_date).toLocaleString("en-NZ")}` : " · Has not signed in yet"}
                  </p>
                </div>

                <div>
                  <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Role</Label>
                  <Select value={record.role || "member"} onValueChange={(value) => void handleRoleChange(record, value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
                  <Select value={record.status || "invited"} onValueChange={(value) => void handleStatusChange(record, value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invited">Invited</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="revoked">Revoked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-sm text-muted-foreground">
                  {record.google_sub ? "Google linked" : "Waiting for first sign-in"}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void handleDelete(record.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>Invite a user and assign their initial role and access level.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Email *</Label>
              <Input
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="name@gmail.com"
                type="email"
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={form.full_name}
                onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                placeholder="Optional until first sign-in"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(value) => setForm((current) => ({ ...current, role: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleInvite()} disabled={!form.email || saving}>
              {saving ? "Saving…" : "Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
