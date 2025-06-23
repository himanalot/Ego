'use client';

import { useState } from 'react';

interface ProcessedClip {
  path: string;
  start: number;
  end: number;
  duration: number;
  score: number;
}

export default function VideoProcessor() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [clips, setClips] = useState<ProcessedClip[]>([]);
  const [error, setError] = useState('');

  const processVideo = async () => {
    if (!youtubeUrl.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setIsProcessing(true);
    setError('');
    setClips([]);
    setProgress('Starting video processing...');

    try {
      const response = await fetch('/api/process-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ youtubeUrl }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.type === 'progress') {
                setProgress(data.message);
              } else if (data.type === 'clips') {
                setClips(data.clips);
                setProgress('Processing complete!');
              } else if (data.type === 'error') {
                setError(data.message);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadClip = (clipPath: string) => {
    const link = document.createElement('a');
    link.href = `/api/download-clip?path=${encodeURIComponent(clipPath)}`;
    link.download = clipPath.split('/').pop() || 'clip.mp4';
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Founder Video Processor
          </h1>
          <p className="text-lg text-gray-600">
            Extract engaging clips from founder interviews automatically
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="space-y-4">
            <div>
              <label htmlFor="youtube-url" className="block text-sm font-medium text-gray-700 mb-2">
                YouTube Interview URL
              </label>
              <div className="flex gap-3">
                <input
                  id="youtube-url"
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={isProcessing}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <button
                  onClick={processVideo}
                  disabled={isProcessing || !youtubeUrl.trim()}
                  className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  {isProcessing ? 'Processing...' : 'Process Video'}
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">How it works:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Downloads the YouTube video</li>
                <li>• Analyzes frames to detect when the founder is speaking</li>
                <li>• Finds continuous segments of at least 7 seconds</li>
                <li>• Extracts the best clips optimized for social media (9:16 format)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {isProcessing && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
              <div>
                <h3 className="font-medium text-gray-900">Processing Video</h3>
                <p className="text-sm text-gray-600">{progress}</p>
              </div>
            </div>
            <div className="mt-4 bg-gray-200 rounded-full h-2">
              <div className="bg-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: '45%' }}></div>
            </div>
          </div>
        )}

        {/* Error Section */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8">
            <div className="flex items-center space-x-2">
              <div className="text-red-500">❌</div>
              <div>
                <h3 className="font-medium text-red-900">Error</h3>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {clips.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Extracted Clips ({clips.length})
            </h2>
            <div className="space-y-4">
              {clips.map((clip, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        Clip {index + 1}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {Math.floor(clip.start / 60)}:{String(Math.floor(clip.start % 60)).padStart(2, '0')} - {Math.floor(clip.end / 60)}:{String(Math.floor(clip.end % 60)).padStart(2, '0')} 
                        ({Math.round(clip.duration)}s)
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                        Score: {clip.score.toFixed(1)}/10
                      </div>
                      <button
                        onClick={() => downloadClip(clip.path)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-500 mb-1">Preview:</p>
                    <video 
                      controls 
                      className="w-full max-w-xs rounded"
                      src={`/api/preview-clip?path=${encodeURIComponent(clip.path)}`}
                    >
                      Your browser does not support video playback.
                    </video>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>
            Powered by OpenAI GPT-4o-mini, FFmpeg, and YouTube • Built for Content Creators
          </p>
        </div>
      </div>
    </div>
  );
} 