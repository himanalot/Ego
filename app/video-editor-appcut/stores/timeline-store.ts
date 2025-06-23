import { create } from "zustand";

export interface TimelineClip {
  id: string;
  mediaId: string;
  name: string;
  duration: number;
  trimStart?: number; // Time in seconds from the start of the media to start playing
  trimEnd?: number;   // Time in seconds from the start of the media to stop playing
  originalDuration: number; // Original duration before any trimming
  startTime: number; // Position on timeline in seconds
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: "video" | "audio" | "effects";
  clips: TimelineClip[];
}

interface TimelineStore {
  tracks: TimelineTrack[];
  playheadPosition: number; // Current playback position in seconds
  isPlaying: boolean;
  totalDuration: number; // Total timeline duration
  
  // Zoom and scroll state
  zoomLevel: number; // 1.0 = normal, 2.0 = 2x zoom, 0.5 = 0.5x zoom
  scrollPosition: number; // Horizontal scroll position in seconds
  viewportDuration: number; // How many seconds are visible in viewport

  // Actions
  addTrack: (type: "video" | "audio" | "effects") => string;
  removeTrack: (trackId: string) => void;
  addClipToTrack: (trackId: string, clip: Omit<TimelineClip, "id">) => void;
  removeClipFromTrack: (trackId: string, clipId: string) => void;
  moveClipToTrack: (
    fromTrackId: string,
    toTrackId: string,
    clipId: string,
    insertIndex?: number
  ) => void;
  reorderClipInTrack: (
    trackId: string,
    clipId: string,
    newIndex: number
  ) => void;
  trimClip: (
    trackId: string,
    clipId: string,
    trimStart?: number,
    trimEnd?: number
  ) => void;
  splitClip: (trackId: string, clipId: string, splitTime: number) => void;
  setPlayheadPosition: (position: number) => void;
  setIsPlaying: (playing: boolean) => void;
  updateTotalDuration: () => void;
  updateClipStartTime: (fromTrackId: string, toTrackId: string, clipId: string, newStartTime: number) => void;
  
