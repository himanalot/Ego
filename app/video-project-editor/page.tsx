'use client';

import React, { useState, useEffect, useRef } from 'react';
import { drawText } from '../../lib/textRenderer'

interface VideoProject {
  name: string;
  projectPath: string;
  projectFile: string;
  renderedVideo: string;
  created: string;
}

interface TextLayer {
  id: string;
  type: string;
  content: string;
  x?: number; // Optional for backward compatibility
  y?: number; // Optional for backward compatibility
  width?: number; // Optional for backward compatibility
  height?: number; // Optional for backward compatibility
  leftMargin: number;
  textTopMargin: number;
  maxWidth: number;
  fontSize: number;
  fontFamily: string;
  fontFamilyBold: string;
  fontFamilyItalic: string;
  fontFamilyBoldItalic: string;
  color: string;
  backgroundColor?: string;
  textAlign?: string;
  verticalAlign?: string;
  lineHeight: number;
  padding?: number;
  borderRadius?: number;
  wordWrap: boolean;
  markdown: boolean;
  textBaseline: string;
  spaceHandling: string;
}

interface ProjectData {
  version: string;
  created: string;
  name: string;
  founderName: string;
  videoLayer: any;
  textLayers: TextLayer[];
  canvas: any;
  export: any;
  selectedClip?: {
    filename: string;
    startTime: number;
    endTime: number;
    duration: number;
    score?: number;
  };
}

