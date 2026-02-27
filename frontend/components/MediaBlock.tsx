"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

export type Block =
  | { type: "section_header"; sectionId: number }
  | { type: "text"; sectionId: number; content: string }
  | { type: "image"; sectionId: number; url: string; caption: string }
  | { type: "status"; content: string }
  | { type: "title"; content: string };

interface MediaBlockProps {
  block: Block;
}

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      if (i >= text.length) {
        clearInterval(id);
        return;
      }
      setDisplayed(text.slice(0, ++i));
    }, 18);
    return () => clearInterval(id);
  }, [text]);

  return <span>{displayed}</span>;
}

function ImageBlock({ url, caption }: { url: string; caption: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="animate-fade-in-up">
      <div
        className={`relative rounded-xl overflow-hidden border border-border shadow-sm transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={caption}
          className="w-full object-contain max-h-80 bg-white"
          onLoad={() => setLoaded(true)}
        />
      </div>
      {!loaded && (
        <div className="rounded-xl bg-muted animate-pulse h-56 w-full" />
      )}
      {caption && loaded && (
        <p className="text-xs text-muted-foreground mt-1 italic px-1">{caption}</p>
      )}
    </div>
  );
}

export function MediaBlock({ block }: MediaBlockProps) {
  if (block.type === "title") {
    return (
      <h2 className="text-2xl font-bold tracking-tight text-foreground animate-fade-in-up">
        {block.content}
      </h2>
    );
  }

  if (block.type === "status") {
    return (
      <div className="flex items-center gap-2 animate-fade-in-up">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <span className="text-sm text-muted-foreground">{block.content}</span>
      </div>
    );
  }

  if (block.type === "section_header") {
    return (
      <div className="flex items-center gap-2 animate-fade-in-up pt-2">
        <Badge variant="secondary" className="text-xs">
          Section {block.sectionId}
        </Badge>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }

  if (block.type === "text") {
    return (
      <p className="text-base leading-relaxed text-foreground animate-typewriter">
        <TypewriterText text={block.content} />
      </p>
    );
  }

  if (block.type === "image") {
    return <ImageBlock url={block.url} caption={block.caption} />;
  }

  return null;
}