  // Zoom and scroll actions
  setZoomLevel: (level: number) => void;
  setScrollPosition: (position: number) => void;
  setViewportDuration: (duration: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  tracks: [],
  playheadPosition: 0,
  isPlaying: false,
  totalDuration: 0,
  
  // Zoom and scroll initial state
  zoomLevel: 1.0,
  scrollPosition: 0,
  viewportDuration: 60, // Show 60 seconds by default

  addTrack: (type) => {
    const newTrack: TimelineTrack = {
      id: crypto.randomUUID(),
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Track`,
      type,
      clips: [],
    };
    set((state) => ({
      tracks: [...state.tracks, newTrack],
    }));
    return newTrack.id;
  },

  removeTrack: (trackId) => {
    set((state) => ({
      tracks: state.tracks.filter((track) => track.id !== trackId),
    }));
  },

  addClipToTrack: (trackId, clipData) => {
    const state = get();
    
    // Calculate start time based on existing clips in the track
    const track = state.tracks.find(t => t.id === trackId);
    const startTime = track ? 
      track.clips.reduce((maxTime, clip) => Math.max(maxTime, clip.startTime + clip.duration), 0) : 0;

    const newClip: TimelineClip = {
      ...clipData,
      id: crypto.randomUUID(),
      originalDuration: clipData.duration,
      trimStart: 0,
      trimEnd: clipData.duration,
      startTime,
    };

    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? { ...track, clips: [...track.clips, newClip] }
          : track
      ),
    }));
    
    get().updateTotalDuration();
  },

  removeClipFromTrack: (trackId, clipId) => {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              clips: track.clips.filter((clip) => clip.id !== clipId),
            }
          : track
      ),
    }));
    get().updateTotalDuration();
  },

  moveClipToTrack: (fromTrackId, toTrackId, clipId, insertIndex) => {
    set((state) => {
      // Find the clip to move
      const fromTrack = state.tracks.find((track) => track.id === fromTrackId);
      const clipToMove = fromTrack?.clips.find((clip) => clip.id === clipId);

      if (!clipToMove) return state;

      return {
        tracks: state.tracks.map((track) => {
          if (track.id === fromTrackId) {
            // Remove clip from source track
            return {
              ...track,
              clips: track.clips.filter((clip) => clip.id !== clipId),
            };
          } else if (track.id === toTrackId) {
            // Add clip to destination track
            const newClips = [...track.clips];
            const index =
              insertIndex !== undefined ? insertIndex : newClips.length;
            newClips.splice(index, 0, clipToMove);
            return {
              ...track,
              clips: newClips,
            };
          }
          return track;
        }),
      };
    });
    get().updateTotalDuration();
  },

  reorderClipInTrack: (trackId, clipId, newIndex) => {
    set((state) => ({
      tracks: state.tracks.map((track) => {
        if (track.id !== trackId) return track;

        const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
        if (clipIndex === -1) return track;

        const newClips = [...track.clips];
        const [movedClip] = newClips.splice(clipIndex, 1);
        newClips.splice(newIndex, 0, movedClip);

        return { ...track, clips: newClips };
      }),
    }));
    get().updateTotalDuration();
  },

  trimClip: (trackId, clipId, trimStart, trimEnd) => {
    set((state) => ({
      tracks: state.tracks.map((track) => {
        if (track.id !== trackId) return track;

        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) return clip;

            const currentTrimStart = clip.trimStart ?? 0;
            const currentTrimEnd = clip.trimEnd ?? clip.originalDuration;
            
            const newTrimStart = trimStart ?? currentTrimStart;
            const newTrimEnd = trimEnd ?? currentTrimEnd;
            
            // Ensure valid trim values
            const validTrimStart = Math.max(0, Math.min(newTrimStart, clip.originalDuration));
            const validTrimEnd = Math.max(validTrimStart + 0.1, Math.min(newTrimEnd, clip.originalDuration));
            
            const newDuration = validTrimEnd - validTrimStart;
            
            // Only adjust startTime when trimming from the start
            // This keeps the clip in the same position when trimming from the end
            let newStartTime = clip.startTime;
            if (trimStart !== undefined) {
              // When trimming start, move the clip to maintain its visual position
              const trimDelta = validTrimStart - currentTrimStart;
              newStartTime = clip.startTime + trimDelta;
            }
            
            return {
              ...clip,
              trimStart: validTrimStart,
              trimEnd: validTrimEnd,
              duration: newDuration,
              startTime: newStartTime,
            };
          }),
        };
      }),
    }));
    get().updateTotalDuration();
  },

  splitClip: (trackId, clipId, splitTime) => {
    set((state) => ({
      tracks: state.tracks.map((track) => {
        if (track.id !== trackId) return track;

        const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
        if (clipIndex === -1) return track;

        const originalClip = track.clips[clipIndex];
        const actualSplitTime = (originalClip.trimStart ?? 0) + splitTime;

        // Create two new clips
        const firstClip: TimelineClip = {
          ...originalClip,
          id: crypto.randomUUID(),
          name: `${originalClip.name} (1)`,
          trimEnd: actualSplitTime,
          duration: actualSplitTime - (originalClip.trimStart ?? 0),
        };

        const secondClip: TimelineClip = {
          ...originalClip,
          id: crypto.randomUUID(),
          name: `${originalClip.name} (2)`,
          trimStart: actualSplitTime,
          duration: (originalClip.trimEnd ?? originalClip.originalDuration) - actualSplitTime,
          startTime: originalClip.startTime + firstClip.duration,
        };

        const newClips = [...track.clips];
        newClips.splice(clipIndex, 1, firstClip, secondClip);

        return { ...track, clips: newClips };
      }),
    }));
    get().updateTotalDuration();
  },

  setPlayheadPosition: (position) => {
    const state = get();
    const newPosition = Math.max(0, position);
    
    // Auto-extend timeline if playhead gets close to the end (within 30 seconds)
    if (newPosition > state.totalDuration - 30) {
      const extendedDuration = Math.max(state.totalDuration + 60, newPosition + 60);
      set({ 
        playheadPosition: newPosition,
        totalDuration: extendedDuration
      });
    } else {
      set({ playheadPosition: newPosition });
    }
  },

  setIsPlaying: (playing) => {
    set({ isPlaying: playing });
  },

  updateTotalDuration: () => {
    const state = get();
    const maxDuration = state.tracks.reduce((max, track) => {
      const trackDuration = track.clips.reduce((trackMax, clip) => 
        Math.max(trackMax, clip.startTime + clip.duration), 0);
      return Math.max(max, trackDuration);
    }, 0);
    // Set minimum duration to 5 minutes (300 seconds) for continuous playback
    set({ totalDuration: Math.max(maxDuration, 300) });
  },

  updateClipStartTime: (fromTrackId, toTrackId, clipId, newStartTime) => {
    set((state) => {
      // Find the clip to move
      const fromTrack = state.tracks.find((track) => track.id === fromTrackId);
      const clipToMove = fromTrack?.clips.find((clip) => clip.id === clipId);

      if (!clipToMove) return state;

      const updatedClip = { ...clipToMove, startTime: newStartTime };

      return {
        tracks: state.tracks.map((track) => {
          if (track.id === fromTrackId && fromTrackId === toTrackId) {
            // Moving within the same track - just update start time
            return {
              ...track,
              clips: track.clips.map((clip) =>
                clip.id === clipId ? updatedClip : clip
              ),
            };
          } else if (track.id === fromTrackId) {
            // Remove clip from source track
            return {
              ...track,
              clips: track.clips.filter((clip) => clip.id !== clipId),
            };
          } else if (track.id === toTrackId) {
            // Add clip to destination track
            return {
              ...track,
              clips: [...track.clips, updatedClip],
            };
          }
          return track;
        }),
      };
    });
    get().updateTotalDuration();
  },

  // Zoom and scroll methods
  setZoomLevel: (level) => {
    const clampedLevel = Math.max(0.1, Math.min(level, 10)); // Clamp between 0.1x and 10x
    set({ zoomLevel: clampedLevel });
    
    // Update viewport duration based on zoom level
    const baseViewportDuration = 60; // Base duration at 1x zoom
    const newViewportDuration = baseViewportDuration / clampedLevel;
    set({ viewportDuration: newViewportDuration });
    
    // Keep scroll position at 0 when zooming (anchor at beginning)
    set({ scrollPosition: 0 });
  },

  setScrollPosition: (position) => {
    const state = get();
    const maxScroll = Math.max(0, state.totalDuration - state.viewportDuration);
    const clampedPosition = Math.max(0, Math.min(position, maxScroll));
    set({ scrollPosition: clampedPosition });
  },

  setViewportDuration: (duration) => {
    set({ viewportDuration: Math.max(1, duration) });
  },

  zoomIn: () => {
    const state = get();
    const newZoomLevel = Math.min(state.zoomLevel * 1.5, 10);
    get().setZoomLevel(newZoomLevel);
  },

  zoomOut: () => {
    const state = get();
    const newZoomLevel = Math.max(state.zoomLevel / 1.5, 0.1);
    get().setZoomLevel(newZoomLevel);
  },

  resetZoom: () => {
    get().setZoomLevel(1.0);
    set({ scrollPosition: 0 });
  },
}));
