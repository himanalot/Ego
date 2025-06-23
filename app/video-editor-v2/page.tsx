'use client';

import React, { useState, useEffect, useRef } from 'react';

interface VideoClip {
  path: string;
  name: string;
  size?: number;
  modified?: string;
}

// Simple UI components
const Button: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
  children: React.ReactNode;
}> = ({ onClick, disabled, className = '', variant = 'default', size = 'default', children }) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = variant === 'outline' 
    ? 'border border-input hover:bg-accent hover:text-accent-foreground border-gray-300' 
    : 'bg-primary text-primary-foreground hover:bg-primary/90 bg-blue-600 text-white hover:bg-blue-700';
  const sizeClasses = size === 'sm' ? 'h-9 px-3 text-sm' : 'h-10 py-2 px-4';
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${className}`}
    >
      {children}
    </button>
  );
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-lg border bg-card text-card-foreground shadow-sm bg-white border-gray-200 ${className}`}>
    {children}
  </div>
);

const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>
    {children}
  </div>
);

const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h3 className={`text-2xl font-semibold leading-none tracking-tight ${className}`}>
    {children}
  </h3>
);

const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`p-6 pt-0 ${className}`}>
    {children}
  </div>
);

// Icons
const RefreshCw: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const Download: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const Edit: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

export default function VideoEditorV2() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClip, setSelectedClip] = useState<string>('');
  const [currentVideoPath, setCurrentVideoPath] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Sample text overlay for demonstration
  const [overlayText, setOverlayText] = useState(`**Austin Russell** didn't chase trends.

At **25**, he became the world's youngest self-made billionaire.

*How?*

By building tech the world wasn't ready for yet.

At **17**, he filed his first patent. By **18**, he founded Luminar to fix self-driving cars.

He left Stanford with a **$100K** Thiel Fellowship.

Now Luminar powers **Volvo, Mercedes, Toyota**.

In **2020**, it went public — **$1B+** overnight.

*I post young founder success stories daily.*`);

  // Load available clips
  const loadClips = async () => {
    try {
      const response = await fetch('/api/list-clips');
      if (response.ok) {
        const data = await response.json();
        setClips(data.clips || []);
        if (data.clips?.length > 0 && !selectedClip) {
          setSelectedClip(data.clips[0].path);
          setCurrentVideoPath(data.clips[0].path);
        }
      }
    } catch (error) {
      console.error('Failed to load clips:', error);
    }
  };

  // Update video text
  const updateVideoText = async (newText: string) => {
    if (!selectedClip || !newText.trim()) return;

    setIsUpdating(true);
    try {
      const response = await fetch('/api/edit-video-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clipPath: selectedClip,
          storyText: newText.trim(),
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setCurrentVideoPath(result.outputPath);
        setLastUpdated(new Date().toLocaleTimeString());
        console.log('✅ Video updated:', result.outputPath);
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

  // Handle clicking on text overlay
  const handleTextClick = () => {
    setIsEditing(true);
    setEditText(overlayText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    }, 100);
  };

  // Handle saving text changes
  const handleSaveText = async () => {
    if (editText !== overlayText) {
      setOverlayText(editText);
      await updateVideoText(editText);
    }
    setIsEditing(false);
  };

  // Handle escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditText(overlayText);
    } else if (e.key === 'Enter' && e.ctrlKey) {
      handleSaveText();
    }
  };

  // Handle clip selection change
  const handleClipChange = (clipPath: string) => {
    setSelectedClip(clipPath);
    setCurrentVideoPath(clipPath);
    // Load the actual text from the video if available
    // For now, we'll use the sample text, but in a real implementation
    // you might want to extract or store the original text
  };

  useEffect(() => {
    loadClips();
  }, []);

  const characterCount = editText.length;
  const isOptimalLength = characterCount >= 700 && characterCount <= 730;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto p-4 max-w-6xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            📱 Inline Video Text Editor
          </h1>
          <p className="text-lg text-gray-600">
            Click directly on text to edit it in place - just like Figma or Canva!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Panel - Video Preview with Inline Editing */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>📹 Video Preview</CardTitle>
              </CardHeader>
              <CardContent>
                
                {/* Clip Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Select Video Clip</label>
                  <select
                    value={selectedClip}
                    onChange={(e) => handleClipChange(e.target.value)}
                    className="w-full p-2 border rounded-md border-gray-300"
                  >
                    <option value="">Choose a clip...</option>
                    {clips.map((clip) => (
                      <option key={clip.path} value={clip.path}>
                        {clip.name}
                      </option>
                    ))}
                  </select>
                  <Button 
                    onClick={loadClips} 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>

                {/* Video Container with Text Overlay */}
                <div 
                  ref={videoContainerRef}
                  className="relative bg-black rounded-lg overflow-hidden"
                  style={{ aspectRatio: '9/16', maxWidth: '300px', margin: '0 auto' }}
                >
                  {currentVideoPath ? (
                    <>
                      {/* Video Element */}
                      <video
                        key={currentVideoPath}
                        controls
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                      >
                        <source src={`/${currentVideoPath}?t=${Date.now()}`} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                      
                      {/* Text Overlay */}
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="relative w-full h-full">
                          
                          {/* Clickable Text Overlay */}
                          {!isEditing && (
                            <div
                              onClick={handleTextClick}
                              className="absolute top-20 left-6 right-6 text-white text-sm leading-tight cursor-pointer pointer-events-auto bg-black bg-opacity-30 p-3 rounded-lg hover:bg-opacity-50 transition-all duration-200 border-2 border-transparent hover:border-blue-400"
                              style={{ 
                                fontFamily: 'NimbusSans, Arial, sans-serif',
                                textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                                fontSize: '12px',
                                lineHeight: '1.3'
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-blue-200">Click to edit text</span>
                                <Edit className="w-3 h-3 text-blue-200" />
                              </div>
                              <div 
                                dangerouslySetInnerHTML={{
                                  __html: overlayText
                                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                    .replace(/\n/g, '<br/>')
                                }}
                              />
                            </div>
                          )}

                          {/* Inline Editor */}
                          {isEditing && (
                            <div className="absolute top-20 left-6 right-6 pointer-events-auto">
                              <div className="bg-white rounded-lg shadow-lg border-2 border-blue-500 p-4">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs text-gray-600">
                                    Editing text overlay • {characterCount}/730 chars
                                    <span className={isOptimalLength ? 'text-green-600' : 'text-orange-600'}>
                                      {isOptimalLength ? ' ✓ Optimal' : ''}
                                    </span>
                                  </span>
                                  <div className="text-xs text-gray-500">
                                    Ctrl+Enter to save • Esc to cancel
                                  </div>
                                </div>
                                <textarea
                                  ref={textareaRef}
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={handleKeyDown}
                                  className="w-full h-32 p-2 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter your founder story..."
                                />
                                <div className="flex gap-2 mt-2">
                                  <Button 
                                    onClick={handleSaveText}
                                    disabled={isUpdating}
                                    size="sm"
                                    className="flex-1"
                                  >
                                    {isUpdating ? (
                                      <>
                                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                        Saving...
                                      </>
                                    ) : (
                                      'Save Changes'
                                    )}
                                  </Button>
                                  <Button 
                                    onClick={() => {
                                      setIsEditing(false);
                                      setEditText(overlayText);
                                    }}
                                    variant="outline"
                                    size="sm"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-white">
                      <div className="text-center">
                        <div className="text-4xl mb-4">📹</div>
                        <p>Select a video to start editing</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Download Button */}
                {currentVideoPath && (
                  <div className="mt-4 text-center">
                    <Button 
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `/${currentVideoPath}`;
                        link.download = currentVideoPath.split('/').pop() || 'video.mp4';
                        link.click();
                      }}
                      className="w-full"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Video
                    </Button>
                    {lastUpdated && (
                      <div className="text-xs text-green-600 mt-2">
                        ✅ Last updated: {lastUpdated}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Instructions & Tips */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">🎯 How to Use</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-medium">1</span>
                  <div>
                    <strong>Select a video</strong> from the dropdown above
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-medium">2</span>
                  <div>
                    <strong>Click directly on the text overlay</strong> in the video preview
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-medium">3</span>
                  <div>
                    <strong>Edit the text in place</strong> - no separate panels needed!
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-medium">4</span>
                  <div>
                    <strong>Save with Ctrl+Enter</strong> or click "Save Changes"
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-medium">5</span>
                  <div>
                    <strong>Download</strong> your edited video instantly
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">💡 Pro Tips</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <p>• **Bold text** with double asterisks: `**bold**`</p>
                <p>• *Italic text* with single asterisks: `*italic*`</p>
                <p>• Aim for 600-630 characters for optimal video formatting</p>
                <p>• Press Esc to cancel editing without saving</p>
                <p>• Each edit creates a new timestamped file</p>
                <p>• Hover over text overlay to see edit hint</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">🚀 Why This is Better</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <p>✅ <strong>Visual editing</strong> - see exactly where your text appears</p>
                <p>✅ <strong>Contextual</strong> - edit in the same place you see results</p>
                <p>✅ <strong>Faster workflow</strong> - no switching between panels</p>
                <p>✅ <strong>Familiar UX</strong> - like Figma, Canva, or Google Docs</p>
                <p>✅ <strong>Real-time preview</strong> - no surprises</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
} 