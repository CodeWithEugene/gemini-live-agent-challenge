"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Sparkles, Volume2, VolumeX, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CameraCapture } from "@/components/CameraCapture";
import { AudioRecorder } from "@/components/AudioRecorder";
import { ExplainerCanvas } from "@/components/ExplainerCanvas";
import { WSClient, type ServerMessage } from "@/lib/websocket";
import { AudioPlayer } from "@/lib/audio";
import type { Block } from "@/components/MediaBlock";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws";

type AppState = "idle" | "photo_ready" | "streaming" | "done";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WSClient | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------
  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "status":
        setBlocks((prev) => [...prev, { type: "status", content: msg.content }]);
        break;

      case "meta":
        setSubject(msg.subject);
        setTopic(msg.topic);
        break;

      case "title":
        setBlocks((prev) => [...prev, { type: "title", content: msg.content }]);
        break;

      case "section_start":
        setBlocks((prev) => [
          ...prev,
          { type: "section_header", sectionId: msg.section_id },
        ]);
        break;

      case "text":
        setBlocks((prev) => [
          ...prev,
          { type: "text", sectionId: msg.section_id, content: msg.content },
        ]);
        break;

      case "audio":
        if (audioEnabled && playerRef.current) {
          playerRef.current.resume();
          playerRef.current.enqueue(msg.data);
        }
        break;

      case "image_url":
        setBlocks((prev) => [
          ...prev,
          {
            type: "image",
            sectionId: msg.section_id,
            url: msg.url,
            caption: msg.caption,
          },
        ]);
        break;

      case "error":
        setError(msg.content);
        setAppState((s) => (s === "streaming" ? "photo_ready" : s));
        break;

      case "done":
        setAppState("done");
        break;
    }
  }, [audioEnabled]);

  // ---------------------------------------------------------------------------
  // WebSocket lifecycle
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const ws = new WSClient({
      url: WS_URL,
      onMessage: handleMessage,
      onOpen: () => setWsConnected(true),
      onClose: () => setWsConnected(false),
      onError: () => setError("Connection error. Retrying..."),
    });
    ws.connect();
    wsRef.current = ws;

    playerRef.current = new AudioPlayer(24000);

    return () => {
      ws.disconnect();
      playerRef.current?.stop();
    };
  }, [handleMessage]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handlePhotoCapture = useCallback((base64: string) => {
    setCapturedPhoto(base64);
    setAppState("photo_ready");
    setError(null);
    wsRef.current?.sendPhoto(base64);
  }, []);

  const handleClearPhoto = useCallback(() => {
    setCapturedPhoto(null);
    setAppState("idle");
  }, []);

  const handleAskQuestion = useCallback((text: string) => {
    if (!text.trim()) return;
    setBlocks([]);
    setTopic(null);
    setSubject(null);
    setError(null);
    setAppState("streaming");
    wsRef.current?.sendQuestion(text);
  }, []);

  const handleStop = useCallback(() => {
    wsRef.current?.sendStop();
    playerRef.current?.stop();
    playerRef.current = new AudioPlayer(24000);
    setAppState(capturedPhoto ? "photo_ready" : "idle");
  }, [capturedPhoto]);

  const handleReset = useCallback(() => {
    setCapturedPhoto(null);
    setBlocks([]);
    setTopic(null);
    setSubject(null);
    setError(null);
    setAppState("idle");
  }, []);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((v) => !v);
    if (!audioEnabled) playerRef.current?.resume();
  }, [audioEnabled]);

  // ---------------------------------------------------------------------------
  // Voice question text (collected from AudioRecorder stop)
  // ---------------------------------------------------------------------------
  const [pendingQuestion, setPendingQuestion] = useState("");

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const canAsk = appState === "photo_ready" || appState === "done";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight">The Living Textbook</h1>
            {topic && (
              <p className="text-xs text-muted-foreground leading-tight">{subject} · {topic}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={wsConnected ? "default" : "secondary"}
            className="text-xs gap-1"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-green-400" : "bg-muted-foreground"}`} />
            {wsConnected ? "Live" : "Connecting"}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleAudio}
            aria-label={audioEnabled ? "Mute audio" : "Unmute audio"}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          {(blocks.length > 0 || capturedPhoto) && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left panel — input */}
        <aside className="lg:w-80 border-b lg:border-b-0 lg:border-r border-border p-4 flex flex-col gap-4 shrink-0">
          <div>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
              Capture a Problem
            </h2>
            <CameraCapture
              onCapture={handlePhotoCapture}
              capturedPhoto={capturedPhoto}
              onClear={handleClearPhoto}
            />
          </div>

          <Separator />

          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
              Ask Your Question
            </h2>

            {/* Text input option */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. How does photosynthesis work?"
                  value={pendingQuestion}
                  onChange={(e) => setPendingQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canAsk && pendingQuestion.trim()) {
                      handleAskQuestion(pendingQuestion);
                      setPendingQuestion("");
                    }
                  }}
                  disabled={!canAsk}
                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <Button
                  onClick={() => {
                    if (pendingQuestion.trim()) {
                      handleAskQuestion(pendingQuestion);
                      setPendingQuestion("");
                    }
                  }}
                  disabled={!canAsk || !pendingQuestion.trim()}
                  size="sm"
                  className="gap-1 px-3"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Go
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or speak</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="flex justify-center">
                <AudioRecorder
                  onChunk={() => {
                    // Audio chunks not used in text-question mode;
                    // kept for future voice-to-text integration
                  }}
                  onStop={() => {
                    // Voice question via Web Speech API fallback
                    const SpeechRecognition =
                      (window as any).SpeechRecognition ||
                      (window as any).webkitSpeechRecognition;
                    if (!SpeechRecognition) return;
                    const recog = new SpeechRecognition();
                    recog.lang = "en-US";
                    recog.onresult = (e: any) => {
                      const text = e.results[0][0].transcript;
                      if (text && canAsk) {
                        handleAskQuestion(text);
                      }
                    };
                    recog.start();
                  }}
                  disabled={!canAsk}
                />
              </div>
            </div>
          </div>

          {appState === "streaming" && (
            <>
              <Separator />
              <Button variant="outline" onClick={handleStop} className="gap-2 text-sm">
                Stop Generating
              </Button>
            </>
          )}

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {!capturedPhoto && appState === "idle" && (
            <div className="mt-auto text-xs text-muted-foreground bg-muted rounded-lg p-3">
              <p className="font-medium mb-1">How it works</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Snap a photo of your homework or textbook</li>
                <li>Ask a question in text or by voice</li>
                <li>Get a narrated explainer with AI-generated diagrams</li>
              </ol>
            </div>
          )}
        </aside>

        {/* Right panel — explainer canvas */}
        <section className="flex-1 p-4 lg:p-6 overflow-y-auto scrollbar-hide">
          <ExplainerCanvas
            blocks={blocks}
            isStreaming={appState === "streaming"}
          />
        </section>
      </main>
    </div>
  );
}
