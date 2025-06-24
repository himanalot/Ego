import OpenAI from 'openai'
import Exa from 'exa-js'

const founderExamples = [
  {
    name: "Hailey Bieber",
    story: "@haileybieber didn't rush into skincare. She spent **two years** in labs, perfecting formulas, studying barrier health, and designing a brand under **$30** — minimalist, but intentional. In **2022**, she launched @rhode with just **three products**. No celebrity noise. No clutter. Just clean skin, a vision, and one viral lip treatment. The response? **Sold out** in hours. **$212M** in sales in under three years. And recently — e.l.f. Beauty acquired Rhode for **$1 billion**. Hailey's not stepping away. She's staying as Chief Creative Officer. She didn't just put her name on a bottle. *She built the next generation of beauty.*"
  },
  {
    name: "Austin Russell",
    story: "At **25**, Austin Russell (@austinrussell) became the world's youngest self-made billionaire — by chasing **brilliant tech**, not hype. At **17**, he filed his first patent — a laser-based water recycling system. By **18**, he founded Luminar to fix the biggest flaw in self-driving cars: lidar sensors were slow, bulky, and wildly expensive. He left Stanford with a **$100K** Thiel Fellowship and locked himself in a lab. No press. Just physics and precision. Now, Luminar powers **Volvo, Mercedes, Toyota** and more. In **2020**, it went public — and made him the youngest self-made billionaire overnight. *Austin didn't chase trends. He built tech the world wasn't ready for yet.*"
  },
  {
    name: "Darren Watkins Jr.",
    story: "Darren Watkins Jr. (@ishowspeed) started streaming in his bedroom during the pandemic. Just a teenager with **zero viewers**, a PS4, and relentless energy. He streamed every day, sometimes for **10+ hours**. Yelled. Cried. Celebrated. Failed — on camera. His chaos felt real. And people came. From **0 to 76M+** followers in just a few years. Now? He's global. Played with **Ronaldo**. Performed at **Rolling Loud**. Launched a song that charted in multiple countries. He didn't follow the rules. He broke them — loudly. And turned emotion into entertainment at scale. *iShowSpeed didn't just build a fanbase. He unleashed a phenomenon.*"
  },
  {
    name: "Ben Silbermann",
    story: "Ben Silbermann dreamed of working at Google. He applied **twice** — and got rejected. Too quiet. Not technical enough. He didn't fit the mold. So he built what he loved: a digital corkboard for collecting beautiful things. He called it @pinterest . It launched in **2010** — and flopped. No users. No buzz. So Ben and his co-founder personally emailed the first **5,000 users**. He printed flyers. Visited craft fairs. Begged boutique owners to give it a try. It worked. Today? Pinterest has **450M+ users**. IPO'd at **$10B+**. *Ben didn't build for attention. He built for what he loved.*"
  },
  {
    name: "Dylan Field",
    story: "Dylan Field dropped out of Brown at **20** with a **$100K** Thiel Fellowship. No degree. No backup plan. Just an idea: design should happen in the browser. People laughed. Investors didn't get it. Design tools were desktop-only. But Dylan kept building — in obscurity — for **four years** before launching. Then? Designers loved it. No installs. Real-time collaboration. It just worked. @figma exploded. **Google. Uber. Airbnb** all switched. By **30**, Dylan sold it to Adobe for **$20B** — one of the biggest design acquisitions in history. *He didn't follow trends. He rewrote the interface.*"
  }
];

