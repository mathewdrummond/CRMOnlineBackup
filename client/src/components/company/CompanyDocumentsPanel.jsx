import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatFileSize } from "@/lib/attachmentHelpers";
import { ATTACHMENT_ACCEPT, ATTACHMENT_HELP_TEXT } from "@/lib/uploadRules";
import { Copy, Eye, FileText, History, Trash2, UploadCloud } from "lucide-react";
import { formatDate } from "@/lib/helpers";

export default function CompanyDocumentsPanel({
  attachments = [],
  isSupplierCompany = false,
  uploading = false,
  saving = false,
  dragActive = false,
  uploadError = "",
  fileInputRef,
  onSetDragActive,
  onUploadFiles,
  onOpenDocument,
  onOpenVersionDialog,
  onDeleteDocument,
  onCopyLink,
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-sm">Documents</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSupplierCompany ? "Quotes, pricing sheets, terms, and supplier correspondence." : "Upload supporting files for this company record."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Upload the same filename again to store a new version instead of creating a duplicate document card.</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(event) => void onUploadFiles(event.target.files)}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || saving}>
            <UploadCloud className="mr-1.5 h-4 w-4" />
            {uploading ? "Uploading..." : "Upload Documents"}
          </Button>
        </div>
      </div>

      <div
        className={`mt-4 rounded-xl border border-dashed p-5 transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border/70 bg-muted/10"}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!uploading) {
            onSetDragActive(true);
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          onSetDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (uploading) {
            return;
          }
          onSetDragActive(false);
          void onUploadFiles(event.dataTransfer.files);
        }}
      >
        <div className="flex items-start gap-3">
          <UploadCloud className="mt-0.5 h-5 w-5 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{uploading ? "Uploading documents..." : "Drop files here or use Upload Documents"}</p>
            <p className="text-xs text-muted-foreground">{ATTACHMENT_HELP_TEXT}</p>
          </div>
        </div>
      </div>

      {uploadError ? (
        <Alert className="mt-4 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-4 space-y-3">
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded for this company yet.</p>
        ) : (
          attachments.map((attachment) => (
            <div key={attachment.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <p className="truncate font-medium">{attachment.name || "Document"}</p>
                  {Number(attachment.version_count || 1) > 1 ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {Number(attachment.version_count || 1)} versions
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(attachment.updated_date || attachment.created_date)} · {formatFileSize(Number(attachment.size || 0))}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenDocument(attachment)}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Open
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void onCopyLink(attachment)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy Link
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenVersionDialog(attachment)}>
                  <History className="mr-1.5 h-3.5 w-3.5" />
                  Versions
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void onDeleteDocument(attachment)} disabled={saving}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
