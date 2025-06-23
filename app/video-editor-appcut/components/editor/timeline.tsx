"use client";

import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import {
  Scissors,
  ArrowLeftToLine,
  ArrowRightToLine,
  Trash2,
  Snowflake,
  Copy,
  SplitSquareHorizontal,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "../ui/tooltip";
import { DragOverlay } from "../ui/drag-overlay";
import { useTimelineStore, type TimelineTrack, type TimelineClip } from "../../stores/timeline-store";
import { useMediaStore } from "../../stores/media-store";
import { processMediaFiles } from "../../lib/media-processing";
import { ImageTimelineTreatment } from "../ui/image-timeline-treatment";
import { toast } from "sonner";
import { useState, useRef, useCallback, useEffect } from "react";
import { TimelineClipComponent } from "./timeline-clip";

// Trimming component for individual clips
function ClipTrimHandle({ 
  position, 
  onTrim, 
  clip, 
  trackId 
}: { 
  position: 'start' | 'end'; 
  onTrim: (trackId: string, clipId: string, trimStart?: number, trimEnd?: number) => void;
  clip: TimelineClip;
  trackId: string;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const initialTrim = position === 'start' ? (clip.trimStart ?? 0) : (clip.trimEnd ?? clip.originalDuration);
    
    setIsDragging(true);

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaTime = (deltaX / 400) * 30; // Convert pixels to seconds (assuming 400px = 30 seconds)
      
      if (position === 'start') {
        const newTrimStart = Math.max(0, Math.min(initialTrim + deltaTime, (clip.trimEnd ?? clip.originalDuration) - 0.1));
        onTrim(trackId, clip.id, newTrimStart, undefined);
      } else {
        const newTrimEnd = Math.max((clip.trimStart ?? 0) + 0.1, Math.min(initialTrim + deltaTime, clip.originalDuration));
        onTrim(trackId, clip.id, undefined, newTrimEnd);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position, clip, trackId, onTrim]);

  return (
    <div
      className={`trim-handle absolute top-0 bottom-0 w-3 cursor-col-resize z-20 hover:bg-white/20 transition-colors ${
        position === 'start' ? 'left-0' : 'right-0'
      } ${isDragging ? 'bg-white/30' : ''}`}
      onMouseDown={handleMouseDown}
      style={{
        cursor: position === 'start' ? 'w-resize' : 'e-resize'
      }}
    >
      <div className={`absolute top-1/2 transform -translate-y-1/2 w-1 h-8 bg-white/80 rounded-sm ${
        position === 'start' ? 'left-1' : 'right-1'
      }`} />
    </div>
  );
}

export function Timeline() {
  const { 
    tracks, 
    addTrack, 
    addClipToTrack, 
    trimClip, 
    splitClip, 
    playheadPosition, 
    setPlayheadPosition, 
    totalDuration,
    updateTotalDuration,
    zoomLevel,
    scrollPosition,
    viewportDuration,
    setZoomLevel,
    setScrollPosition,
    zoomIn,
    zoomOut,
    resetZoom
  } = useTimelineStore();
  const { mediaItems, addMediaItem } = useMediaStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const dragCounterRef = useRef(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();

    // Don't show overlay for timeline clips or other internal drags
    if (e.dataTransfer.types.includes("application/x-timeline-clip")) {
      return;
    }

    dragCounterRef.current += 1;
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();

    // Don't update state for timeline clips
    if (e.dataTransfer.types.includes("application/x-timeline-clip")) {
      return;
    }

    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    // Check if this is a timeline clip drop - now we'll handle it!
    const timelineClipData = e.dataTransfer.getData(
      "application/x-timeline-clip"
    );
    if (timelineClipData) {
      // Timeline clips dropped on the main timeline area (not on a specific track)
      // For now, we'll just ignore these - clips should be dropped on specific tracks
      return;
    }

    // Check if this is an internal media item drop
    const mediaItemData = e.dataTransfer.getData("application/x-media-item");
    if (mediaItemData) {
      try {
        const { id, type, name } = JSON.parse(mediaItemData);

        // Find the full media item from the store
        const mediaItem = mediaItems.find((item) => item.id === id);
        if (!mediaItem) {
          toast.error("Media item not found");
          return;
        }

        // Determine track type based on media type
        let trackType: "video" | "audio" | "effects";
        if (type === "video") {
          trackType = "video";
        } else if (type === "audio") {
          trackType = "audio";
        } else {
          // For images, we'll put them on video tracks
          trackType = "video";
        }

        // Create a new track and get its ID
        const newTrackId = addTrack(trackType);

        // Add the clip to the new track
        addClipToTrack(newTrackId, {
          mediaId: mediaItem.id,
          name: mediaItem.name,
          duration: mediaItem.duration || 5, // Default 5 seconds for images
          originalDuration: mediaItem.duration || 5,
          startTime: 0,
        });

        toast.success(`Added ${name} to ${trackType} track`);
      } catch (error) {
        console.error("Error parsing media item data:", error);
        toast.error("Failed to add media to timeline");
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Handle external file drops
      setIsProcessing(true);

      try {
        const processedItems = await processMediaFiles(e.dataTransfer.files);

        for (const processedItem of processedItems) {
          // Add to media store first
          addMediaItem(processedItem);

          // The media item now has an ID, let's get it from the latest state
          // Since addMediaItem is synchronous, we can get the latest item
          const currentMediaItems = useMediaStore.getState().mediaItems;
          const addedItem = currentMediaItems.find(
            (item) =>
              item.name === processedItem.name && item.url === processedItem.url
          );

          if (addedItem) {
            // Determine track type based on media type
            let trackType: "video" | "audio" | "effects";
            if (processedItem.type === "video") {
              trackType = "video";
            } else if (processedItem.type === "audio") {
              trackType = "audio";
            } else {
              // For images, we'll put them on video tracks
              trackType = "video";
            }

            // Create a new track and get its ID
            const newTrackId = addTrack(trackType);

            // Add the clip to the new track
            addClipToTrack(newTrackId, {
              mediaId: addedItem.id,
              name: addedItem.name,
              duration: addedItem.duration || 5, // Default 5 seconds for images
              originalDuration: addedItem.duration || 5,
              startTime: 0,
            });

            toast.success(`Added ${processedItem.name} to timeline`);
          }
        }
      } catch (error) {
        console.error("Error processing external files:", error);
        toast.error("Failed to process dropped files");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Playhead drag handling
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPlayhead(true);

    const handleMouseMove = (e: MouseEvent) => {
      const rulerElement = e.target as HTMLElement;
      const rulerContainer = rulerElement.closest('.flex-1');
      if (!rulerContainer) return;
      
      const rect = rulerContainer.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const timeInViewport = (x / rect.width) * viewportDuration;
      const absoluteTime = Math.max(0, scrollPosition + timeInViewport);
      
      setPlayheadPosition(absoluteTime);
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [viewportDuration, scrollPosition, setPlayheadPosition]);

  // Timeline click to set playhead
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (isDraggingPlayhead) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeInViewport = (x / rect.width) * viewportDuration;
    const absoluteTime = scrollPosition + timeInViewport;
    
    setPlayheadPosition(absoluteTime);
  }, [viewportDuration, scrollPosition, setPlayheadPosition, isDraggingPlayhead]);

  // Wheel handler for zoom and scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Detect trackpad pinch-to-zoom (ctrlKey is automatically set by browser)
    // or intentional Ctrl/Cmd + wheel
    if (e.ctrlKey || e.metaKey) {
      // Prevent default for zoom
      e.preventDefault();
      e.stopPropagation();
      
      // Zoom with Ctrl/Cmd + wheel or trackpad pinch - anchor at beginning (0)
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const currentZoom = useTimelineStore.getState().zoomLevel;
      const newZoomLevel = Math.max(0.1, Math.min(currentZoom * zoomFactor, 10));
      
      setZoomLevel(newZoomLevel);
    } else {
      // Handle scrolling based on direction
      const isHorizontalScroll = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      
      if (isHorizontalScroll) {
        // Horizontal scroll - prevent default and handle timeline navigation
        e.preventDefault();
        e.stopPropagation();
        
        const { scrollPosition: currentScroll, viewportDuration: currentViewport } = useTimelineStore.getState();
        const scrollDelta = e.deltaX * 0.01 * currentViewport;
        setScrollPosition(currentScroll + scrollDelta);
      } else {
        // Vertical scroll - allow normal behavior for track scrolling
        // Don't prevent default, let the ScrollArea handle it
        return;
      }
    }
  }, [setZoomLevel, setScrollPosition]);

  // Keyboard handler to prevent browser zoom shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Prevent browser zoom shortcuts (Ctrl/Cmd + +/-/0)
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault();
      e.stopPropagation();
      
      // Handle our own zoom shortcuts
      if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-') {
        zoomOut();
      } else if (e.key === '0') {
        resetZoom();
      }
    }
  }, [zoomIn, zoomOut, resetZoom]);

  // Prevent multi-touch gestures (pinch-to-zoom) but allow single-touch scrolling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only prevent multi-touch gestures (pinch-to-zoom)
    if (e.touches.length > 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Only prevent multi-touch gestures (pinch-to-zoom)
    if (e.touches.length > 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleGestureStart = useCallback((e: Event) => {
    // Prevent Safari gesture events
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleGestureChange = useCallback((e: Event) => {
    // Prevent Safari gesture events
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleGestureEnd = useCallback((e: Event) => {
    // Prevent Safari gesture events
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Add DOM event listeners for gesture prevention (only for timeline area)
  useEffect(() => {
    const timelineElement = timelineContentRef.current;
    if (!timelineElement) return;

    // Add Safari gesture event listeners (only prevent zoom gestures, not scroll)
    timelineElement.addEventListener('gesturestart', handleGestureStart, { passive: false });
    timelineElement.addEventListener('gesturechange', handleGestureChange, { passive: false });
    timelineElement.addEventListener('gestureend', handleGestureEnd, { passive: false });

    return () => {
      timelineElement.removeEventListener('gesturestart', handleGestureStart);
      timelineElement.removeEventListener('gesturechange', handleGestureChange);
      timelineElement.removeEventListener('gestureend', handleGestureEnd);
    };
  }, [handleGestureStart, handleGestureChange, handleGestureEnd]);

  // Calculate smart tick intervals based on viewport duration
  const getTickInterval = useCallback(() => {
    const duration = viewportDuration;
    
    // Define tick intervals in seconds and their labels
    const intervals = [
      { seconds: 0.1, label: '0.1s' },   // 100ms
      { seconds: 0.5, label: '0.5s' },   // 500ms
      { seconds: 1, label: '1s' },       // 1 second
      { seconds: 5, label: '5s' },       // 5 seconds
      { seconds: 10, label: '10s' },     // 10 seconds
      { seconds: 30, label: '30s' },     // 30 seconds
      { seconds: 60, label: '1m' },      // 1 minute
      { seconds: 300, label: '5m' },     // 5 minutes
      { seconds: 600, label: '10m' },    // 10 minutes
      { seconds: 1800, label: '30m' },   // 30 minutes
      { seconds: 3600, label: '1h' },    // 1 hour
    ];
    
    // Find the best interval that gives us 5-15 major ticks
    const targetTicks = 10;
    const idealInterval = duration / targetTicks;
    
    // Find the closest interval
    let bestInterval = intervals[0];
    for (const interval of intervals) {
      if (interval.seconds <= idealInterval * 1.5) {
        bestInterval = interval;
      } else {
        break;
      }
    }
    
    return bestInterval;
  }, [viewportDuration]);

  const dragProps = {
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  return (
    <div
      ref={timelineRef}
      className={`h-full flex flex-col transition-colors duration-200 relative outline-none focus:ring-2 focus:ring-primary/20 ${
        isDragOver ? "bg-accent/30 border-accent" : ""
      }`}
      tabIndex={0} // Make focusable for keyboard events
      onKeyDown={handleKeyDown}
      {...dragProps}
    >
      <DragOverlay
        isVisible={isDragOver}
        title={isProcessing ? "Processing files..." : "Drop media here"}
        description={
          isProcessing
            ? "Please wait while files are being processed"
            : "Add media to timeline tracks"
        }
      />

      {/* Toolbar */}
      <div className="border-b flex items-center px-2 py-1 gap-1">
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <Scissors className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Split Clip</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <ArrowLeftToLine className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Trim Start</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <ArrowRightToLine className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Trim End</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Duplicate</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <Snowflake className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Freeze Frame</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <SplitSquareHorizontal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Split Screen</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Zoom controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={zoomOut}>
                <span className="text-xs">-</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom Out</p>
            </TooltipContent>
          </Tooltip>

          <span className="text-xs text-muted-foreground px-2">
            {Math.round(zoomLevel * 100)}%
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={zoomIn}>
                <span className="text-xs">+</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom In</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={resetZoom}>
                <span className="text-xs">100%</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reset Zoom</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Timeline Content */}
      <ScrollArea className="flex-1" onWheel={handleWheel}>
        <div 
          ref={timelineContentRef}
          className="relative select-none" 
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          style={{ 
            touchAction: 'pan-y', // Allow vertical scrolling, prevent zoom
            userSelect: 'none',  // Prevent text selection during drag
            WebkitUserSelect: 'none', // Safari
            MozUserSelect: 'none',    // Firefox
            msUserSelect: 'none',     // IE/Edge
            WebkitTouchCallout: 'none', // iOS Safari
            WebkitTapHighlightColor: 'transparent' // Remove tap highlight
          }}
        >
          {/* Timeline Ruler */}
          <div className="flex items-center border-b bg-background/50 sticky top-0 z-10 px-2">
            <div className="w-24 flex-shrink-0 mr-2">
              <span className="text-xs text-muted-foreground">Time</span>
            </div>
            <div className="flex-1 relative h-8 min-w-0 timeline-content-area" onClick={handleTimelineClick}>
              {/* Time markers - smart intervals */}
              <div className="absolute inset-0 overflow-hidden">
                {(() => {
                  const tickInterval = getTickInterval();
                  const majorInterval = tickInterval.seconds;
                  const minorInterval = majorInterval / 5; // 5 minor ticks between major ticks
                  
                  // Calculate how many major ticks we need
                  const majorTickCount = Math.ceil(viewportDuration / majorInterval) + 2;
                  const majorTicks = [];
                  
                  for (let i = 0; i < majorTickCount; i++) {
                    const time = Math.floor(scrollPosition / majorInterval) * majorInterval + (i * majorInterval);
                    
                    if (time < 0) continue;
                    
                    const position = ((time - scrollPosition) / viewportDuration) * 100;
                    
                    // Only show if within viewport
                    if (position < -10 || position > 110) continue;
                    
                    const formatTime = (seconds: number) => {
                      if (seconds < 60) {
                        return `${seconds}s`;
                      } else if (seconds < 3600) {
                        const minutes = Math.floor(seconds / 60);
                        const remainingSeconds = seconds % 60;
                        return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m${remainingSeconds}s`;
                      } else {
                        const hours = Math.floor(seconds / 3600);
                        const minutes = Math.floor((seconds % 3600) / 60);
                        return minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`;
                      }
                    };
                    
                    majorTicks.push(
                      <div
                        key={`major-${i}`}
                        className="absolute top-0 bottom-0 flex flex-col justify-end"
                        style={{ left: `${position}%` }}
                      >
                        <div className="w-px h-4 bg-muted-foreground/60" />
                        <span className="text-xs text-muted-foreground mt-1 absolute whitespace-nowrap" style={{ transform: 'translateX(-50%)' }}>
                          {formatTime(time)}
                        </span>
                      </div>
                    );
                  }
                  
                  // Add minor ticks if the interval is large enough to show them clearly
                  const minorTicks = [];
                  if (majorInterval >= 5) { // Only show minor ticks for intervals >= 5 seconds
                    const minorTickCount = Math.ceil(viewportDuration / minorInterval) + 10;
                    
                    for (let i = 0; i < minorTickCount; i++) {
                      const time = Math.floor(scrollPosition / minorInterval) * minorInterval + (i * minorInterval);
                      
                      if (time < 0 || time % majorInterval === 0) continue; // Skip negative times and major tick positions
                      
                      const position = ((time - scrollPosition) / viewportDuration) * 100;
                      
                      if (position < -5 || position > 105) continue;
                      
                      minorTicks.push(
                        <div
                          key={`minor-${i}`}
                          className="absolute top-0 w-px h-2 bg-muted-foreground/30"
                          style={{ left: `${position}%` }}
                        />
                      );
                    }
                  }
                  
                  return [...majorTicks, ...minorTicks];
                })()}
              </div>
              
              {/* Playhead */}
              {playheadPosition >= scrollPosition && playheadPosition <= scrollPosition + viewportDuration && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 cursor-grab active:cursor-grabbing"
                  style={{ left: `${((playheadPosition - scrollPosition) / viewportDuration) * 100}%` }}
                  onMouseDown={handlePlayheadMouseDown}
                >
                  <div className="absolute -top-1 -left-2 w-4 h-3 bg-red-500 rounded-b-sm shadow-sm" />
                </div>
              )}
            </div>
          </div>

          {/* Tracks */}
          <div 
            className="space-y-2 p-2 relative"
          >
            {/* Playhead line extending through ALL tracks */}
            {playheadPosition >= scrollPosition && playheadPosition <= scrollPosition + viewportDuration && (
              <div className="absolute inset-0 pointer-events-none z-30">
                <div className="flex h-full px-2">
                  <div className="w-24 flex-shrink-0 mr-2" /> {/* Track names space */}
                  <div className="flex-1 relative">
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500/70 pointer-events-none"
                      style={{ left: `${((playheadPosition - scrollPosition) / viewportDuration) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            
            {tracks.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p>No tracks yet. Drop media files to get started.</p>
              </div>
            ) : (
              tracks.map((track) => (
                <TimelineTrackComponent
                  key={track.id}
                  track={track}
                  onTrimClip={trimClip}
                  totalDuration={totalDuration}
                  viewportDuration={viewportDuration}
                  scrollPosition={scrollPosition}
                />
              ))
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function TimelineTrackComponent({ 
  track, 
  onTrimClip,
  totalDuration,
  viewportDuration,
  scrollPosition
}: { 
  track: TimelineTrack;
  onTrimClip: (trackId: string, clipId: string, trimStart?: number, trimEnd?: number) => void;
  totalDuration: number;
  viewportDuration: number;
  scrollPosition: number;
}) {
  const { moveClipToTrack, reorderClipInTrack } = useTimelineStore();
  const { mediaItems } = useMediaStore();
  const [isDropping, setIsDropping] = useState(false);

  const handleClipDragStart = (e: React.DragEvent, clip: TimelineClip) => {
    // Custom drag handling is now done in TimelineClipComponent
    // This is kept for compatibility but may not be used
    e.preventDefault();
  };

  const handleTrackDragOver = (e: React.DragEvent) => {
    e.preventDefault();

    // Only allow timeline clip drops
    if (e.dataTransfer.types.includes("application/x-timeline-clip")) {
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleTrackDragEnter = (e: React.DragEvent) => {
    e.preventDefault();

    // Only handle timeline clip drags
    if (e.dataTransfer.types.includes("application/x-timeline-clip")) {
      setIsDropping(true);
    }
  };

  const handleTrackDragLeave = (e: React.DragEvent) => {
    e.preventDefault();

    // Only handle timeline clip drags
    if (!e.dataTransfer.types.includes("application/x-timeline-clip")) {
      return;
    }

    // Check if we're actually leaving the track area
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    const isActuallyLeaving =
      x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;

    if (isActuallyLeaving) {
      setIsDropping(false);
    }
  };

  const handleTrackDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDropping(false);

    // Only handle timeline clip drags
    if (!e.dataTransfer.types.includes("application/x-timeline-clip")) {
      return;
    }

    const timelineClipData = e.dataTransfer.getData(
      "application/x-timeline-clip"
    );

    if (!timelineClipData) {
      return;
    }

    try {
      const parsedData = JSON.parse(timelineClipData);
      const { clipId, trackId: fromTrackId } = parsedData;

      // Calculate where to position the clip based on mouse position
      const trackContainer = e.currentTarget.querySelector(
        ".track-clips-container"
      ) as HTMLElement;

      if (!trackContainer) {
        return;
      }

      const rect = trackContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      
      // Convert mouse position to time using viewport
      const timeInViewport = (mouseX / rect.width) * viewportDuration;
      const newStartTime = Math.max(0, scrollPosition + timeInViewport);

      // Update the clip's start time
      const { updateClipStartTime } = useTimelineStore.getState();
      updateClipStartTime(fromTrackId, track.id, clipId, newStartTime);

      if (fromTrackId !== track.id) {
        toast.success("Clip moved to different track");
      }
    } catch (error) {
      console.error("Error moving clip:", error);
      toast.error("Failed to move clip");
    }
  };

  return (
    <div className="flex items-center px-2">
      <div className="w-24 text-xs text-muted-foreground flex-shrink-0 mr-2">
        {track.name}
      </div>

      <div
        className={`flex-1 h-[60px] transition-colors timeline-content-area ${
          isDropping ? "bg-accent/50 border-2 border-dashed border-accent" : ""
        }`}
        onDragOver={handleTrackDragOver}
        onDragEnter={handleTrackDragEnter}
        onDragLeave={handleTrackDragLeave}
        onDrop={handleTrackDrop}
      >
        <div className="h-full relative track-clips-container">
          {track.clips.length === 0 ? (
            <div className="h-full w-full rounded-sm border-2 border-dashed border-muted/30 flex items-center justify-center text-xs text-muted-foreground">
              Drop media here
            </div>
          ) : (
            track.clips.map((clip, index) => (
              <TimelineClipComponent
                key={clip.id}
                clip={clip}
                track={track}
                totalDuration={totalDuration}
                viewportDuration={viewportDuration}
                scrollPosition={scrollPosition}
                onTrimClip={onTrimClip}
                onDragStart={handleClipDragStart}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
