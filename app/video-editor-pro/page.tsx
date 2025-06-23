'use client';

import React, { useState, useEffect, useRef } from 'react';

interface VideoClip {
  path: string;
  name: string;
  size?: number;
  modified?: string;
  hasMetadata?: boolean;
}

export default function VideoEditorPro() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClip, setSelectedClip] = useState<string>('');
  const [storyText, setStoryText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [hasMetadata, setHasMetadata] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load available clips
  const loadClips = async () => {
    try {
      const response = await fetch('/api/list-clips');
      if (response.ok) {
        const data = await response.json();
        setClips(data.clips || []);
        if (data.clips?.length > 0 && !selectedClip) {
          setSelectedClip(data.clips[0].path);
        }
      }
    } catch (error) {
      console.error('Failed to load clips:', error);
    }
  };

  // Update video text
  const updateVideoText = async () => {
    if (!selectedClip || !storyText.trim()) {
      alert('Please select a clip and enter story text');
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch('/api/edit-video-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clipPath: selectedClip,
          storyText: storyText.trim(),
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setSelectedClip(result.outputPath);
        setLastUpdated(new Date().toLocaleTimeString());
        // Force video reload
        if (videoRef.current) {
          videoRef.current.load();
        }
      } else {
        alert('Failed to update video: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating video:', error);
      alert('Failed to update video text');
    } finally {
      setIsUpdating(false);
    }
  };

  // Load text metadata for a video
  const loadVideoMetadata = async (videoPath: string) => {
    setIsLoadingMetadata(true);
    try {
      const response = await fetch(`/api/save-video-metadata?videoPath=${encodeURIComponent(videoPath)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.metadata) {
          setStoryText(data.metadata.textContent);
          setHasMetadata(true);
          console.log('📄 Loaded metadata:', data.metadata);
        } else {
          // No metadata found, reset text
          setStoryText('');
          setHasMetadata(false);
        }
      } else {
        setStoryText('');
        setHasMetadata(false);
      }
    } catch (error) {
      console.error('Error loading metadata:', error);
      setStoryText('');
      setHasMetadata(false);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  // Save text metadata
  const saveVideoMetadata = async (videoPath: string, textContent: string) => {
    try {
      const response = await fetch('/api/save-video-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoPath,
          textContent,
          founderName: 'Founder Story', // You could extract this from the story
          originalStory: textContent
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('💾 Saved metadata:', data);
        setHasMetadata(true);
      }
    } catch (error) {
      console.error('Error saving metadata:', error);
    }
  };

  // Handle clip selection change
  const handleClipChange = (clipPath: string) => {
    setSelectedClip(clipPath);
    loadVideoMetadata(clipPath);
  };

  // Save current text as metadata
  const saveCurrentText = async () => {
    if (!selectedClip || !storyText.trim()) {
      alert('Please select a clip and enter story text');
      return;
    }

    await saveVideoMetadata(selectedClip, storyText.trim());
    alert('✅ Text saved! You can now edit it anytime without regenerating the video.');
  };

  useEffect(() => {
    loadClips();
  }, []);

  const characterCount = storyText.length;
  const isOptimalLength = characterCount >= 700 && characterCount <= 730;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Video Text Editor</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={loadClips}
              className="px-3 py-1.5 bg-gray-700 rounded text-sm hover:bg-gray-600"
            >
              Refresh
            </button>
            {lastUpdated && (
              <span className="text-sm text-green-400">
                Last updated: {lastUpdated}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Sidebar - Clip Library */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 p-4">
          <h2 className="text-lg font-medium mb-4">Video Library</h2>
          
          <div className="space-y-2">
            {clips.map((clip) => (
              <div
                key={clip.path}
                onClick={() => handleClipChange(clip.path)}
                className={`p-3 rounded cursor-pointer transition-colors ${
                  selectedClip === clip.path
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm truncate">{clip.name}</div>
                  {clip.hasMetadata && (
                    <div className="text-green-400 text-xs">📄</div>
                  )}
                </div>
                <div className="text-xs text-gray-300 mt-1">
                  {clip.size ? `${(clip.size / 1024 / 1024).toFixed(1)} MB` : 'Unknown size'}
                  {clip.hasMetadata && (
                    <span className="ml-2 text-green-400">• Editable text</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {clips.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              <div className="text-4xl mb-2">📁</div>
              <p className="text-sm">No videos found</p>
              <button
                onClick={loadClips}
                className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
              >
                Refresh to load videos
              </button>
            </div>
          )}
        </div>

        {/* Center - Video Preview */}
        <div className="flex-1 flex flex-col bg-black">
          <div className="flex-1 flex items-center justify-center p-8">
            {selectedClip ? (
              <div className="relative">
                <video
                  ref={videoRef}
                  key={selectedClip}
                  controls
                  className="max-h-[70vh] rounded-lg shadow-2xl"
                  style={{ aspectRatio: '9/16' }}
                  preload="metadata"
                >
                  <source 
                    src={`/${selectedClip}?v=${Date.now()}`} 
                    type="video/mp4" 
                  />
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : (
              <div className="text-center text-gray-400">
                <div className="text-6xl mb-4">🎬</div>
                <h3 className="text-xl mb-2">No Video Selected</h3>
                <p>Choose a video from the library to start editing</p>
              </div>
            )}
          </div>

          {/* Video Controls */}
          <div className="bg-gray-800 px-6 py-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-300">
                {selectedClip && (
                  <>
                    Playing: <span className="text-white">{selectedClip.split('/').pop()}</span>
                  </>
                )}
              </div>
              
              {selectedClip && (
                <div className="flex items-center space-x-3">
                  <a
                    href={`/${selectedClip}`}
                    download={selectedClip.split('/').pop()}
                    className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 text-sm font-medium"
                  >
                    📥 Download
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Text Editor */}
        <div className="w-96 bg-gray-800 border-l border-gray-700 p-4">
          <h2 className="text-lg font-medium mb-4">Text Editor</h2>
          
          <div className="space-y-4">
            {/* Character Count */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-300">Story Text</span>
              <div className="flex items-center space-x-2">
                {isLoadingMetadata && (
                  <div className="text-xs text-blue-400">Loading...</div>
                )}
                {hasMetadata && (
                  <div className="text-xs text-green-400">📄 Has saved text</div>
                )}
                <span className={`font-medium ${isOptimalLength ? 'text-green-400' : 'text-yellow-400'}`}>
                  {characterCount}/730 chars
                </span>
              </div>
            </div>

            {/* Text Area */}
            <textarea
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              placeholder="Enter your founder story here..."
              className="w-full h-80 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isLoadingMetadata}
            />

            {/* Character Count Guide */}
            <div className="text-xs text-gray-400">
                              Target: 600-630 characters for optimal video formatting
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {/* Save Text Button */}
              <button
                onClick={saveCurrentText}
                disabled={!selectedClip || !storyText.trim()}
                className={`w-full py-2 rounded font-medium transition-colors ${
                  !selectedClip || !storyText.trim()
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                💾 Save Text (No Video Generation)
              </button>

              {/* Generate Video Button */}
              <button
                onClick={updateVideoText}
                disabled={!selectedClip || !storyText.trim() || isUpdating}
                className={`w-full py-3 rounded font-medium transition-colors ${
                  isUpdating
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : !selectedClip || !storyText.trim()
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isUpdating ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Generating Video...</span>
                  </div>
                ) : (
                  '🎬 Generate New Video'
                )}
              </button>
            </div>

            {/* Tips */}
            <div className="mt-6 p-3 bg-gray-700 rounded">
              <h3 className="text-sm font-medium mb-2">New Workflow</h3>
              <div className="text-xs text-gray-300 space-y-1">
                <p>• <strong>Save Text:</strong> Stores text without video generation</p>
                <p>• <strong>Generate Video:</strong> Creates new video with current text</p>
                <p>• <strong>Edit Anytime:</strong> Load saved text and modify it</p>
                <p>• <strong>No Re-burning:</strong> Text is stored separately</p>
                <p>• Green dot = Has saved editable text</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 