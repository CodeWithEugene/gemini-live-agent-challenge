"use client";

import { useEffect, useRef } from "react";
import { BookOpen } from "lucide-react";
import { MediaBlock, type Block } from "@/components/MediaBlock";
import { Separator } from "@/components/ui/separator";

interface ExplainerCanvasProps {
  blocks: Block[];
  isStreaming: boolean;
}

export function ExplainerCanvas({ blocks, isStreaming }: ExplainerCanvasProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as content streams in
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [blocks.length]);

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground py-16">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <BookOpen className="w-8 h-8" />
        </div>
        <div className="text-center">
          <p className="font-medium">Your explainer will appear here</p>
          <p className="text-sm mt-1">
            Capture a photo, then ask your question
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto scrollbar-hide pr-1 pb-8">
      {blocks.map((block, i) => (
        <MediaBlock key={i} block={block} />
      ))}

      {isStreaming && (
        <div className="flex items-center gap-2 text-muted-foreground animate-fade-in-up">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
          <span className="text-xs">Generating...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
