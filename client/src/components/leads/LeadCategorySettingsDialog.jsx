import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Settings2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import {
  createDraftLeadCategory,
  LEAD_CATEGORY_COLOR_OPTIONS,
  sortLeadCategories,
  validateLeadCategoryDrafts,
} from "@/lib/leadCategories";

function cloneCategory(category, index) {
  return {
    ...category,
    name: String(category?.name || ""),
    color: String(category?.color || "slate"),
    sort_order: Number(category?.sort_order || index),
    is_default: category?.is_default === true,
    is_active: category?.is_active !== false,
    isNew: false,
  };
}

export default function LeadCategorySettingsDialog({
  open,
  onOpenChange,
  categories,
  leadCounts,
  onSave,
  saving = false,
}) {
  const [draftCategories, setDraftCategories] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftCategories(sortLeadCategories(categories).map((category, index) => cloneCategory(category, index)));
    setError("");
  }, [categories, open]);

  const totalAssigned = useMemo(
    () => draftCategories.reduce((sum, category) => sum + Number(leadCounts?.[category.id] || 0), 0),
    [draftCategories, leadCounts]
  );

  const updateCategory = (categoryId, patch) => {
    setDraftCategories((current) =>
      current.map((category) => {
        if (category.id !== categoryId) {
          return patch.is_default ? { ...category, is_default: false } : category;
        }

        return {
          ...category,
          ...patch,
        };
      })
    );
    setError("");
  };

  const addCategory = () => {
    setDraftCategories((current) => [
      ...current,
      createDraftLeadCategory(current.length),
    ]);
    setError("");
  };

  const moveCategory = (index, direction) => {
    setDraftCategories((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [category] = next.splice(index, 1);
      next.splice(nextIndex, 0, category);
      return next.map((item, itemIndex) => ({ ...item, sort_order: itemIndex }));
    });
    setError("");
  };

  const removeCategory = (categoryId) => {
    setDraftCategories((current) => {
      const next = current.filter((category) => category.id !== categoryId);
      const normalized = next.map((category, index) => ({ ...category, sort_order: index }));
      if (normalized.length > 0 && !normalized.some((category) => category.is_default)) {
        normalized[0] = {
          ...normalized[0],
          is_default: true,
        };
      }
      return normalized;
    });
    setError("");
  };

  const submitChanges = () => {
    const validation = validateLeadCategoryDrafts(draftCategories);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    onSave?.(validation.categories);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Manage Lead Categories
          </DialogTitle>
          <DialogDescription>
            Add, rename, reorder, recolour, and remove the categories used across the Leads workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {draftCategories.length} categories configured · {totalAssigned} leads assigned
          </div>

          <div className="space-y-3">
            {draftCategories.map((category, index) => (
              <div key={category.id} className="rounded-xl border bg-card/90 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_200px_150px_auto] lg:items-end">
                  <div className="space-y-2">
                    <Label htmlFor={`lead-category-name-${category.id}`}>Name</Label>
                    <Input
                      id={`lead-category-name-${category.id}`}
                      value={category.name}
                      placeholder="e.g. Kitchens"
                      onChange={(event) => updateCategory(category.id, { name: event.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`lead-category-color-${category.id}`}>Colour</Label>
                    <Select
                      value={category.color || "slate"}
                      onValueChange={(value) => updateCategory(category.id, { color: value })}
                    >
                      <SelectTrigger id={`lead-category-color-${category.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_CATEGORY_COLOR_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Preview</Label>
                    <div className="flex min-h-10 items-center gap-2 rounded-lg border border-dashed px-3">
                      <StatusBadge label={category.name || "Category"} color={category.color || "slate"} />
                      <span className="text-xs text-muted-foreground">
                        {Number(leadCounts?.[category.id] || 0)} lead{Number(leadCounts?.[category.id] || 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant={category.is_default ? "default" : "outline"}
                      size="icon"
                      onClick={() => updateCategory(category.id, { is_default: true })}
                      aria-label="Set as default category"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => moveCategory(index, -1)} disabled={index === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => moveCategory(index, 1)}
                      disabled={index === draftCategories.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeCategory(category.id)}
                      disabled={draftCategories.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addCategory} className="w-full">
            <Plus className="h-4 w-4" />
            Add Category
          </Button>

          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submitChanges} disabled={saving}>
            {saving ? "Saving..." : "Save Categories"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
