"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startAudioCapture, type AudioCapture } from "@/lib/audio";

interface AudioRecorderProps {
  onChunk: (base64Pcm: string) => void;
  onStop?: () => void;
  disabled?: boolean;
}

export function AudioRecorder({ onChunk, onStop, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);

  const start = useCallback(async () => {
    if (recording) return;
    setError(null);
    try {
      captureRef.current = await startAudioCapture(onChunk);
      setRecording(true);
    } catch (err) {
      setError("Microphone access denied. Please allow mic permissions.");
      console.error("Audio capture start error:", err);
    }
  }, [recording, onChunk]);

  const stop = useCallback(() => {
    if (!recording) return;
    captureRef.current?.stop();
    captureRef.current = null;
    setRecording(false);
    onStop?.();
  }, [recording, onStop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      captureRef.current?.stop();
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
          aria-label="Stop recording"
        >
          <Square className="w-6 h-6 fill-current" />
        </Button>
      ) : (
        <Button
          size="lg"
          onClick={start}
          disabled={disabled}
          className="rounded-full w-16 h-16 p-0"
          aria-label="Start recording"
        >
          <Mic className="w-6 h-6" />
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        {recording ? "Recording… tap to stop" : "Tap to ask"}
      </span>
      {error && <p className="text-xs text-destructive text-center max-w-[200px]">{error}</p>}
    </div>
  );
}
