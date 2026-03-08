"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioRecorderProps {
  /** Called with the final transcript when the user stops speaking. */
  onTranscript?: (text: string) => void;
  /** Called when recording stops (for backwards compatibility). */
  onStop?: () => void;
  disabled?: boolean;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

/** Error event for Web Speech API; not in default DOM typings. */
interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export function AudioRecorder({ onTranscript, onStop, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<string>("");
  const interimRef = useRef<string>("");
  const recognizerRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const SpeechClass =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  const start = useCallback(() => {
    if (recording || !SpeechClass) {
      if (!SpeechClass) setError("Voice input is not supported in this browser.");
      return;
    }
    setError(null);
    transcriptRef.current = "";
    interimRef.current = "";

    const recog = new SpeechClass() as SpeechRecognitionInstance;
    recog.lang = "en-US";
    recog.continuous = true;
    recog.interimResults = true;

    recog.onresult = (e: SpeechRecognitionEvent) => {
      const results = e.results;
      for (let i = e.resultIndex; i < results.length; i++) {
        const result = results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          transcriptRef.current = (transcriptRef.current + " " + transcript).trim();
          interimRef.current = "";
        } else {
          interimRef.current = transcript;
        }
      }
    };

    recog.onend = () => {
      recognizerRef.current = null;
      setRecording(false);
      onStop?.();
      // Defer so final onresult has time to run (Chrome can fire onend before last onresult)
      const cb = onTranscriptRef.current;
      setTimeout(() => {
        let finalText = transcriptRef.current.trim();
        if (!finalText && interimRef.current.trim()) finalText = interimRef.current.trim();
        if (finalText && cb) cb(finalText);
      }, 150);
    };

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      const err = (e as { error?: string }).error ?? "unknown";
      if (err === "aborted") return;
      if (err === "no-speech") {
        setError("No speech heard. Speak after tapping the mic, then tap stop.");
        return;
      }
      if (err === "not-allowed" || err === "service-not-allowed") {
        setError("Microphone access denied. Allow mic in browser settings.");
        return;
      }
      if (err === "network") {
        setError("Chrome's voice service couldn't connect. Type your question above or try again.");
        return;
      }
      setError("Voice didn't work. Type your question above or try again in Chrome.");
    };

    try {
      recog.start();
      recognizerRef.current = recog;
      setRecording(true);
    } catch (err) {
      setError("Could not start voice input.");
    }
  }, [recording, SpeechClass, onStop]);

  const stop = useCallback(() => {
    if (!recording) return;
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setRecording(false);
  }, [recording]);

  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      {recording ? (
        <Button
          variant="destructive"
          size="lg"
          onClick={stop}
          className="rounded-full w-16 h-16 p-0 animate-pulse-ring"
          aria-label="Stop listening"
        >
          <Square className="w-6 h-6 fill-current" />
        </Button>
      ) : (
        <Button
          size="lg"
          onClick={start}
          disabled={disabled || !SpeechClass}
          className="rounded-full w-16 h-16 p-0"
          aria-label="Ask with your voice"
        >
          <Mic className="w-6 h-6" />
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        {recording ? "Listening… tap when done" : "Tap to ask with voice"}
      </span>
      {!recording && !error && SpeechClass && (
        <span className="text-[10px] text-muted-foreground/80 text-center max-w-[220px]">
          Best in Chrome. Allow mic when prompted; speak clearly, then tap stop.
        </span>
      )}
      {error && (
        <p className="text-xs text-destructive text-center max-w-[240px]">{error}</p>
      )}
    </div>
  );
}
