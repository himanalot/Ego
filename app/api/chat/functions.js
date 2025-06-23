export const functions = [
  {
    name: 'search',
    description: 'Search the web for information',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_video',
    description: 'Search for video interviews of a person',
    parameters: {
      type: 'object',
      properties: {
        person: {
          type: 'string',
          description: 'The name of the person to find video interviews for'
        }
      },
      required: ['person']
    }
  },
  {
    name: 'create_video',
    description: 'Create a video with story text and video clip',
    parameters: {
      type: 'object',
      properties: {
        person: {
          type: 'string',
          description: 'The name of the person'
        },
        story: {
          type: 'string',
          description: 'The story text to overlay'
        },
        video_url: {
          type: 'string',
          description: 'The YouTube URL of the interview video'
        }
      },
      required: ['person', 'story', 'video_url']
    }
  }
];

export async function runFunction(name, args) {
  if (name === 'search') {
    try {
      // Use a simple web search approach
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(args.query)}`, {
        headers: {
          'X-Subscription-Token': process.env.BRAVE_API_KEY || 'demo-key'
        }
      });
      
      if (!response.ok) {
        // Fallback to a mock search result
        return {
          results: [
            {
              title: `Information about ${args.query}`,
              snippet: `Search results for ${args.query}. This is a placeholder result.`,
              url: `https://example.com/search?q=${encodeURIComponent(args.query)}`
            }
          ]
        };
      }
      
      const data = await response.json();
      return {
        results: data.web?.results?.slice(0, 5) || []
      };
    } catch (error) {
      console.error('Search error:', error);
      // Return a fallback result
      return {
        results: [
          {
            title: `Information about ${args.query}`,
            snippet: `Unable to fetch live search results for ${args.query}. This is a placeholder.`,
            url: `https://example.com/search?q=${encodeURIComponent(args.query)}`
          }
        ]
      };
    }
  }
  
  if (name === 'search_video') {
    try {
      const searchQuery = `${args.person} interview site:youtube.com`;
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'X-Subscription-Token': process.env.BRAVE_API_KEY || 'demo-key'
        }
      });
      
      if (!response.ok) {
        return {
          video_url: null,
          message: `Could not find video interviews for ${args.person}`
        };
      }
      
      const data = await response.json();
      const youtubeResults = data.web?.results?.filter(result => 
        result.url.includes('youtube.com/watch') && 
        result.title.toLowerCase().includes('interview')
      ) || [];
      
      if (youtubeResults.length > 0) {
        return {
          video_url: youtubeResults[0].url,
          title: youtubeResults[0].title,
          message: `Found interview: ${youtubeResults[0].title}`
        };
      }
      
      return {
        video_url: null,
        message: `No YouTube interview videos found for ${args.person}`
      };
    } catch (error) {
      console.error('Video search error:', error);
      return {
        video_url: null,
        message: `Error searching for videos: ${error.message}`
      };
    }
  }
  
  if (name === 'create_video') {
    try {
      // Import required modules
      const { spawn } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      
      // Create a unique identifier for this video creation
      const timestamp = Date.now();
      const sanitizedName = args.person.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const videoId = `${sanitizedName}_${timestamp}`;
      
      // Write the story to a temporary file
      const storyPath = path.join(process.cwd(), 'temp', `story_${videoId}.txt`);
      
      // Ensure temp directory exists
      if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
        fs.mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
      }
      
      fs.writeFileSync(storyPath, args.story);
      
      // Start the video processing pipeline
      const processVideo = spawn('npm', ['run', 'process-video', args.video_url], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });
      
      let videoOutput = '';
      let videoError = '';
      
      processVideo.stdout.on('data', (data) => {
        videoOutput += data.toString();
      });
      
      processVideo.stderr.on('data', (data) => {
        videoError += data.toString();
      });
      
      // Wait for video processing to complete
      await new Promise((resolve, reject) => {
        processVideo.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Video processing failed with code ${code}: ${videoError}`));
          }
        });
      });
      
      // Parse the video processing output to get clip information
      const clipMatch = videoOutput.match(/Best clips saved to: (.+)/);
      if (!clipMatch) {
        throw new Error('No clips were generated from the video');
      }
      
      // Find the first clip file
      const clipsDir = path.join(process.cwd(), 'processed_videos');
      const clipFiles = fs.readdirSync(clipsDir).filter(file => file.endsWith('.mp4') && file.includes('_clip_'));
      
      if (clipFiles.length === 0) {
        throw new Error('No clip files found in processed_videos directory');
      }
      
      const firstClipPath = path.join(clipsDir, clipFiles[0]);
      
      // Create Instagram post with the first clip and story text
      const createInstagram = spawn('node', ['scripts/create-instagram-post.js', firstClipPath, '--story', storyPath], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });
      
      let instagramOutput = '';
      let instagramError = '';
      
      createInstagram.stdout.on('data', (data) => {
        instagramOutput += data.toString();
      });
      
      createInstagram.stderr.on('data', (data) => {
        instagramError += data.toString();
      });
      
      await new Promise((resolve, reject) => {
        createInstagram.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Instagram post creation failed with code ${code}: ${instagramError}`));
          }
        });
      });
      
      // Clean up temporary story file
      fs.unlinkSync(storyPath);
      
      return {
        success: true,
        message: `Video created successfully for ${args.person}!`,
        video_output: videoOutput,
        instagram_output: instagramOutput
      };
      
    } catch (error) {
      console.error('Video creation error:', error);
      return {
        success: false,
        message: `Failed to create video: ${error.message}`
      };
    }
  }
  
  return null;
} 