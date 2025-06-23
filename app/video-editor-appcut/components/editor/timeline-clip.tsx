"use client";

import { useState, useCallback } from "react";
import { TimelineClip, TimelineTrack, useTimelineStore } from "../../stores/timeline-store";
import { useMediaStore } from "../../stores/media-store";
import { ImageTimelineTreatment } from "../ui/image-timeline-treatment";

interface TimelineClipComponentProps {
  clip: TimelineClip;
  track: TimelineTrack;
  totalDuration: number;
  viewportDuration: number;
  scrollPosition: number;
  onTrimClip: (trackId: string, clipId: string, trimStart?: number, trimEnd?: number) => void;
  onDragStart: (e: React.DragEvent, clip: TimelineClip) => void;
}

function ClipTrimHandle({ 
  position, 
  onTrim, 
  clip, 
  trackId,
  totalDuration,
  viewportDuration
}: { 
  position: 'start' | 'end'; 
  onTrim: (trackId: string, clipId: string, trimStart?: number, trimEnd?: number) => void;
  clip: TimelineClip;
  trackId: string;
  totalDuration: number;
  viewportDuration: number;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const originalTrimStart = clip.trimStart || 0;
    const originalTrimEnd = clip.trimEnd || clip.originalDuration;
    
    setIsDragging(true);

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      
      // Get the timeline container to calculate proper scaling
      const timelineContainer = document.querySelector('.track-clips-container') as HTMLElement;
      if (!timelineContainer) return;
      
      const containerWidth = timelineContainer.offsetWidth;
      const pixelToTime = viewportDuration / containerWidth; // Use viewportDuration for consistent scaling
      const timeDelta = deltaX * pixelToTime;
      
      if (position === 'start') {
        // Trimming from the start - increase trimStart
        const currentTrimEnd = originalTrimEnd || clip.originalDuration;
        const maxTrimStart = currentTrimEnd - 0.1; // Leave at least 0.1 seconds
        const newTrimStart = Math.max(0, Math.min(originalTrimStart + timeDelta, maxTrimStart));
        onTrim(trackId, clip.id, newTrimStart, originalTrimEnd);
      } else {
        // Trimming from the end - decrease trimEnd (which represents the end time in the source media)
        const currentTrimStart = originalTrimStart || 0;
        const minTrimEnd = currentTrimStart + 0.1; // Leave at least 0.1 seconds
        // For right-side trimming, we want to move the end point
        // If dragging right (positive deltaX), we want to extend the clip (increase trimEnd)
        // If dragging left (negative deltaX), we want to contract the clip (decrease trimEnd)
        const newTrimEnd = Math.max(minTrimEnd, Math.min(originalTrimEnd + timeDelta, clip.originalDuration));
        onTrim(trackId, clip.id, originalTrimStart, newTrimEnd);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position, clip, trackId, onTrim, totalDuration, viewportDuration]);

  return (
    <div
      className={`trim-handle absolute inset-0 cursor-col-resize z-20 hover:bg-white/20 transition-colors ${
        isDragging ? 'bg-white/30' : ''
      }`}
      onMouseDown={handleMouseDown}
      style={{
        cursor: position === 'start' ? 'w-resize' : 'e-resize'
      }}
    >
      <div className={`absolute top-1/2 transform -translate-y-1/2 w-0.5 h-6 bg-white/80 rounded-sm ${
        position === 'start' ? 'left-1' : 'right-1'
      }`} />
    </div>
  );
}

