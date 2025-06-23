"use client";

import { useTimelineStore } from "../../stores/timeline-store";
import { useMediaStore } from "../../stores/media-store";
import { ImageTimelineTreatment } from "../ui/image-timeline-treatment";
import { Button } from "../ui/button";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

export function PreviewPanel() {
  const { tracks, playheadPosition, setPlayheadPosition, totalDuration, setIsPlaying: setTimelineIsPlaying, isPlaying: timelineIsPlaying } = useTimelineStore();
  const { mediaItems } = useMediaStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Find the active clip at the current playhead position
  const getActiveClip = () => {
    for (const track of tracks) {
      for (const clip of track.clips) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        // Use more precise comparison to avoid floating point issues
        if (playheadPosition >= clipStart && playheadPosition < clipEnd) {
          const mediaItem = mediaItems.find(item => item.id === clip.mediaId);
          // Only return if the media item still exists
          if (mediaItem) {
            return { clip, mediaItem };
          }
        }
      }
    }
    return null;
  };

  const activeClipData = getActiveClip();
  const activeClip = activeClipData?.clip;
  const activeMediaItem = activeClipData?.mediaItem;

  // Also get the first clip for fallback display when not playing
  const firstClip = tracks[0]?.clips[0];
  const firstMediaItem = firstClip
    ? mediaItems.find((item) => item.id === firstClip.mediaId)
    : null;

  // Timeline playback system
  useEffect(() => {
    if (timelineIsPlaying) {
      // Start continuous playback
      playbackIntervalRef.current = setInterval(() => {
        // Use the store's getState to get current position to avoid stale closure
        const currentStore = useTimelineStore.getState();
        const newPosition = currentStore.playheadPosition + 0.1;
        setPlayheadPosition(newPosition);
      }, 100); // Update every 100ms for smooth playback
    } else {
      // Stop playback
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [timelineIsPlaying, setPlayheadPosition]);

  // Sync local playing state with timeline
  useEffect(() => {
    setIsPlaying(timelineIsPlaying);
  }, [timelineIsPlaying]);

  // Handle play/pause
  const togglePlayback = async () => {
    try {
      setIsLoading(true);
      if (timelineIsPlaying) {
        // Pause timeline playback
        setTimelineIsPlaying(false);
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
      } else {
        // Start timeline playback
        setTimelineIsPlaying(true);
        // If there's an active video clip, play it
        if (videoRef.current && activeClip && activeMediaItem && activeMediaItem.type === 'video') {
          await videoRef.current.play();
        }
      }
    } catch (error) {
      console.error("Error controlling video playback:", error);
      toast.error("Failed to play media. The file format might not be supported.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle mute/unmute
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  // Handle video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      setIsLoading(false);
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };
    
    const handleWaiting = () => {
      setIsLoading(true);
    };
    
    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleError = (e: Event) => {
      console.error("Media error:", e);
      setIsLoading(false);
      toast.error("Error loading media file");
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("error", handleError);
    };
  }, [firstMediaItem]);

  // Reset state when media item changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsLoading(false);
  }, [firstMediaItem]);

  // Sync video with playhead position and handle trimming
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // If there's no active clip, pause the video but don't stop timeline
    if (!activeClip || !activeMediaItem) {
      if (!video.paused) {
        video.pause();
      }
      return;
    }

    // Calculate the actual time in the source media based on playhead and trim
    const clipStartTime = activeClip.startTime;
    const clipEndTime = activeClip.startTime + activeClip.duration;
    
    if (playheadPosition >= clipStartTime && playheadPosition < clipEndTime) {
      // Playhead is within this clip
      const relativeTime = playheadPosition - clipStartTime;
      const sourceTime = (activeClip.trimStart ?? 0) + relativeTime;
      
      // Only update if there's a significant difference to avoid jitter
      if (Math.abs(video.currentTime - sourceTime) > 0.1) {
        video.currentTime = sourceTime;
      }
      
      // If timeline is playing and video is paused, play the video
      if (timelineIsPlaying && video.paused && activeMediaItem.type === 'video') {
        video.play().catch(console.error);
      }
    } else {
      // Playhead is outside this clip, pause the video but keep timeline going
      if (!video.paused) {
        video.pause();
      }
    }
  }, [playheadPosition, activeClip, activeMediaItem, timelineIsPlaying]);

  // Update video currentTime when playhead changes during playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip || !activeMediaItem || !timelineIsPlaying) return;

    // Only sync video time, don't update playhead (timeline controls that now)
    const clipStartTime = activeClip.startTime;
    const clipEndTime = activeClip.startTime + activeClip.duration;
    
    if (playheadPosition >= clipStartTime && playheadPosition < clipEndTime) {
      const relativeTime = playheadPosition - clipStartTime;
      const sourceTime = (activeClip.trimStart ?? 0) + relativeTime;
      
      // Only update if there's a significant difference to avoid jitter
      if (Math.abs(video.currentTime - sourceTime) > 0.2) {
        video.currentTime = sourceTime;
      }
    }
  }, [playheadPosition, activeClip, activeMediaItem, timelineIsPlaying]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const renderPreviewContent = () => {
    // If there's no active clip at playhead position, show black
    if (!activeClip || !activeMediaItem) {
      if (!firstMediaItem) {
        return (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50 group-hover:text-muted-foreground/80 transition-colors">
            Drop media here or click to import
          </div>
        );
      }
      // Show black screen when playhead is on blank space
      return (
        <div className="absolute inset-0 bg-black flex items-center justify-center">
          <div className="text-center">
            <div className="text-white/30 text-sm">Timeline: {formatTime(playheadPosition)}</div>
            <div className="text-white/20 text-xs mt-1">No clip at this position</div>
          </div>
        </div>
      );
    }

    const displayMediaItem = activeMediaItem;

    if (displayMediaItem.type === "image") {
      return (
        <ImageTimelineTreatment
          src={displayMediaItem.url}
          alt={displayMediaItem.name}
          targetAspectRatio={16 / 9}
          className="w-full h-full rounded-lg"
          backgroundType="blur"
        />
      );
    }

    if (displayMediaItem.type === "video") {
      return (
        <video
          ref={videoRef}
          src={displayMediaItem.url}
          className="w-full h-full object-cover rounded-lg"
          controls={false}
          preload="metadata"
          muted={isMuted}
          playsInline
          onLoadedMetadata={() => {
            console.log("Video loaded:", displayMediaItem.name);
          }}
          onError={(e) => {
            console.error("Video error:", e);
            toast.error(`Error loading video: ${displayMediaItem.name}`);
          }}
        />
      );
    }

    if (displayMediaItem.type === "audio") {
      return (
        <>
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-green-500/20 to-emerald-500/20">
            <div className="text-center">
              <div className="text-6xl mb-4">🎵</div>
              <p className="text-muted-foreground">{displayMediaItem.name}</p>
              {duration > 0 && (
                <p className="text-sm text-muted-foreground/70 mt-2">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </p>
              )}
            </div>
          </div>
          <audio
            ref={videoRef as any}
            src={displayMediaItem.url}
            preload="metadata"
            muted={isMuted}
            onLoadedMetadata={() => {
              console.log("Audio loaded:", displayMediaItem.name);
            }}
            onError={(e) => {
              console.error("Audio error:", e);
              toast.error(`Error loading audio: ${displayMediaItem.name}`);
            }}
          />
        </>
      );
    }

    return null;
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div className="aspect-video bg-black/90 w-full max-w-4xl rounded-lg shadow-lg relative group overflow-hidden">
        {renderPreviewContent()}

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-white text-sm">Loading...</div>
          </div>
        )}

        {/* Playback Controls Overlay - Always show when there are tracks */}
        {tracks.length > 0 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2 bg-black/80 rounded-lg px-4 py-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={togglePlayback}
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : timelineIsPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>
              
              {activeMediaItem && (activeMediaItem.type === "video" || activeMediaItem.type === "audio") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={toggleMute}
                >
                  {isMuted ? (
                    <VolumeX className="h-5 w-5" />
                  ) : (
                    <Volume2 className="h-5 w-5" />
                  )}
                </Button>
              )}

              <div className="flex items-center gap-2 text-white text-sm">
                <span>Timeline: {formatTime(playheadPosition)} / {formatTime(totalDuration)}</span>
                {activeClip ? (
                  <span className="text-white/70">
                    • {activeClip.name}
                  </span>
                ) : (
                  <span className="text-white/50">
                    • No active clip
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview Info */}
      {tracks.length > 0 ? (
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground">
            {activeMediaItem ? (
              <>Preview: {activeMediaItem.name}</>
            ) : (
              <>Timeline: {formatTime(playheadPosition)} / {formatTime(totalDuration)}</>
            )}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {timelineIsPlaying ? "Playing timeline" : "Click play to start timeline playback"} • Hover for controls
          </p>
        </div>
      ) : (
        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground">
            Drop media files to get started
          </p>
        </div>
      )}
    </div>
  );
}
