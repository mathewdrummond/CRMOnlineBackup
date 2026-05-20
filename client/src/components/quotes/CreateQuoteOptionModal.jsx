import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function CreateQuoteOptionModal({ open, onOpenChange, quote, onCreate, saving }) {
  const [optionName, setOptionName] = useState("");
  const [description, setDescription] = useState("");
  const submit = async () => {
    await onCreate?.({ option_name: optionName.trim(), option_description: description.trim() });
    setOptionName("");
    setDescription("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create quote option</DialogTitle>
          <DialogDescription>Duplicate {quote?.quote_number || "this quote"} into an independently priced version for the same project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quote-option-name">Option name</Label>
            <Input id="quote-option-name" value={optionName} onChange={(event) => setOptionName(event.target.value)} placeholder="Option B - Veneer" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-option-description">Option notes</Label>
            <Textarea id="quote-option-description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Record what changes in this version." />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={saving || !optionName.trim()}>{saving ? "Creating..." : "Create option"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

