'use client';

import React, { useState, useEffect } from 'react';

interface VideoClip {
  path: string;
  name: string;
  size?: number;
  modified?: string;
}

export default function VideoEditorSimple() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClip, setSelectedClip] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Load available clips
  const loadClips = async () => {
    setIsLoading(true);
    try {
      console.log('Loading clips...');
      const response = await fetch('/api/list-clips');
      const data = await response.json();
      console.log('Clips data:', data);
      
      if (response.ok && data.success) {
        setClips(data.clips || []);
        if (data.clips?.length > 0 && !selectedClip) {
          setSelectedClip(data.clips[0].path);
          console.log('Selected first clip:', data.clips[0].path);
        }
      } else {
        console.error('Failed to load clips:', data);
      }
    } catch (error) {
      console.error('Error loading clips:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle clip selection change
  const handleClipChange = (clipPath: string) => {
    console.log('Changing clip to:', clipPath);
    setSelectedClip(clipPath);
  };

  useEffect(() => {
    loadClips();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="container mx-auto max-w-4xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            📱 Simple Video Viewer
          </h1>
          <p className="text-lg text-gray-600">
            Testing video loading and selection
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          
          {/* Clip Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select Video Clip</label>
            <select
              value={selectedClip}
              onChange={(e) => handleClipChange(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md"
              disabled={isLoading}
            >
              <option value="">Choose a clip...</option>
              {clips.map((clip) => (
                <option key={clip.path} value={clip.path}>
                  {clip.name} ({clip.size ? (clip.size / 1024 / 1024).toFixed(1) : '?'}MB)
                </option>
              ))}
            </select>
            <button 
              onClick={loadClips} 
              disabled={isLoading}
              className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {isLoading ? 'Loading...' : 'Refresh Clips'}
            </button>
          </div>

          {/* Debug Info */}
          <div className="mb-6 p-4 bg-gray-100 rounded text-sm">
            <h3 className="font-medium mb-2">Debug Info:</h3>
            <p><strong>Total clips:</strong> {clips.length}</p>
            <p><strong>Selected clip:</strong> {selectedClip || 'None'}</p>
            <p><strong>Video URL:</strong> {selectedClip ? `/${selectedClip}` : 'None'}</p>
            {clips.length > 0 && (
              <div className="mt-2">
                <strong>Available clips:</strong>
                <ul className="list-disc ml-4">
                  {clips.map((clip) => (
                    <li key={clip.path}>{clip.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Video Container */}
          <div className="flex justify-center">
            <div 
              className="relative bg-black rounded-lg overflow-hidden"
              style={{ width: '300px', aspectRatio: '9/16' }}
            >
              {selectedClip ? (
                <video
                  key={selectedClip}
                  controls
                  className="w-full h-full object-cover"
                  onLoadStart={() => console.log('Video load started')}
                  onLoadedData={() => console.log('Video loaded data')}
                  onError={(e) => console.error('Video error:', e)}
                >
                  <source src={`/${selectedClip}`} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="flex items-center justify-center h-full text-white">
                  <div className="text-center">
                    <div className="text-4xl mb-4">📹</div>
                    <p>Select a video to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Download Button */}
          {selectedClip && (
            <div className="mt-6 text-center">
              <a
                href={`/${selectedClip}`}
                download={selectedClip.split('/').pop()}
                className="inline-block px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                📥 Download Video
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 