export default function VideoProjectEditor() {
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [isRendering, setIsRendering] = useState(false);
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [draggedLayer, setDraggedLayer] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const textCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Load available projects
  const loadProjects = async () => {
    try {
      const response = await fetch('/api/list-video-projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
        if (data.projects?.length > 0 && !selectedProject) {
          setSelectedProject(data.projects[0].name);
        }
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  // Load project data
  const loadProject = async (projectName: string) => {
    try {
      const response = await fetch(`/api/load-video-project?projectName=${encodeURIComponent(projectName)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setProjectData(data.projectData);
        }
      }
    } catch (error) {
      console.error('Failed to load project:', error);
    }
  };

  // Save project data
  const saveProject = async () => {
    if (!selectedProject || !projectData) return;

    try {
      const response = await fetch('/api/save-video-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: selectedProject,
          projectData
        }),
      });

      if (response.ok) {
        console.log('💾 Project saved');
      }
    } catch (error) {
      console.error('Error saving project:', error);
    }
  };

  // Render project to video
  const renderProject = async () => {
    if (!selectedProject || !projectData) return;

    setIsRendering(true);
    try {
      const response = await fetch('/api/render-video-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: selectedProject,
          projectData,
          useSelectedClip: true // Use the selected clip from the genius clip selector
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        alert('✅ Video rendered successfully with selected clip!');
      } else {
        alert('Failed to render video: ' + result.error);
      }
    } catch (error) {
      console.error('Error rendering video:', error);
      alert('Failed to render video');
    } finally {
      setIsRendering(false);
    }
  };

  // Handle text layer click
  const handleLayerClick = (layerId: string) => {
    setSelectedLayer(layerId);
    const layer = projectData?.textLayers.find(l => l.id === layerId);
    if (layer) {
      setEditingText(layer.content);
    }
  };

  // Save text changes
  const saveTextChanges = () => {
    if (!editingLayer || !projectData) return;

    const updatedLayers = projectData.textLayers.map(layer =>
      layer.id === editingLayer
        ? { ...layer, content: editingText }
        : layer
    );

    setProjectData({
      ...projectData,
      textLayers: updatedLayers
    });

    // Update the canvas for the edited layer
    const canvas = textCanvasRefs.current.get(editingLayer);
    if (canvas) {
      const updatedLayer = updatedLayers.find(l => l.id === editingLayer);
      if (updatedLayer) {
        renderTextToCanvas(updatedLayer, canvas);
      }
    }

    setEditingLayer(null);
    setEditingText('');
    saveProject();
  };

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent, layerId: string) => {
    if (!canvasRef.current || !projectData) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const layer = projectData.textLayers.find(l => l.id === layerId);
    if (!layer) return;

    setDraggedLayer(layerId);
    setDragOffset({
      x: e.clientX - rect.left - (layer.leftMargin * rect.width / projectData.canvas.width),
      y: e.clientY - rect.top - (layer.textTopMargin * rect.height / projectData.canvas.height)
    });
  };

  // Handle drag move
  const handleDragMove = (e: React.MouseEvent) => {
    if (!draggedLayer || !canvasRef.current || !projectData) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const newLeftMargin = ((e.clientX - rect.left - dragOffset.x) / rect.width) * projectData.canvas.width;
    const newTextTopMargin = ((e.clientY - rect.top - dragOffset.y) / rect.height) * projectData.canvas.height;

    const updatedLayers = projectData.textLayers.map(layer =>
      layer.id === draggedLayer
        ? { 
            ...layer, 
            leftMargin: Math.max(0, Math.min(projectData.canvas.width - layer.maxWidth, newLeftMargin)), 
            textTopMargin: Math.max(0, Math.min(projectData.canvas.height - 200, newTextTopMargin)) 
          }
        : layer
    );

    setProjectData({
      ...projectData,
      textLayers: updatedLayers
    });
  };

  // Handle drag end
  const handleDragEnd = () => {
    if (draggedLayer) {
      setDraggedLayer(null);
      saveProject();
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Canvas text rendering function that matches the server-side render exactly
  const renderTextToCanvas = (layer: TextLayer, canvasElement: HTMLCanvasElement) => {
    if (!canvasElement || !projectData) return;
    
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    
    // Initial width
    const canvasWidth = layer.maxWidth;
    // First pass: large height to measure
    canvasElement.width = canvasWidth;
    canvasElement.height = 4000; // temp large height for measurement
    ctx.clearRect(0, 0, canvasWidth, canvasElement.height);

    ctx.textBaseline = 'top';
    ctx.fillStyle = layer.color;
    
    // Define token interface
    interface MarkdownToken {
      text: string;
      bold: boolean;
      italic: boolean;
      isLineBreak?: boolean;
    }
    
    // Parse markdown tokens - same logic as server
    const parseMarkdownTokens = (text: string): MarkdownToken[] => {
      const tokens: MarkdownToken[] = [];
      const lines = text.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') {
          tokens.push({ text: '', bold: false, italic: false, isLineBreak: true });
          continue;
        }
        
        let remaining = line;
        while (remaining.length > 0) {
          const boldMatch = remaining.match(/^\*\*(.*?)\*\*/);
          if (boldMatch) {
            tokens.push({ text: boldMatch[1], bold: true, italic: false });
            remaining = remaining.slice(boldMatch[0].length);
            continue;
          }
          
          const italicMatch = remaining.match(/^\*(.*?)\*/);
          if (italicMatch) {
            tokens.push({ text: italicMatch[1], bold: false, italic: true });
            remaining = remaining.slice(italicMatch[0].length);
            continue;
          }
          
          const nextMarkdown = remaining.search(/\*\*/);
          const nextItalic = remaining.search(/\*/);
          let nextSpecial = Math.min(
            nextMarkdown === -1 ? Infinity : nextMarkdown,
            nextItalic === -1 ? Infinity : nextItalic
          );
          
          if (nextSpecial === Infinity) {
            tokens.push({ text: remaining, bold: false, italic: false });
            break;
          } else {
            tokens.push({ text: remaining.slice(0, nextSpecial), bold: false, italic: false });
            remaining = remaining.slice(nextSpecial);
          }
        }
        
        if (i < lines.length - 1) {
          tokens.push({ text: '\n', bold: false, italic: false, isLineBreak: true });
        }
      }
      
      return tokens;
    };
    
    // Font string helper - same as server
    const getFontString = (fontSize: number, bold: boolean, italic: boolean) => {
      const weight = bold ? 'bold' : 'normal';
      const style = italic ? 'italic' : 'normal';
      let family = layer.fontFamily;
      if (bold && italic) family = layer.fontFamilyBoldItalic;
      else if (bold) family = layer.fontFamilyBold;
      else if (italic) family = layer.fontFamilyItalic;
      return `${style} ${weight} ${fontSize}px ${family}`;
    };
    
    // Render text using exact same logic as server
    const bottomY = drawText(ctx, layer.content, {
      x: 0,
      y: 0,
      fontSize: layer.fontSize,
      lineHeight: layer.lineHeight,
      maxWidth: layer.maxWidth,
      color: layer.color,
      fontFamily: layer.fontFamily,
      fontFamilyBold: layer.fontFamilyBold,
      fontFamilyItalic: layer.fontFamilyItalic,
      fontFamilyBoldItalic: layer.fontFamilyBoldItalic
    });

    // Resize canvas to actual content height and redraw
    const neededHeight = Math.ceil(bottomY);
    if (neededHeight !== canvasElement.height) {
      canvasElement.height = neededHeight;
      ctx.clearRect(0, 0, canvasWidth, neededHeight);
      drawText(ctx, layer.content, {
        x: 0,
        y: 0,
        fontSize: layer.fontSize,
        lineHeight: layer.lineHeight,
        maxWidth: layer.maxWidth,
        color: layer.color,
        fontFamily: layer.fontFamily,
        fontFamilyBold: layer.fontFamilyBold,
        fontFamilyItalic: layer.fontFamilyItalic,
        fontFamilyBoldItalic: layer.fontFamilyBoldItalic
      });
    }
  };

  useEffect(() => {
    if (selectedProject) {
      loadProject(selectedProject);
      // Force video reload when project changes
      const video = document.querySelector('video') as HTMLVideoElement;
      if (video) {
        video.load(); // This forces the video to reload with new source
      }
    }
  }, [selectedProject]);
  
  // Update canvas when project data or text content changes
  useEffect(() => {
    const renderAllLayers = async () => {
      // Wait until fonts are fully loaded to ensure accurate measurements
      // This prevents mismatched wrapping caused by fallback fonts
      if (document.fonts && 'ready' in document.fonts) {
        try {
          await (document.fonts as any).ready;
        } catch {
          // Ignore errors – proceed anyway
        }
      }
      if (projectData) {
        projectData.textLayers.forEach(layer => {
          const canvas = textCanvasRefs.current.get(layer.id);
          if (canvas) {
            renderTextToCanvas(layer, canvas);
          }
        });
      }
    };

    renderAllLayers();
  }, [projectData]);

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
          <h1 className="text-xl font-semibold">Video Project Editor</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={loadProjects}
              className="px-3 py-1.5 bg-gray-700 rounded text-sm hover:bg-gray-600"
            >
              Refresh
            </button>
            <button
              onClick={saveProject}
              className="px-3 py-1.5 bg-blue-600 rounded text-sm hover:bg-blue-700"
            >
              💾 Save Project
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Sidebar - Project Library */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 p-4">
          <h2 className="text-lg font-medium mb-4">Project Library</h2>
          
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.name}
                onClick={() => setSelectedProject(project.name)}
                className={`p-3 rounded cursor-pointer transition-colors ${
                  selectedProject === project.name
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <div className="font-medium text-sm truncate">{project.name}</div>
                <div className="text-xs text-gray-300 mt-1">
                  Created: {new Date(project.created).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>

          {projects.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              <div className="text-4xl mb-2">📁</div>
              <p className="text-sm">No projects found</p>
            </div>
          )}
        </div>

        {/* Center - Interactive Canvas */}
        <div className="flex-1 flex flex-col bg-black">
          <div className="flex-1 flex items-center justify-center p-8">
            {projectData ? (
              <div 
                ref={canvasRef}
                className="relative bg-black rounded-lg shadow-2xl"
                style={{ aspectRatio: '9/16', height: '70vh' }}
                onMouseMove={handleDragMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
              >
                {/* Video Background - styled exactly like final output */}
                <div className="w-full h-full bg-black rounded-lg relative overflow-hidden">
                  <video
                    key={selectedProject} // This forces React to recreate the video element when project changes
                    controls
                    className="absolute"
                    style={{
                      width: projectData ? `${(projectData.videoLayer.targetWidth / projectData.videoLayer.canvasWidth) * 100}%` : '95%',
                      height: 'auto',
                      aspectRatio: '16/9',
                      left: '50%',
                      bottom: projectData ? `${(projectData.videoLayer.videoBottomMargin / projectData.videoLayer.canvasHeight) * 100}%` : '5.2%',
                      transform: 'translateX(-50%)',
                      borderRadius: projectData ? `${projectData.videoLayer.cornerRadius}px` : '40px',
                      objectFit: 'cover'
                    }}
                    preload="metadata"
                  >
                    <source 
                      src={selectedProject ? `/video_projects/${selectedProject}/source_video.mp4?v=${Date.now()}` : ''} 
                      type="video/mp4" 
                    />
                    Your browser does not support the video tag.
                  </video>
                </div>

                {/* Interactive Text Layers */}
                {projectData.textLayers.map((layer) => (
                  <div
                    key={layer.id}
                    className={`absolute transition-all duration-200 ${
                      editingLayer === layer.id 
                        ? 'ring-2 ring-blue-400 bg-blue-500 bg-opacity-20' 
                        : 'hover:ring-1 hover:ring-blue-300 hover:bg-blue-500 hover:bg-opacity-10 cursor-pointer'
                    }`}
                    style={{
                      left: `${(layer.leftMargin / projectData.canvas.width) * 100}%`,
                      top: `${(layer.textTopMargin / projectData.canvas.height) * 100}%`,
                      width: `${(layer.maxWidth / projectData.canvas.width) * 100}%`,
                      padding: '4px',
                      borderRadius: '2px'
                    }}
                                         onClick={() => {
                       setEditingLayer(layer.id);
                       setEditingText(layer.content);
                     }}
                    onMouseDown={editingLayer === layer.id ? (e) => e.stopPropagation() : (e) => handleDragStart(e, layer.id)}
                  >
                    {editingLayer === layer.id ? (
                      <div className="relative">
                        {/* Formatting Toolbar */}
                        <div className="absolute -top-12 left-0 flex space-x-2 bg-gray-800 rounded px-2 py-1 shadow-lg z-10">
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const textarea = document.querySelector(`textarea[data-layer="${layer.id}"]`) as HTMLTextAreaElement;
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const selectedText = editingText.substring(start, end);
                                const newText = editingText.substring(0, start) + `**${selectedText}**` + editingText.substring(end);
                                setEditingText(newText);
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(start + 2, end + 2);
                                }, 0);
                              }
                            }}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold"
                          >
                            B
                          </button>
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const textarea = document.querySelector(`textarea[data-layer="${layer.id}"]`) as HTMLTextAreaElement;
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const selectedText = editingText.substring(start, end);
                                const newText = editingText.substring(0, start) + `*${selectedText}*` + editingText.substring(end);
                                setEditingText(newText);
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(start + 1, end + 1);
                                }, 0);
                              }
                            }}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs italic"
                          >
                            I
                          </button>
                          <button
                            onClick={() => {
                              saveTextChanges();
                              setEditingLayer(null);
                            }}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                          >
                            ✓
                          </button>
                        </div>
                        
                        <textarea
                          value={editingText}
                          onChange={(e) => {
                            setEditingText(e.target.value);
                            // Auto-resize textarea
                            const textarea = e.target as HTMLTextAreaElement;
                            textarea.style.height = 'auto';
                            textarea.style.height = textarea.scrollHeight + 'px';
                            
                            // Auto-save changes as user types (debounced)
                            if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
                            setAutoSaveTimeout(setTimeout(() => {
                              if (editingLayer && projectData) {
                                const updatedLayers = projectData.textLayers.map(layer =>
                                  layer.id === editingLayer
                                    ? { ...layer, content: e.target.value }
                                    : layer
                                );
                                const updatedProjectData = {
                                  ...projectData,
                                  textLayers: updatedLayers
                                };
                                setProjectData(updatedProjectData);
                                // Save to backend
                                fetch(`/api/save-video-project`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    projectName: selectedProject,
                                    projectData: updatedProjectData
                                  })
                                });
                              }
                            }, 1000));
                          }}
                          onBlur={() => {
                            saveTextChanges();
                            setEditingLayer(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.ctrlKey) {
                              saveTextChanges();
                              setEditingLayer(null);
                            }
                            if (e.key === 'Escape') {
                              setEditingText(layer.content);
                              setEditingLayer(null);
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onDragStart={(e) => e.preventDefault()}
                          className="block bg-transparent border-none outline-none resize-none text-white placeholder-gray-400"
                          style={{
                            fontSize: 'inherit',
                            lineHeight: 'inherit',
                            fontFamily: 'inherit',
                            fontWeight: 'inherit',
                            textShadow: 'inherit',
                            height: 'auto',
                            overflow: 'hidden',
                            minHeight: '1.5em',
                            width: '100%',
                            maxWidth: 'none',
                            margin: 0,
                            padding: 0,
                            border: 'none',
                            background: 'transparent'
                          }}
                          data-layer={layer.id}
                          autoFocus
                          placeholder="Enter your text..."
                          ref={(textarea) => {
                            if (textarea) {
                              textarea.style.height = 'auto';
                              textarea.style.height = textarea.scrollHeight + 'px';
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <canvas
                        ref={(canvas) => {
                          if (canvas) {
                            textCanvasRefs.current.set(layer.id, canvas);
                            renderTextToCanvas(layer, canvas);
                          }
                        }}
                        style={{
                          width: '100%',
                          height: 'auto',
                          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))'
                        }}
                      />
                    )}
                  </div>
                ))}


              </div>
            ) : (
              <div className="text-center text-gray-400">
                <div className="text-6xl mb-4">🎬</div>
                <h3 className="text-xl mb-2">No Project Selected</h3>
                <p>Choose a project from the library to start editing</p>
              </div>
            )}
          </div>

          {/* Project Controls */}
          <div className="bg-gray-800 px-6 py-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-300">
                {projectData && (
                  <>
                    Project: <span className="text-white">{projectData.name}</span>
                    <span className="ml-4 text-blue-400">
                      {projectData.textLayers.length} text layer{projectData.textLayers.length !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
              
              {projectData && (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={renderProject}
                    disabled={isRendering}
                    className={`px-4 py-2 rounded font-medium ${
                      isRendering
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : projectData.selectedClip 
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {isRendering ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Rendering...</span>
                      </div>
                    ) : projectData.selectedClip ? (
                      `🎯 Render Selected Clip (${projectData.selectedClip.duration}s)`
                    ) : (
                      '🎬 Render Video'
                    )}
                  </button>
                  
                  <a
                    href={`/video_projects/${selectedProject}/rendered_video.mp4`}
                    download={`${selectedProject}_rendered.mp4`}
                    className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 text-sm font-medium"
                  >
                    📥 Download MP4
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Layer Properties */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
          <h2 className="text-lg font-medium mb-4">Layer Properties</h2>
          
          {projectData && (
            <div className="space-y-4">
              {/* Selected Clip Info */}
              {projectData.selectedClip && (
                <div className="p-3 bg-green-900 border border-green-700 rounded">
                  <h3 className="font-medium mb-2 text-green-300">🎯 Selected Clip</h3>
                  <div className="text-xs text-green-200 space-y-1">
                    <p>File: {projectData.selectedClip.filename}</p>
                    <p>Duration: {projectData.selectedClip.duration}s</p>
                    <p>Range: {projectData.selectedClip.startTime}s - {projectData.selectedClip.endTime}s</p>
                    {projectData.selectedClip.score && (
                      <p>Quality Score: {projectData.selectedClip.score.toFixed(2)}</p>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-green-400">
                    ✨ This clip will be used when rendering
                  </div>
                </div>
              )}
              
              {!projectData.selectedClip && (
                <div className="p-3 bg-yellow-900 border border-yellow-700 rounded">
                  <h3 className="font-medium mb-2 text-yellow-300">⚠️ No Clip Selected</h3>
                  <div className="text-xs text-yellow-200">
                    Rendering will use the entire source video. Create a new project with the genius clip selector for better results.
                  </div>
                </div>
              )}

              <div className="p-3 bg-gray-700 rounded">
                <h3 className="font-medium mb-2">🎥 Video Layer</h3>
                <div className="text-xs text-gray-300">
                  <p>Source: {projectData.videoLayer.source}</p>
                  <p>Size: {projectData.videoLayer.width}x{projectData.videoLayer.height}</p>
                </div>
              </div>

              <div className="p-3 bg-gray-700 rounded">
                <h3 className="font-medium mb-2">📝 Text Layers</h3>
                <div className="space-y-2">
                  {projectData.textLayers.map((layer) => (
                    <div
                      key={layer.id}
                      onClick={() => handleLayerClick(layer.id)}
                      className={`p-2 rounded cursor-pointer text-xs ${
                        selectedLayer === layer.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      <div className="font-medium">{layer.id}</div>
                      <div className="text-gray-300 truncate">
                        {layer.content.substring(0, 30)}...
                      </div>
                      <div className="text-gray-400">
                        Position: {Math.round(layer.x || 0)}, {Math.round(layer.y || 0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-gray-700 rounded">
                <h3 className="font-medium mb-2">🚀 Instructions</h3>
                <div className="text-xs text-gray-300 space-y-1">
                  <p>• Click text layers to edit content</p>
                  <p>• Drag text layers to reposition</p>
                  <p>• Save project to keep changes</p>
                  <p>• Render to create final MP4</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 