'use client';

import React, { useState, useEffect } from 'react';
import { useChat } from 'ai/react';

export default function LandingPage() {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCreatingVideo, setIsCreatingVideo] = useState(false);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({ 
    api: '/api/chat',
    initialMessages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Hi! I can help you discover young founders and their success stories. Try asking me about:\n\n• "Find me a fintech founder under 25 who raised over $50M"\n• "Tell me about young AI startup CEOs"\n• "Who are some successful founders who dropped out of college?"\n\nOr try: "make a video about [founder name]" to create an Instagram video!\n\nWhat would you like to know?'
      }
    ]
  });

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleCreateVideo = async (messageContent: string) => {
    setIsCreatingVideo(true);
    
    try {
      const founderNameMatch = messageContent.match(/\*\*FOUNDER_NAME:\*\*([\s\S]*?)\*\*STORY:\*\*/);
      const storyMatch = messageContent.match(/\*\*STORY:\*\*([\s\S]*?)\*\*IMAGE_SEARCH_TERMS:\*\*/);
      const imageSearchMatch = messageContent.match(/\*\*IMAGE_SEARCH_TERMS:\*\*([\s\S]*?)\*\*VIDEO_URL:\*\*/);
      const videoUrlMatch = messageContent.match(/\*\*VIDEO_URL:\*\*([\s\S]*?)$/);
      
      if (!storyMatch || !videoUrlMatch) {
        throw new Error('Could not extract story or video URL from message');
      }
      
      const story = storyMatch[1].trim();
      const videoUrl = videoUrlMatch[1].trim();
      const founderName = founderNameMatch ? founderNameMatch[1].trim() : 'Unknown Founder';
      const imageSearchTerms = imageSearchMatch ? imageSearchMatch[1].trim() : founderName;
      
      const response = await fetch('/api/create-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          story,
          videoUrl,
          founderName,
          imageSearchTerms
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        const clipInfo = result.details;
        const message = `✅ Video created successfully! 

🎯 Selected Clip: ${clipInfo.clipUsed}
📊 Total Clips Generated: ${clipInfo.clipsGenerated}
👤 Founder: ${clipInfo.founderName}
🔍 Search Terms: ${clipInfo.imageSearchTerms}

✨ A video project has been created with the BEST CLIP selected by the genius clip finder.`;
        
        alert(message);
      } else {
        throw new Error(result.details || 'Video creation failed');
      }
      
    } catch (error) {
      console.error('Video creation error:', error);
      alert('❌ Failed to create video: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsCreatingVideo(false);
    }
  };

  const handleInputFocus = () => {
    setIsSearchExpanded(true);
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Don't collapse if clicking on suggestions
    if (!e.relatedTarget?.closest('.search-container')) {
      if (!input.trim()) {
        setIsSearchExpanded(false);
      }
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleInputChange({ target: { value: suggestion } } as any);
    // Auto submit the suggestion
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    }, 100);
  };

  const quickActions = [
    { href: '/video-processor', label: 'Process Videos', icon: '🎬' },
    { href: '/video-editor-pro', label: 'Text Editor', icon: '✏️' },
    { href: '/video-project-editor', label: 'Project Editor', icon: '📁' }
  ];

  const suggestions = [
    "Find me a fintech founder under 25 who raised over $50M",
    "Tell me about young AI startup CEOs",
    "Who are some successful founders who dropped out of college?",
    "Show me founders who started companies before age 20",
    "Find recent young entrepreneur success stories"
  ];

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.02),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.01),transparent_50%)]"></div>
      </div>

      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* Main Title */}
        <div className="text-center mb-16">
          <h1 className="text-7xl font-light mb-6 tracking-tight text-[#E1E0DC]">
            The Early Founder
          </h1>
          <h2 className="text-3xl font-light text-[#828282] mb-12">
            From overwhelming to effortless.
          </h2>
        </div>

        {/* Hero Image/Rock */}
        <div className="relative mb-16">
          <div className="w-96 h-64 bg-gradient-to-br from-[#8B7355] via-[#6B5B47] to-[#4A3F35] rounded-3xl shadow-2xl transform rotate-12 opacity-90">
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent rounded-3xl"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-[#B8A082]/20 via-transparent to-transparent rounded-3xl"></div>
          </div>
          
          {/* Connection line to navigation dock */}
          <svg className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-1 h-16 opacity-40">
            <line x1="0" y1="0" x2="0" y2="64" stroke="#828282" strokeWidth="1" strokeDasharray="2,2"/>
          </svg>
        </div>

        {/* Navigation Dock */}
        <div className="relative mb-16">
          <div className="flex items-center space-x-4 bg-[#2A2A2A]/80 backdrop-blur-xl border border-[#404040]/50 rounded-full px-6 py-4">
            {/* Home - Active */}
            <button className="p-3 bg-[#E1E0DC]/20 rounded-full">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.5466 2.24722C11.3855 1.53738 12.6145 1.53738 13.4534 2.24722L20.206 7.97882C20.7097 8.40633 21 9.03358 21 9.69421V18.7499C21 19.9926 19.9926 20.9999 18.75 20.9999H12.75V16.7498C12.75 16.3356 12.4142 15.9998 12 15.9998C11.5858 15.9998 11.25 16.3356 11.25 16.7498V20.9999H5.25C4.00736 20.9999 3 19.9926 3 18.7499V9.67638C3 9.01454 3.29139 8.38627 3.79663 7.95876L10.5466 2.24722Z" fill="#E1E0DC" fillOpacity="0.8"/>
              </svg>
            </button>

            {/* Analysis */}
            <button className="p-3 text-[#E6E6E6] hover:bg-white/10 rounded-full transition-colors" onClick={() => window.location.href = '/video-processor'}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10.2516 10.2515L15.2499 8.74976L13.7482 13.7481L8.74988 15.2498L10.2516 10.2515Z" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>

            {/* Calendar */}
            <button className="p-3 text-[#E6E6E6] hover:bg-white/10 rounded-full transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.75 1.75V3.75M16.25 1.75V3.75M4.78845 3.75H19.2115C20.04 3.75 20.7115 4.42157 20.7115 5.25V19.0577C20.7115 19.8861 20.04 20.5577 19.2115 20.5577H4.78845C3.96002 20.5577 3.28845 19.8861 3.28845 19.0577V5.25C3.28845 4.42157 3.96003 3.75 4.78845 3.75Z" stroke="currentColor" strokeWidth="1.5"/>
                <text textAnchor="middle" fill="currentColor" style={{fontFamily:'system-ui', fontSize:'12px', fontWeight:'bold'}}>
                  <tspan x="12" y="15.75">13</tspan>
                </text>
              </svg>
            </button>

            {/* Bookmark */}
            <button className="p-3 text-[#E6E6E6] hover:bg-white/10 rounded-full transition-colors" onClick={() => window.location.href = '/video-project-editor'}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15.25 7.75H8.75M19.25 20.25V5.25C19.25 4.42157 18.5784 3.75 17.75 3.75H6.25C5.42157 3.75 4.75 4.42157 4.75 5.25V20.25L11.3479 17.0648C11.7599 16.8659 12.2401 16.8659 12.6521 17.0648L19.25 20.25Z" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>

            {/* Graph */}
            <button className="p-3 text-[#E6E6E6] hover:bg-white/10 rounded-full transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.75 15.25L7.93934 11.0607C8.52513 10.4749 9.47487 10.4749 10.0607 11.0607L12.9393 13.9393C13.5251 14.5251 14.4749 14.5251 15.0607 13.9393L20.25 8.75M20.25 8.75V18C20.25 19.2426 19.2426 20.25 18 20.25H6C4.75736 20.25 3.75 19.2426 3.75 18V6C3.75 4.75736 4.75736 3.75 6 3.75H18C19.2426 3.75 20.25 4.75736 20.25 6V8.75Z" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>

            {/* Tools - Active */}
            <button className="p-3 bg-[#E6E6E6]/20 rounded-full" onClick={() => window.location.href = '/video-editor-pro'}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.13175 10.9205L2.93434 12.3441C2.17753 12.6811 1.83717 13.5677 2.17412 14.3245L2.58086 15.2381C2.91781 15.9949 3.80448 16.3353 4.56128 15.9983L7.75869 14.5747M11.6604 7.36293L7.54943 9.19324C6.54036 9.64251 6.08655 10.8247 6.53582 11.8338L7.34929 13.6609C7.79856 14.67 8.98078 15.1238 9.98985 14.6745L14.1008 12.8442M18.5619 3.19545L13.0806 5.63587C11.8193 6.19746 11.252 7.67523 11.8136 8.93658L13.0338 11.6772C13.5954 12.9386 15.0732 13.5058 16.3345 12.9442L21.8158 10.5038C22.068 10.3915 22.1815 10.0959 22.0692 9.84367L19.222 3.44886C19.1097 3.19659 18.8142 3.08313 18.5619 3.19545Z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7.25 21.25L10.5 14.5L13.75 21.25" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>

            {/* Settings */}
            <button className="p-3 text-[#E6E6E6] hover:bg-white/10 rounded-full transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.6667 2.7698C11.4917 2.29345 12.5083 2.29345 13.3333 2.7698L19.3269 6.2302C20.152 6.70655 20.6603 7.58689 20.6603 8.5396V15.4604C20.6603 16.4131 20.152 17.2934 19.3269 17.7698L13.3333 21.2302C12.5083 21.7066 11.4917 21.7066 10.6667 21.2302L4.67308 17.7698C3.84801 17.2934 3.33975 16.4131 3.33975 15.4604V8.5396C3.33975 7.58689 3.84801 6.70655 4.67308 6.2302L10.6667 2.7698Z" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="3.33333" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>

          {/* Search Icon - Separate */}
          <div className="absolute -right-20 top-1/2 transform -translate-y-1/2">
            <button 
              onClick={handleInputFocus}
              className="p-4 bg-[#2A2A2A]/80 backdrop-blur-xl border border-[#404040]/50 rounded-full hover:bg-[#333333]/80 transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 17L21 21M19.25 11C19.25 15.5563 15.5563 19.25 11 19.25C6.44365 19.25 2.75 15.5563 2.75 11C2.75 6.44365 6.44365 2.75 11 2.75C15.5563 2.75 19.25 6.44365 19.25 11Z" stroke="#E6E6E6" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Feature Description */}
        <div className="text-center max-w-md">
          <h3 className="text-xl font-medium mb-4 text-[#E1E0DC]">
            Founder Discovery Chat
          </h3>
          <p className="text-[#828282] leading-relaxed">
            AI-powered search for young entrepreneurs and their success stories. Find inspiring founders with intelligent conversation.
          </p>
        </div>
      </div>

      {/* Chat Messages - Only show when there are messages beyond welcome */}
      {messages.length > 1 && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-40 flex items-center justify-center p-6">
          <div className="w-full max-w-4xl max-h-[80vh] bg-[#1A1A1A]/90 backdrop-blur-xl border border-[#333333] rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-[#333333]">
              <h3 className="text-xl font-medium text-[#E1E0DC]">Conversation</h3>
              <button 
                onClick={() => window.location.reload()}
                className="text-[#828282] hover:text-[#E1E0DC]"
              >
                ✕
              </button>
            </div>
            
          <div className="h-96 overflow-y-auto p-6 space-y-4">
              {messages.slice(1).map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                    className={`max-w-3xl px-4 py-3 rounded-2xl ${
                    message.role === 'user'
                        ? 'bg-[#E1E0DC] text-black ml-4'
                        : 'bg-[#2A2A2A] text-[#E1E0DC] mr-4'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  
                  {message.role === 'assistant' && 
                   message.content.includes('**FOUNDER_NAME:**') &&
                   message.content.includes('**STORY:**') && 
                   message.content.includes('**IMAGE_SEARCH_TERMS:**') &&
                   message.content.includes('**VIDEO_URL:**') && (
                      <div className="mt-4 pt-3 border-t border-[#404040]">
                      <button
                        onClick={() => handleCreateVideo(message.content)}
                        disabled={isCreatingVideo}
                          className={`w-full px-4 py-2 rounded-xl font-medium transition-colors ${
                          isCreatingVideo 
                              ? 'bg-[#404040] text-[#828282] cursor-not-allowed' 
                              : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        {isCreatingVideo ? (
                          <div className="flex items-center justify-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            <span>Creating Video...</span>
                          </div>
                        ) : (
                            '🎬 Create Instagram Video'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                  <div className="bg-[#2A2A2A] text-[#E1E0DC] px-4 py-3 rounded-2xl mr-4">
                  <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#E1E0DC]"></div>
                    <span>Searching...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expanded Search Interface */}
      {isSearchExpanded && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="search-container w-full max-w-4xl">
            {/* AI Glow Background */}
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400/10 via-purple-400/15 to-pink-400/10 blur-2xl rounded-3xl"></div>
              <div className="relative bg-[#1A1A1A]/90 backdrop-blur-xl border border-[#333333]/50 rounded-2xl p-8">
                <form onSubmit={handleSubmit} className="relative">
                  <textarea
                    value={input}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    disabled={isLoading}
                    placeholder="Describe what you're looking for, or press / for suggestions"
                    className="w-full bg-transparent text-[#E1E0DC] placeholder-[#828282] outline-none resize-none h-20 text-lg pr-16"
                    rows={3}
                    autoFocus
                  />
                  
                  {/* Submit Button */}
                  <div className="absolute right-4 bottom-4">
                    <button
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      className="p-3 bg-[#E1E0DC] text-black rounded-xl hover:bg-[#F5F4F0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 14V4M9 4L5 7.76271M9 4L13 7.76271" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </form>
              </div>
          </div>

          {/* Suggestions */}
            <div className="bg-[#1A1A1A]/80 backdrop-blur-xl border border-[#333333]/50 rounded-2xl p-6">
              <div className="grid grid-cols-1 gap-3">
                {suggestions.slice(0, 3).map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="flex items-center space-x-4 p-4 text-left hover:bg-[#2A2A2A]/50 rounded-xl transition-colors group"
                  >
                    <div className="flex-shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#828282] group-hover:text-[#E1E0DC]">
                        <path d="M4.75 7.75H19.25M4.75 16H9.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M17.4688 12.2672C17.3077 11.8318 16.6921 11.8318 16.531 12.2672L15.7292 14.4338C15.6786 14.5707 15.5707 14.6786 15.4338 14.7292L13.2672 15.531C12.8318 15.6921 12.8318 16.3077 13.2672 16.4688L15.4338 17.2706C15.5707 17.3212 15.6786 17.4291 15.7292 17.566L16.531 19.7326C16.6921 20.168 17.3077 20.168 17.4688 19.7326L18.2706 17.566C18.3212 17.4291 18.4291 17.3212 18.566 17.2706L20.7326 16.4688C21.168 16.3077 21.168 15.6921 20.7326 15.531L18.566 14.7292C18.4291 14.6786 18.3212 14.5707 18.2706 14.4338L17.4688 12.2672Z" fill="currentColor"/>
                      </svg>
                    </div>
                    <span className="text-[#E1E0DC] group-hover:text-white">
                    {suggestion}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

        {/* Footer */}
      <div className="absolute bottom-4 left-6 text-xs text-[#828282]">
        Powered by advanced AI
      </div>
    </div>
  );
} 