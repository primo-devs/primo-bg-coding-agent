"use client";

import { useRef } from "react";
import { ActionBar } from "@/components/action-bar";
import { ReasoningEffortPills } from "@/components/reasoning-effort-pills";
import { Combobox, type ComboboxGroup } from "@/components/ui/combobox";
import { FileIcon, ModelIcon, PlusIcon, SendIcon, StopIcon } from "@/components/ui/icons";
import { formatModelNameLower } from "@/lib/format";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";
import type { Artifact } from "@/types/session";
import type { Attachment } from "@open-inspect/shared";

export type PromptAttachmentsProps = {
  items: Attachment[];
  error: string | null;
  onAddFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
};

type SessionPromptComposerProps = {
  session: {
    id: string;
    status: string;
    artifacts: Artifact[];
    onArchive: () => void | Promise<void>;
    onUnarchive: () => void | Promise<void>;
  };
  prompt: {
    value: string;
    isProcessing: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    onSubmit: (e: React.FormEvent) => void;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onStopExecution: () => void;
  };
  attachments: PromptAttachmentsProps;
  model: {
    selectedModel: string;
    reasoningEffort: string | undefined;
    items: ComboboxGroup[];
    onModelChange: (model: string) => void;
    onReasoningEffortChange: (value: string | undefined) => void;
  };
};

function filesFromDataTransfer(items: DataTransferItemList | null, list: FileList | null): File[] {
  const files: File[] = [];
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  if (files.length === 0 && list) {
    files.push(...Array.from(list));
  }
  return files;
}

export function SessionPromptComposer({
  session,
  prompt,
  attachments,
  model,
}: SessionPromptComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = !prompt.isProcessing && (!!prompt.value.trim() || attachments.items.length > 0);

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = filesFromDataTransfer(e.clipboardData.items, null);
    if (files.length > 0) {
      e.preventDefault();
      attachments.onAddFiles(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const files = filesFromDataTransfer(e.dataTransfer.items, e.dataTransfer.files);
    if (files.length > 0) {
      e.preventDefault();
      attachments.onAddFiles(files);
    }
  };

  return (
    <footer className="border-t border-border-muted flex-shrink-0">
      <form onSubmit={prompt.onSubmit} className="max-w-4xl mx-auto p-4 pb-6">
        {/* Action bar above input */}
        <div className="mb-3">
          <ActionBar
            sessionId={session.id}
            sessionStatus={session.status}
            artifacts={session.artifacts}
            onArchive={session.onArchive}
            onUnarchive={session.onUnarchive}
          />
        </div>

        {/* Input container */}
        <div
          className="border border-border bg-input"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {/* Attachment preview chips */}
          {attachments.items.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {attachments.items.map((attachment, index) => (
                <div
                  key={`${attachment.name}-${index}`}
                  className="group relative flex items-center gap-2 border border-border bg-background px-2 py-1"
                >
                  {attachment.type === "image" && attachment.url ? (
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      className="h-8 w-8 object-cover"
                    />
                  ) : (
                    <FileIcon className="h-5 w-5 text-secondary-foreground" />
                  )}
                  <span className="max-w-[10rem] truncate text-xs text-muted-foreground">
                    {attachment.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => attachments.onRemove(index)}
                    className="text-secondary-foreground hover:text-foreground"
                    title="Remove attachment"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <span aria-hidden className="text-sm leading-none">
                      ×
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {attachments.error && (
            <p className="px-4 pt-2 text-xs text-warning">{attachments.error}</p>
          )}

          {/* Text input area with floating action buttons */}
          <div className="relative">
            <textarea
              ref={prompt.inputRef}
              value={prompt.value}
              onChange={prompt.onChange}
              onKeyDown={prompt.onKeyDown}
              onPaste={handlePaste}
              placeholder={
                prompt.isProcessing ? "Type your next message..." : "Ask or build anything"
              }
              className="w-full resize-none bg-transparent px-4 pt-4 pb-12 pl-12 focus:outline-none text-foreground placeholder:text-secondary-foreground"
              rows={3}
            />

            {/* Attach button (bottom-left) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,text/*,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.log,.toml,.ini,.env,.sql"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) attachments.onAddFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-3 left-3 p-2 text-secondary-foreground hover:text-foreground transition"
              title="Attach files"
              aria-label="Attach files"
            >
              <PlusIcon className="w-5 h-5" />
            </button>

            {/* Floating action buttons (bottom-right) */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {prompt.isProcessing && prompt.value.trim() && (
                <span className="text-xs text-warning">Waiting...</span>
              )}
              {prompt.isProcessing && (
                <button
                  type="button"
                  onClick={prompt.onStopExecution}
                  className="p-2 text-destructive hover:bg-destructive-muted transition"
                  title="Stop"
                >
                  <StopIcon className="w-5 h-5" />
                </button>
              )}
              <button
                type="submit"
                disabled={!canSend}
                className="p-2 text-secondary-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition"
                title={
                  prompt.isProcessing && prompt.value.trim()
                    ? "Wait for execution to complete"
                    : `Send (${SHORTCUT_LABELS.SEND_PROMPT})`
                }
                aria-label={
                  prompt.isProcessing && prompt.value.trim()
                    ? "Wait for execution to complete"
                    : `Send (${SHORTCUT_LABELS.SEND_PROMPT})`
                }
              >
                <SendIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Footer row with model selector, reasoning pills, and agent label */}
          <div className="flex flex-col gap-2 px-4 py-2 border-t border-border-muted sm:flex-row sm:items-center sm:justify-between sm:gap-0">
            {/* Left side - Model selector + Reasoning pills */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 min-w-0">
              <Combobox
                value={model.selectedModel}
                onChange={model.onModelChange}
                items={model.items}
                direction="up"
                dropdownWidth="w-56"
                disabled={prompt.isProcessing}
                triggerClassName="flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ModelIcon className="w-3.5 h-3.5" />
                <span className="truncate max-w-[9rem] sm:max-w-none">
                  {formatModelNameLower(model.selectedModel)}
                </span>
              </Combobox>

              {/* Reasoning effort pills */}
              <ReasoningEffortPills
                selectedModel={model.selectedModel}
                reasoningEffort={model.reasoningEffort}
                onSelect={model.onReasoningEffortChange}
                disabled={prompt.isProcessing}
              />
            </div>

            {/* Right side - Agent label */}
            <span className="hidden sm:inline text-sm text-muted-foreground">build agent</span>
          </div>
        </div>
      </form>
    </footer>
  );
}
