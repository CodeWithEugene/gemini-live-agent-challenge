"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraCaptureProps {
  onCapture: (base64Jpeg: string) => void;
  capturedPhoto: string | null;
  onClear: () => void;
}

export function CameraCapture({ onCapture, capturedPhoto, onClear }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
    } catch {
      setError("Camera access denied. Use file upload instead.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }, []);

  const takeSnapshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];
    onCapture(base64);
    stopCamera();
  }, [onCapture, stopCamera]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      onCapture(base64);
    };
    reader.readAsDataURL(file);
  }, [onCapture]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  if (capturedPhoto) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-border shadow-sm">
        <img
          src={`data:image/jpeg;base64,${capturedPhoto}`}
          alt="Captured"
          className="w-full object-cover max-h-64"
        />
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-2 right-2 rounded-full opacity-90"
          onClick={onClear}
          aria-label="Clear photo"
        >
          <X className="w-4 h-4" />
        </Button>
        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
          Photo ready
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {streaming ? (
        <div className="relative rounded-xl overflow-hidden border border-border shadow-sm">
          <video
            ref={videoRef}
            className="w-full object-cover max-h-64"
            muted
            playsInline
          />
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-3">
            <Button
              onClick={takeSnapshot}
              className="rounded-full gap-2 shadow-lg"
            >
              <Camera className="w-4 h-4" />
              Capture
            </Button>
            <Button
              variant="secondary"
              onClick={stopCamera}
              className="rounded-full shadow-lg"
              aria-label="Cancel camera"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 items-center justify-center border-2 border-dashed border-border rounded-xl p-8 text-center">
          <Camera className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Point your camera at a textbook or homework problem
          </p>
          <div className="flex gap-2 mt-2">
            <Button onClick={startCamera} className="gap-2" variant="default">
              <Camera className="w-4 h-4" />
              Open Camera
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
              Upload Image
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3 h-3" /> Upload instead
          </Button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
