'use client';

import React, { useState, useEffect } from 'react';

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
    ? 'border border-input hover:bg-accent hover:text-accent-foreground' 
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

const Textarea: React.FC<{
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder, className = '' }) => (
  <textarea
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 border-gray-300 ${className}`}
  />
);

const Checkbox: React.FC<{
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}> = ({ id, checked, onCheckedChange }) => (
  <input
    type="checkbox"
    id={id}
    checked={checked}
    onChange={(e) => onCheckedChange(e.target.checked)}
    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
  />
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

const Upload: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

export default function VideoEditor() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClip, setSelectedClip] = useState<string>('');
  const [storyText, setStoryText] = useState('');
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentVideoPath, setCurrentVideoPath] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Load available clips
  const loadClips = async () => {
    try {
      const response = await fetch('/api/list-clips');
      if (response.ok) {
        const data = await response.json();
        setClips(data.clips || []);
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
          bold,
          italic
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

  // Auto-update on text change (with debounce)
  useEffect(() => {
    if (!selectedClip || !storyText.trim()) return;
    
    const timeoutId = setTimeout(() => {
      updateVideoText();
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [storyText, bold, italic]);

  useEffect(() => {
    loadClips();
  }, []);

  const characterCount = storyText.length;
  const wordCount = storyText.trim() ? storyText.trim().split(/\s+/).length : 0;
      const isOptimalLength = characterCount >= 600 && characterCount <= 630;

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Panel - Editor */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Video Text Editor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Clip Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Select Video Clip</label>
                <select
                  value={selectedClip}
                  onChange={(e) => setSelectedClip(e.target.value)}
                  className="w-full p-2 border rounded-md"
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
                  Refresh Clips
                </Button>
              </div>

              {/* Story Text Editor */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Story Text
                  <span className={`ml-2 text-xs ${isOptimalLength ? 'text-green-600' : 'text-orange-600'}`}>
                    {characterCount}/730 chars • {wordCount} words
                  </span>
                </label>
                <Textarea
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  placeholder="Enter your founder story here..."
                  className="min-h-[200px]"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Target: 600-630 characters (90-105 words) • Auto-saves after 1 second
                </div>
              </div>

              {/* Style Options */}
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="bold" 
                    checked={bold}
                    onCheckedChange={(checked) => setBold(checked as boolean)}
                  />
                  <label htmlFor="bold" className="text-sm font-medium">Bold</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="italic" 
                    checked={italic}
                    onCheckedChange={(checked) => setItalic(checked as boolean)}
                  />
                  <label htmlFor="italic" className="text-sm font-medium">Italic</label>
                </div>
              </div>

              {/* Manual Update Button */}
              <Button 
                onClick={updateVideoText}
                disabled={!selectedClip || !storyText.trim() || isUpdating}
                className="w-full"
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Updating Video...
                  </>
                ) : (
                  'Update Video Now'
                )}
              </Button>

              {lastUpdated && (
                <div className="text-xs text-green-600">
                  ✅ Last updated: {lastUpdated}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Preview */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Video Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {currentVideoPath ? (
                <div className="space-y-4">
                  <video
                    key={currentVideoPath} // Force re-render when path changes
                    controls
                    className="w-full max-w-md mx-auto rounded-lg"
                    style={{ aspectRatio: '9/16' }}
                  >
                    <source src={`/${currentVideoPath}`} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                  
                  <div className="text-center space-y-2">
                    <div className="text-sm text-gray-600">
                      Current: {currentVideoPath.split('/').pop()}
                    </div>
                    <Button 
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `/${currentVideoPath}`;
                        link.download = currentVideoPath.split('/').pop() || 'video.mp4';
                        link.click();
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 text-gray-500">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-lg flex items-center justify-center">
                    📹
                  </div>
                  <p>Select a clip and enter text to see preview</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">💡 Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <p>• Text auto-saves 1 second after you stop typing</p>
                              <p>• Aim for 600-630 characters for optimal video formatting</p>
              <p>• Use **bold** and *italic* markdown formatting</p>
              <p>• Videos are saved with timestamp to avoid overwrites</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 