export async function POST(req) {
  const body = await req.json()
  const messages = body.messages ?? []
  const lastMessage = messages[messages.length - 1];

  // Check for the video generation intent
  const videoIntentMatch = lastMessage.content.match(/make a video about (.*)/i);
  if (videoIntentMatch && videoIntentMatch[1]) {
    const founderName = videoIntentMatch[1].trim();
    
    try {
      console.log(`🚀 Starting video generation for: ${founderName}`);
      
      // Initialize OpenAI and Exa clients
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const exaApiKey = process.env.EXA_API_KEY || 'your-exa-api-key-here';
      const exa = exaApiKey !== 'your-exa-api-key-here' ? new Exa(exaApiKey) : null;
      
      // Define the Exa web search tool
      const tools = [{
        type: 'function',
        name: 'exa_websearch',
        description: 'Search the web using Exa. Provide relevant links in your answer.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for Exa.'
            }
          },
          required: ['query'],
          additionalProperties: false
        },
        strict: true
      }];

      // System message
      const systemMessage = {
        role: 'system',
        content: `You are a world-class storyteller who writes short, powerful, and inspiring biographies about tech founders and entrepreneurs. You MUST use the exa_websearch tool to research the founder before writing their story.

Your task is to:
1. Research and write a biography about ${founderName} in the exact same style as the examples provided below
2. Find a YouTube interview video link for ${founderName}

**STYLE GUIDELINES:**
1. **Punchy Structure**: One-word sentences. Fragments. Rhetorical questions like "No funding?" followed by italicized answers—*He built it anyway.*
2. **Bold & Italics**: 
   - **Bold the founder's name** first mention + **key numbers/companies**
   - *Italicize* answers to rhetorical questions, dramatic reveals after em dashes, and final statement
3. **Optimal Length**: The STORY section must be EXACTLY 600-630 characters total, INCLUDING SPACES (approximately 90-105 words). This is a HARD LIMIT! Every word must earn its place.
4. **No Emojis**: Clean text only.
4. **Required Ending**: Always end the **STORY** section with this exact text on a new line (this does not count towards the character limit): "*I post young founder success stories daily.*"
5. **Current Facts**: Research recent, accurate information about ${founderName}.

**EXAMPLES:**
${founderExamples.map(e => `**Founder:** ${e.name}\n**Story:**\n${e.story}`).join('\n\n')}

**PROCESS:**
1. FIRST: Use exa_websearch to search for "${founderName} founder biography startup company"
2. SECOND: Use exa_websearch to search for "${founderName} YouTube interview"
3. THIRD: Write the story based on search results
4. FOURTH: Provide the YouTube URL if found

**OUTPUT FORMAT:**
You MUST provide your response in this EXACT format with these EXACT headers (including the asterisks):

**FOUNDER_NAME:**
${founderName}

**STORY:**
[Write the story about ${founderName} here]

**IMAGE_SEARCH_TERMS:**
[Provide 3-5 specific search terms separated by commas that would help identify ${founderName} in images/videos for facial recognition. Include company names, titles, and contexts. For example: "Jeff Bezos Amazon, Jeff Bezos CEO, Jeff Bezos Blue Origin, Jeff Bezos founder"]

**VIDEO_URL:**
[Search for and provide a real, working YouTube URL (youtube.com/watch?v=) of an actual interview with ${founderName}. Do not make up fake video IDs. Find a real interview that exists on YouTube.]

IMPORTANT: You must include ALL FOUR sections exactly as shown above for the system to work properly.`
      };

      // Initial messages
      const messages = [
        systemMessage,
        {
          role: 'user',
          content: `Search for information about ${founderName} using the web search tool, then write their story and find a YouTube interview video.`
        }
      ];

      console.log('📤 Sending initial request to OpenAI...');
      
      // Initial request to OpenAI
      let response = await openai.responses.create({
        model: 'gpt-4o-mini',
        input: messages,
        tools: tools
      });

      console.log('📥 Initial OpenAI response received');

      // Handle multiple tool calls in a loop
      let maxIterations = 5; // Prevent infinite loops
      let iteration = 0;
      
      while (iteration < maxIterations) {
        const functionCalls = response.output.filter(item => 
          item.type === 'function_call' && item.name === 'exa_websearch');

        if (functionCalls.length === 0) {
          // No more function calls, we should have the final response
          break;
        }

        console.log(`🔧 Function calls detected (iteration ${iteration + 1}):`, functionCalls.length);

        // Process all function calls
        for (const functionCall of functionCalls) {
          const query = JSON.parse(functionCall.arguments).query;
          console.log('🔍 Search query:', query);

          let searchResults;
          if (!exa) {
            console.log('❌ No Exa API key provided');
            searchResults = 'Search unavailable - please add EXA_API_KEY to environment variables. Get a free key at https://dashboard.exa.ai/';
          } else {
            try {
              console.log('🌐 Executing Exa search...');
              const exaResults = await exa.searchAndContents(query, {
                type: 'auto',
                text: {
                  maxCharacters: 4000
                }
              });
              
              const results = exaResults.results.map(result => ({
                title: result.title,
                url: result.url,
                text: result.text
              }));
              
              console.log('✅ Exa search results obtained:', results.length, 'results');
              searchResults = JSON.stringify(results);
            } catch (error) {
              console.error('❌ Exa search failed:', error);
              searchResults = `Search failed: ${error.message}. Please check your Exa API key.`;
            }
          }

          // Add function call and search results to the conversation
          messages.push(functionCall);
          messages.push({
            type: 'function_call_output',
            call_id: functionCall.call_id,
            output: searchResults
          });
        }

        console.log('📤 Sending follow-up request with search results...');
        
        // Send follow-up request to OpenAI with search results
        response = await openai.responses.create({
          model: 'gpt-4o-mini',
          input: messages,
          tools: tools
        });
        
        iteration++;
      }
      
      if (iteration >= maxIterations) {
        console.log('⚠️ Max iterations reached, stopping tool calls');
      }

      console.log('✅ Final response generated');
      console.log('🔍 Full response object:', JSON.stringify(response, null, 2));
      console.log('📄 Response text:', response.output_text);
      console.log('📄 Response output:', response.output);
      
      // Extract text from the response
      let responseText = response.output_text;
      
      // If output_text is empty, try to extract from output array
      if (!responseText && response.output && response.output.length > 0) {
        const messageOutput = response.output.find(item => item.type === 'message');
        if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
          const textContent = messageOutput.content.find(item => item.type === 'text');
          if (textContent) {
            responseText = textContent.text;
          }
        }
      }
      
      responseText = responseText || 'No response generated';
      console.log('📝 Final extracted text:', responseText);
      
      // Check character count and ask for shortening if needed (with retry loop)
      let shorteningAttempts = 0;
      const maxShorteningAttempts = 3;
      
      while (shorteningAttempts < maxShorteningAttempts) {
        const storyMatch = responseText.match(/\*\*STORY:\*\*(.*?)(?:\*\*IMAGE_SEARCH_TERMS:\*\*|$)/s);
        if (storyMatch && storyMatch[1]) {
          const storyContent = storyMatch[1].trim();
          // Remove the required ending from character count
          const storyWithoutEnding = storyContent.replace(/\*I post young founder success stories daily\.\*/g, '').trim();
          const charCount = storyWithoutEnding.length;
                      console.log(`📊 Story character count: ${charCount}/630 (attempt ${shorteningAttempts + 1})`);
          
          if (charCount > 630 || charCount < 600) {
            if (charCount > 630) {
              console.log('⚠️ Story too long, asking model to shorten...');
            } else {
              console.log('⚠️ Story too short, asking model to expand...');
            }
            shorteningAttempts++;
            
            // Add message asking to adjust length with specific instructions
            let adjustmentMessage;
            if (charCount > 630) {
              const overage = charCount - 615; // Target middle of range
              adjustmentMessage = `The STORY section is ${charCount} characters but MUST be 600-630 characters. It's ${overage} characters too long. Cut it down by removing exactly ${overage + 10} characters. DO NOT OVERSHOOT THE NUMBER IN YOUR CHANGES. Focus on: removing unnecessary adjectives, combining sentences, cutting redundant phrases. Keep all bolding, italics, and the punchy style. Target exactly 615 characters.`;
            } else {
              const shortage = 615 - charCount; // Target middle of range  
              adjustmentMessage = `The STORY section is ${charCount} characters but MUST be 600-630 characters. It's ${shortage} characters too short. Add exactly ${shortage + 10} characters by: expanding key moments, adding specific details, including more impactful numbers. DO NOT OVERSHOOT THE NUMBER IN YOUR CHANGES.Keep the same punchy style. Target exactly 615 characters.`;
            }
            
            messages.push({
              role: 'user',
              content: adjustmentMessage
            });
            
            // Get shortened response
            response = await openai.responses.create({
              model: 'gpt-4o-mini',
              input: messages
            });
            
            // Extract the new response text
            responseText = response.output_text;
            if (!responseText && response.output && response.output.length > 0) {
              const messageOutput = response.output.find(item => item.type === 'message');
              if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
                const textContent = messageOutput.content.find(item => item.type === 'text');
                if (textContent) {
                  responseText = textContent.text;
                }
              }
            }
            responseText = responseText || 'No response generated';
            console.log(`📝 Shortened response text (attempt ${shorteningAttempts}):`, responseText);
          } else {
            console.log('✅ Story length is within limits (600-630 characters)');
            break;
          }
        } else {
          break;
        }
      }
      
      if (shorteningAttempts >= maxShorteningAttempts) {
        console.log('⚠️ Max shortening attempts reached, proceeding with current response');
      }
      
      // After generating the story, create the interactive project
      console.log('🎬 Creating interactive video project...');
      
      // Extract the story content for the project
      const storyMatch = responseText.match(/\*\*STORY:\*\*(.*?)(?:\*\*IMAGE_SEARCH_TERMS:\*\*|$)/s);
      const storyContent = storyMatch ? storyMatch[1].trim() : '';
      
      // Extract founder name from response
      const founderMatch = responseText.match(/\*\*FOUNDER_NAME:\*\*(.*?)(?:\*\*STORY:\*\*|$)/s);
      const extractedFounderName = founderMatch ? founderMatch[1].trim() : founderName; // Use original if not found
      
      // Extract video URL
      const videoMatch = responseText.match(/\*\*VIDEO_URL:\*\*(.*?)$/s);
      const videoUrl = videoMatch ? videoMatch[1].trim() : '';
      
      // Create the project in the background (don't wait for it to complete)
      if (storyContent && videoUrl) {
        createVideoProjectInBackground(extractedFounderName, storyContent, videoUrl, responseText);
      }
      
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        start(controller) {
          // Send the response in the format expected by Vercel AI SDK
          const lines = [
            `0:"${responseText.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
            'd:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":200}}'
          ];
          
          for (const line of lines) {
            controller.enqueue(encoder.encode(line + '\n'));
          }
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Vercel-AI-Data-Stream': 'v1'
        }
      });

    } catch (error) {
      console.error('❌ Error in video generation:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to generate video story',
        details: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Regular chat
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages
  });
  
  // Create a streaming response compatible with useChat
  const responseText = response.choices[0].message.content;
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // Send the response in the format expected by Vercel AI SDK
      const lines = [
        `0:"${responseText.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
        'd:{"finishReason":"stop","usage":{"promptTokens":50,"completionTokens":100}}'
      ];
      
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1'
    }
  });
}