export function TimelineClipComponent({ 
  clip, 
  track, 
  totalDuration, 
  viewportDuration,
  scrollPosition,
  onTrimClip, 
  onDragStart 
}: TimelineClipComponentProps) {
  const { mediaItems } = useMediaStore();
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't start drag if clicking on trim handles
    const target = e.target as HTMLElement;
    if (target.closest('.trim-handle')) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });

    const startX = e.clientX;
    const initialStartTime = clip.startTime;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      
      // Get the timeline container for proper scaling
      const timelineContainer = document.querySelector('.track-clips-container') as HTMLElement;
      if (!timelineContainer) return;
      
      const containerWidth = timelineContainer.offsetWidth;
      const pixelToTime = viewportDuration / containerWidth; // Use viewportDuration for consistent scaling
      const timeDelta = deltaX * pixelToTime;
      
      const newStartTime = Math.max(0, Math.min(initialStartTime + timeDelta, totalDuration - clip.duration));
      
      // Update the clip position in the store
      const { updateClipStartTime } = useTimelineStore.getState();
      updateClipStartTime(track.id, track.id, clip.id, newStartTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [clip, track, totalDuration, viewportDuration]);

  const getTrackColor = (type: string) => {
    switch (type) {
      case "video":
        return "bg-blue-500/20 border-blue-500/30";
      case "audio":
        return "bg-green-500/20 border-green-500/30";
      case "effects":
        return "bg-purple-500/20 border-purple-500/30";
      default:
        return "bg-gray-500/20 border-gray-500/30";
    }
  };

  const renderClipContent = (clip: TimelineClip) => {
    const mediaItem = mediaItems.find((item) => item.id === clip.mediaId);

    if (!mediaItem) {
      return (
        <span className="text-xs text-foreground/80 truncate">{clip.name}</span>
      );
    }

    if (mediaItem.type === "image") {
      return (
        <div className="w-full h-full flex items-center gap-2">
          <div className="w-12 h-8 flex-shrink-0">
            <ImageTimelineTreatment
              src={mediaItem.url}
              alt={mediaItem.name}
              targetAspectRatio={16 / 9}
              className="rounded-sm"
              backgroundType="mirror"
            />
          </div>
          <span className="text-xs text-foreground/80 truncate flex-1">
            {clip.name}
          </span>
        </div>
      );
    }

    if (mediaItem.type === "video" && mediaItem.thumbnailUrl) {
      return (
        <div className="w-full h-full flex items-center gap-2">
          <div className="w-6 h-6 flex-shrink-0">
            <img
              src={mediaItem.thumbnailUrl}
              alt={mediaItem.name}
              className="w-full h-full object-cover rounded-sm"
            />
          </div>
          <span className="text-xs text-foreground/80 truncate flex-1">
            {clip.name}
          </span>
        </div>
      );
    }

    // Fallback for audio or videos without thumbnails
    return (
      <span className="text-xs text-foreground/80 truncate">{clip.name}</span>
    );
  };

  // Calculate positioning using viewport
  const clipStart = clip.startTime;
  const actualDuration = (clip.trimEnd ?? clip.originalDuration) - (clip.trimStart ?? 0);
  const clipEnd = clip.startTime + actualDuration;
  const viewportStart = scrollPosition;
  const viewportEnd = scrollPosition + viewportDuration;
  
  // Only render if clip is visible in viewport
  if (clipEnd < viewportStart || clipStart > viewportEnd) {
    return null;
  }
  
  // Position and size relative to viewport (show full clip, not just visible portion)
  const clipLeftPercent = ((clipStart - scrollPosition) / viewportDuration) * 100;
  const clipWidthPercent = (actualDuration / viewportDuration) * 100;

  return (
    <div
      className={`timeline-clip h-full rounded-sm border cursor-grab active:cursor-grabbing transition-colors ${getTrackColor(track.type)} flex items-center overflow-hidden relative group absolute ${
        isDragging ? 'z-50 shadow-lg' : ''
      }`}
      style={{
        width: `${clipWidthPercent}%`,
        left: `${clipLeftPercent}%`,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Trim handles */}
      <div className="absolute left-0 top-0 bottom-0 w-2 -ml-1">
        <ClipTrimHandle 
          position="start" 
          onTrim={onTrimClip} 
          clip={clip} 
          trackId={track.id}
          totalDuration={totalDuration}
          viewportDuration={viewportDuration}
        />
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-2 -mr-1">
        <ClipTrimHandle 
          position="end" 
          onTrim={onTrimClip} 
          clip={clip} 
          trackId={track.id}
          totalDuration={totalDuration}
          viewportDuration={viewportDuration}
        />
      </div>
      
      {/* Clip content - with padding to avoid trim handles */}
      <div className="flex-1 pointer-events-none px-3 py-2">
        {renderClipContent(clip)}
      </div>
      
      {/* Trim indicators */}
      {(clip.trimStart ?? 0) > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-400/60 z-10" />
      )}
      {(clip.trimEnd ?? clip.originalDuration) < clip.originalDuration && (
        <div className="absolute right-0 top-0 bottom-0 w-1 bg-yellow-400/60 z-10" />
      )}
    </div>
  );
} 