import React from "react";
import { toRenderableCoverSrc } from "@/lib/covers";
import { sourceLabel } from "@/lib/metadata";
import { cn } from "@/lib/utils";
import { CoverOptionGrid } from "@/components/CoverOptionGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FileUp, Star } from "lucide-react";
import type { CollectionItem, UploadDraft } from "@/components/uploads/UploadDraftTypes";

export const UploadEditDraftDialog: React.FC<{
  editingDraft: UploadDraft | null;
  onClose: () => void;
  updateDraft: (id: string, patch: Partial<UploadDraft>) => void;
  standardCollections: CollectionItem[];
}> = ({ editingDraft, onClose, updateDraft, standardCollections }) => (
  <Dialog
    open={editingDraft !== null}
    onOpenChange={(open) => { if (!open) onClose(); }}
  >
    {editingDraft && (
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Book Details</DialogTitle>
          <DialogDescription className="truncate">
            {editingDraft.file.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1 overflow-y-auto min-h-0">
          {/* Top: selected cover + fields side by side */}
          <div className="flex gap-4">
            {/* Selected cover preview */}
            <div className="shrink-0 w-24">
              {editingDraft.coverPath ? (
                <img
                  src={toRenderableCoverSrc(editingDraft.coverPath) ?? editingDraft.coverPath}
                  alt=""
                  className="w-full rounded-lg border border-border/40 object-cover aspect-[2/3]"
                />
              ) : (
                <div className="flex w-full aspect-[2/3] items-center justify-center rounded-lg border border-dashed border-border/40 bg-muted/30">
                  <FileUp className="size-5 text-muted-foreground/30" />
                </div>
              )}
            </div>

            {/* Fields */}
            <div className="flex-1 min-w-0 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Title</Label>
                <Input
                  value={editingDraft.title}
                  onChange={(e) => updateDraft(editingDraft.id, { title: e.target.value, titleTouched: true })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Author</Label>
                  <Input
                    value={editingDraft.author}
                    onChange={(e) => updateDraft(editingDraft.id, { author: e.target.value, authorTouched: true })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Series</Label>
                  <Input
                    value={editingDraft.series}
                    onChange={(e) => updateDraft(editingDraft.id, { series: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Description</Label>
                <Textarea
                  rows={2}
                  value={editingDraft.description}
                  onChange={(e) => updateDraft(editingDraft.id, { description: e.target.value, descriptionTouched: true })}
                  className="text-sm resize-none max-h-16"
                />
              </div>
            </div>
          </div>

          {/* Cover alternatives — horizontal strip */}
          {(editingDraft.coverOptions.length > 0 || editingDraft.coverPath) && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Cover options</Label>
              <CoverOptionGrid
                selectedCoverPath={editingDraft.coverPath}
                options={editingDraft.coverOptions.map((option, index) => ({
                  ...option,
                  badgeLabel: index === 0 ? "Default" : "Option",
                  metaLabel: sourceLabel(option.source)
                }))}
                onSelectCover={(coverPath) => updateDraft(editingDraft.id, { coverPath })}
                onClearCover={() => updateDraft(editingDraft.id, { coverPath: "" })}
                clearSelectedLabel="Using title card"
                clearIdleLabel="Remove cover"
                compact
                className="grid-cols-5 sm:grid-cols-6"
              />
            </div>
          )}

          {/* Collections, favorite, done */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
            <div className="flex items-center gap-3 flex-wrap">
              {standardCollections.map((collection) => {
                const selected = editingDraft.collectionIds.includes(collection.id);
                return (
                  <label
                    key={collection.id}
                    className="flex items-center gap-1.5 text-[12px] cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const next = selected
                          ? editingDraft.collectionIds.filter((id) => id !== collection.id)
                          : [...editingDraft.collectionIds, collection.id];
                        updateDraft(editingDraft.id, { collectionIds: next });
                      }}
                      className="rounded border-border accent-primary size-3.5"
                    />
                    <span className="text-muted-foreground">
                      {collection.icon && <span className="mr-0.5">{collection.icon}</span>}
                      {collection.name}
                    </span>
                  </label>
                );
              })}

              <button
                type="button"
                onClick={() => updateDraft(editingDraft.id, { favorite: !editingDraft.favorite })}
                aria-label={editingDraft.favorite ? "Remove from favorites" : "Add to favorites"}
                title={editingDraft.favorite ? "Remove from favorites" : "Add to favorites"}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-md transition-colors duration-150",
                  editingDraft.favorite
                    ? "text-status-queued"
                    : "text-muted-foreground/40 hover:text-muted-foreground"
                )}
              >
                <Star className={cn("size-3.5", editingDraft.favorite && "fill-current")} />
              </button>
            </div>

            <Button
              size="sm"
              onClick={onClose}
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    )}
  </Dialog>
);