// Background function to create video project
async function createVideoProjectInBackground(founderName, storyContent, videoUrl, responseText) {
  try {
    console.log('🎬 Starting background project creation for:', founderName);
    
    // First, download the video from YouTube
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const fs = await import('fs');
    const path = await import('path');
    
    const execAsync = promisify(exec);
    
    // Generate unique timestamp for this project
    const timestamp = Date.now();
    const projectName = `chat_project_${timestamp}`;
    
    // Create temp directory for download
    const tempDir = path.join(process.cwd(), 'temp_downloads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Extract image search terms from the full response for facial recognition
    const imageSearchMatch = responseText ? responseText.match(/\*\*IMAGE_SEARCH_TERMS:\*\*(.*?)(?:\*\*VIDEO_URL:\*\*|$)/s) : null;
    const imageSearchTerms = imageSearchMatch ? imageSearchMatch[1].trim() : null;
    
    // Look for existing clips that were already created when user clicked "Create Video"
    console.log('🔍 Looking for existing clip from previous "Create Video" action...');
    const processedVideosDir = path.join(process.cwd(), 'processed_videos');
    const instagramPostsDir = path.join(process.cwd(), 'instagram_posts');
    
    let clipPath = null;
    
    // First, check if there's already a clip in processed_videos
    if (fs.existsSync(processedVideosDir)) {
      const clipFiles = fs.readdirSync(processedVideosDir).filter(file => 
        file.endsWith('.mp4') && file.includes('_clip_')
      );
      
      if (clipFiles.length > 0) {
        // Use the most recent clip file
        const clipFile = clipFiles[clipFiles.length - 1];
        clipPath = path.join(processedVideosDir, clipFile);
        console.log('✅ Found existing clip in processed_videos:', clipPath);
      }
    }
    
    // If no clip found in processed_videos, check instagram_posts
    if (!clipPath && fs.existsSync(instagramPostsDir)) {
      const instagramFiles = fs.readdirSync(instagramPostsDir).filter(file => 
        file.endsWith('.mp4') && !file.endsWith('.project')
      );
      
      if (instagramFiles.length > 0) {
        // Use the most recent Instagram post
        const instagramFile = instagramFiles[instagramFiles.length - 1];
        clipPath = path.join(instagramPostsDir, instagramFile);
        console.log('✅ Found existing clip in instagram_posts:', clipPath);
      }
    }
    
    // Only if no existing clip is found, then process the video
    if (!clipPath) {
      console.log('⚠️ No existing clip found, processing video...');
      const processVideoCommand = `node scripts/process-video.js "${videoUrl}" "${imageSearchTerms || extractedFounderName}"`;
      
      console.log('🔍 Process video command:', processVideoCommand);
      const processResult = await execAsync(processVideoCommand);
      
      console.log('✅ Process video completed');
      
      // Find the newly extracted clip
      if (fs.existsSync(processedVideosDir)) {
        const clipFiles = fs.readdirSync(processedVideosDir).filter(file => 
          file.endsWith('.mp4') && file.includes('_clip_')
        );
        
        if (clipFiles.length > 0) {
          const clipFile = clipFiles[clipFiles.length - 1];
          clipPath = path.join(processedVideosDir, clipFile);
          console.log('✅ Found newly extracted clip:', clipPath);
        }
      }
    }
    
    if (!clipPath) {
      console.error('❌ No clip found or created');
      return;
    }
    
    // Create project directory
    const projectDir = path.join(process.cwd(), 'video_projects', projectName);
    if (!fs.existsSync(path.dirname(projectDir))) {
      fs.mkdirSync(path.dirname(projectDir), { recursive: true });
    }
    fs.mkdirSync(projectDir, { recursive: true });
    
    // Copy the extracted clip to project directory (don't move, as it might be needed elsewhere)
    const projectVideoPath = path.join(projectDir, 'source_video.mp4');
    fs.copyFileSync(clipPath, projectVideoPath);
    
    // Create interactive project file that EXACTLY matches the finished video
    const projectData = {
      version: "1.0",
      created: new Date().toISOString(),
      name: projectName,
      founderName: founderName,
      sourceUrl: videoUrl,
      
      // Video layer settings (matches create-instagram-post.js exactly)
      videoLayer: {
        type: 'video',
        source: 'source_video.mp4',
        // Canvas dimensions
        canvasWidth: 1080,
        canvasHeight: 1920,
        // Video scaling (85% of canvas width for larger margins)
        targetWidth: Math.floor(1080 * 0.85), // 918
        targetHeight: Math.floor((1080 * 0.85) * 9 / 16), // 516 (16:9 ratio)
        // Positioning
        x: (1080 - Math.floor(1080 * 0.85)) / 2, // Centered horizontally
        y: 1920 - Math.floor((1080 * 0.85) * 9 / 16) - 100, // Bottom margin of 100px
        // Styling
        backgroundColor: '#000000',
        cornerRadius: 40,
        videoBottomMargin: 100
      },
      
      // Text layers (matches create-instagram-post.js exactly)
      textLayers: [
        {
          id: 'main-text',
          type: 'text',
          content: storyContent,
          // Text positioning (matches generateTextImage function)
          x: 120, // leftMargin from script
          y: 250, // textTopMargin from script
          width: 840, // maxWidth from script (1080 - 2*120)
          height: 800, // Estimated height for text area
          // Typography (matches script exactly)
          fontSize: 50,
          fontFamily: 'NimbusSans',
          fontFamilyBold: 'NimbusSansBold',
          fontFamilyItalic: 'NimbusSansItalic',
          fontFamilyBoldItalic: 'NimbusSansBoldItalic',
          color: '#FFFFFF',
          lineHeight: 1.25, // fontSize * 1.25 from script
          textBaseline: 'top',
          // Layout settings (matches script)
          leftMargin: 120,
          textTopMargin: 250,
          maxWidth: 840,
          spaceHandling: 'smart', // No space before punctuation
          wordWrap: true,
          markdown: true
        }
      ],
      
      // Canvas settings (matches script exactly)
      canvas: {
        width: 1080,
        height: 1920,
        backgroundColor: '#000000',
        fps: 30
      },
      
      // Export settings
      export: {
        format: 'mp4',
        quality: 'high',
        codec: 'h264',
        preset: 'medium',
        crf: 23,
        pixelFormat: 'yuv420p'
      }
    };
    
    // Save project file
    const projectFilePath = path.join(projectDir, 'project.json');
    fs.writeFileSync(projectFilePath, JSON.stringify(projectData, null, 2));
    
    console.log('✅ Project files created (no automatic rendering)');
    // Note: We don't render the video automatically - user can render it in the project editor when ready
    
    // Create a reference in the main instagram_posts directory
    const referenceFile = path.join(process.cwd(), 'instagram_posts', `${projectName}.project`);
    fs.writeFileSync(referenceFile, JSON.stringify({
      projectPath: projectDir,
      projectFile: projectFilePath,
      renderedVideo: null, // Will be created when user renders in project editor
      created: new Date().toISOString(),
      founderName: founderName
    }));
    
    // Clean up temp directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.log('⚠️ Temp cleanup warning:', cleanupError.message);
    }
    
    console.log('✅ Background project creation completed:', projectName);
    
  } catch (error) {
    console.error('❌ Error in background project creation:', error);
    
    // Clean up temp directory on error
    try {
      const fs = await import('fs');
      const path = await import('path');
      const tempDir = path.join(process.cwd(), 'temp_downloads');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.log('⚠️ Error cleanup warning:', cleanupError.message);
    }
  }
}

// Note: Background rendering and text generation functions removed - projects are only rendered when user chooses to in the project editor

 