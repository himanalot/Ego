'use client';

import React, { useState, useEffect, useRef } from 'react';

interface VideoClip {
  path: string;
  name: string;
  size?: number;
  modified?: string;
  hasMetadata?: boolean;
}

interface TextOverlay {
  id: string;
  text: string;
  x: number; // percentage
  y: number; // percentage
  width: number; // percentage
  height: number; // percentage
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export default function VideoEditorInteractive() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClip, setSelectedClip] = useState<string>('');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [editingOverlay, setEditingOverlay] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Load text overlays for a video
  const loadVideoOverlays = async (videoPath: string) => {
    try {
      const response = await fetch(`/api/save-video-metadata?videoPath=${encodeURIComponent(videoPath)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.metadata && data.metadata.textOverlays) {
          setTextOverlays(data.metadata.textOverlays);
        } else {
          // Create default text overlay if none exists
          const defaultOverlay: TextOverlay = {
            id: 'main-text',
            text: '**Click here to edit text**\n\nAdd your founder story here...',
            x: 10, // 10% from left
            y: 15, // 15% from top
            width: 80, // 80% width
            height: 30, // 30% height
            fontSize: 16,
            color: '#FFFFFF',
            bold: false,
            italic: false
          };
          setTextOverlays([defaultOverlay]);
        }
      }
    } catch (error) {
      console.error('Error loading overlays:', error);
      // Create default overlay on error
      const defaultOverlay: TextOverlay = {
        id: 'main-text',
        text: '**Click here to edit text**\n\nAdd your founder story here...',
        x: 10,
        y: 15,
        width: 80,
        height: 30,
        fontSize: 16,
        color: '#FFFFFF',
        bold: false,
        italic: false
      };
      setTextOverlays([defaultOverlay]);
    }
  };

  // Save text overlays
  const saveVideoOverlays = async (videoPath: string, overlays: TextOverlay[]) => {
    try {
      const response = await fetch('/api/save-video-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoPath,
          textOverlays: overlays,
          textContent: overlays.map(o => o.text).join('\n\n'),
          founderName: 'Founder Story'
        }),
      });

      if (response.ok) {
        console.log('💾 Saved overlays');
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (error) {
      console.error('Error saving overlays:', error);
    }
  };

  // Handle clicking on a text overlay
  const handleOverlayClick = (overlayId: string) => {
    const overlay = textOverlays.find(o => o.id === overlayId);
    if (overlay) {
      setEditingOverlay(overlayId);
      setEditText(overlay.text);
    }
  };

  // Save edited text
  const saveEditedText = () => {
    if (!editingOverlay) return;

    const updatedOverlays = textOverlays.map(overlay => 
      overlay.id === editingOverlay 
        ? { ...overlay, text: editText }
        : overlay
    );
    
    setTextOverlays(updatedOverlays);
    setEditingOverlay(null);
    setEditText('');
    
    // Auto-save
    if (selectedClip) {
      saveVideoOverlays(selectedClip, updatedOverlays);
    }
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingOverlay(null);
    setEditText('');
  };

  // Handle clip selection
  const handleClipChange = (clipPath: string) => {
    setSelectedClip(clipPath);
    loadVideoOverlays(clipPath);
    setEditingOverlay(null);
  };

  // Generate new video with current overlays
  const generateVideo = async () => {
    if (!selectedClip || textOverlays.length === 0) {
      alert('Please select a clip and add text');
      return;
    }

    setIsUpdating(true);
    try {
      // Combine all overlay text
      const combinedText = textOverlays.map(o => o.text).join('\n\n');
      
      const response = await fetch('/api/edit-video-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clipPath: selectedClip,
          storyText: combinedText,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        alert('✅ Video generated successfully!');
        // Optionally switch to the new video
        // setSelectedClip(result.outputPath);
      } else {
        alert('Failed to generate video: ' + result.error);
      }
    } catch (error) {
      console.error('Error generating video:', error);
      alert('Failed to generate video');
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    loadClips();
  }, []);

  useEffect(() => {
    if (selectedClip) {
      loadVideoOverlays(selectedClip);
    }
  }, [selectedClip]);

  const formatText = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Interactive Video Text Editor</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={loadClips}
              className="px-3 py-1.5 bg-gray-700 rounded text-sm hover:bg-gray-600"
            >
              Refresh
            </button>
            {lastUpdated && (
              <span className="text-sm text-green-400">
                Last saved: {lastUpdated}
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
                </div>
              </div>
            ))}
          </div>

          {clips.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              <div className="text-4xl mb-2">📁</div>
              <p className="text-sm">No videos found</p>
            </div>
          )}
        </div>

        {/* Center - Interactive Video Preview */}
        <div className="flex-1 flex flex-col bg-black">
          <div className="flex-1 flex items-center justify-center p-8">
            {selectedClip ? (
              <div 
                ref={containerRef}
                className="relative"
                style={{ aspectRatio: '9/16', height: '70vh' }}
              >
                {/* Video Element */}
                <video
                  ref={videoRef}
                  key={selectedClip}
                  controls
                  className="w-full h-full rounded-lg shadow-2xl object-cover"
                  preload="metadata"
                >
                  <source 
                    src={`/${selectedClip}?v=${Date.now()}`} 
                    type="video/mp4" 
                  />
                  Your browser does not support the video tag.
                </video>

                {/* Interactive Text Overlays */}
                {textOverlays.map((overlay) => (
                  <div
                    key={overlay.id}
                    onClick={() => handleOverlayClick(overlay.id)}
                    className="absolute cursor-pointer bg-black bg-opacity-50 border-2 border-transparent hover:border-blue-400 hover:bg-opacity-70 transition-all duration-200 rounded p-2"
                    style={{
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      width: `${overlay.width}%`,
                      height: `${overlay.height}%`,
                      fontSize: `${overlay.fontSize}px`,
                      color: overlay.color,
                      fontWeight: overlay.bold ? 'bold' : 'normal',
                      fontStyle: overlay.italic ? 'italic' : 'normal',
                      fontFamily: 'NimbusSans, system-ui, -apple-system, sans-serif',
                    }}
                  >
                    <div className="text-xs text-blue-200 mb-1 opacity-0 hover:opacity-100 transition-opacity">
                      Click to edit
                    </div>
                    <div 
                      className="text-sm leading-tight"
                      dangerouslySetInnerHTML={{ __html: formatText(overlay.text) }}
                    />
                  </div>
                ))}

                {/* Editing Modal */}
                {editingOverlay && (
                  <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
                      <h3 className="text-lg font-medium mb-4">Edit Text</h3>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full h-40 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        placeholder="Enter your text..."
                        autoFocus
                      />
                      <div className="text-xs text-gray-400 mt-2 mb-4">
                        Use **bold** and *italic* formatting. {editText.length} characters.
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={saveEditedText}
                          className="flex-1 py-2 bg-blue-600 rounded hover:bg-blue-700 font-medium"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="flex-1 py-2 bg-gray-600 rounded hover:bg-gray-700 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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
                    Editing: <span className="text-white">{selectedClip.split('/').pop()}</span>
                    <span className="ml-4 text-blue-400">
                      {textOverlays.length} text overlay{textOverlays.length !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
              
              {selectedClip && (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={generateVideo}
                    disabled={isUpdating}
                    className={`px-4 py-2 rounded font-medium ${
                      isUpdating
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isUpdating ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Generating...</span>
                      </div>
                    ) : (
                      '🎬 Generate Video'
                    )}
                  </button>
                  
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

        {/* Right Sidebar - Instructions */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
          <h2 className="text-lg font-medium mb-4">How to Use</h2>
          
          <div className="space-y-4 text-sm">
            <div className="p-3 bg-gray-700 rounded">
              <h3 className="font-medium mb-2">🎯 Interactive Editing</h3>
              <div className="text-gray-300 space-y-1 text-xs">
                <p>• Click directly on text overlays in the video</p>
                <p>• Edit text in the popup modal</p>
                <p>• Changes save automatically</p>
                <p>• Generate video when ready</p>
              </div>
            </div>

            <div className="p-3 bg-gray-700 rounded">
              <h3 className="font-medium mb-2">✨ Features</h3>
              <div className="text-gray-300 space-y-1 text-xs">
                <p>• **Bold** and *italic* formatting</p>
                <p>• Visual text positioning</p>
                <p>• Non-destructive editing</p>
                <p>• Auto-save text changes</p>
                <p>• Multiple text overlays</p>
              </div>
            </div>

            <div className="p-3 bg-gray-700 rounded">
              <h3 className="font-medium mb-2">🚀 Workflow</h3>
              <div className="text-gray-300 space-y-1 text-xs">
                <p>1. Select video from library</p>
                <p>2. Click on text overlay to edit</p>
                <p>3. Make changes in popup</p>
                <p>4. Click "Generate Video" when done</p>
                <p>5. Download your final video</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 