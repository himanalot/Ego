# Founder Discovery Chat

An AI-powered chat interface that helps you discover young entrepreneurs and their success stories. Built with Vercel AI SDK and OpenAI GPT-4o-mini with built-in search capabilities.

## 🆕 New: Video Processing Feature

Automatically extract engaging clips from founder interview videos! The system:
- Downloads YouTube videos
- Uses GPT-4o-mini vision to analyze frames and detect when founders are speaking
- Finds continuous segments of at least 7 seconds without cutaways
- Extracts clips in 9:16 format optimized for social media

## Features

- **Intelligent Search**: Uses GPT-4o-mini with built-in web search to find current information about young founders
- **Video Processing**: Extract clips from YouTube founder interviews automatically
- **AI Frame Analysis**: Uses computer vision to detect speaking segments and talking head shots
- **Real-time Search**: Built-in OpenAI search capabilities for up-to-date information
- **Interactive Chat**: Clean, modern chat interface with streaming responses
- **Suggestion System**: Pre-built queries to get started quickly

## Getting Started

### Prerequisites

You'll need an API key from:
- [OpenAI](https://platform.openai.com/api-keys) - for GPT-4o-mini with built-in search and vision analysis

### System Requirements for Video Processing

- **FFmpeg**: Required for video processing
  ```bash
  # macOS
  brew install ffmpeg
  
  # Ubuntu/Debian
  sudo apt update && sudo apt install ffmpeg
  
  # Windows
  # Download from https://ffmpeg.org/download.html
  ```

- **Node.js**: Version 18 or higher

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env.local
   ```
   
   Then edit `.env.local` with your API key:
   ```
   OPENAI_API_KEY=sk-your-openai-key-here
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Chat Interface

Try asking questions like:
- "Find me a fintech founder under 25 who raised over $50M"
- "Tell me about young AI startup CEOs"
- "Who are some successful founders who dropped out of college?"
- "Find founders who started companies before age 20"
- "Show me recent young entrepreneur success stories"

### Video Processing

1. **Navigate to the Video Processor** (`/video-processor`)
2. **Paste a YouTube URL** of a founder interview
3. **Click "Process Video"** and wait for the AI analysis
4. **Download extracted clips** optimized for social media

#### Video Processing Pipeline:

1. **Download**: Fetches the YouTube video in high quality
2. **Frame Extraction**: Extracts frames every 2 seconds for analysis  
3. **Audio Analysis**: Detects speech segments using silence detection
4. **AI Vision Analysis**: GPT-4o-mini analyzes each frame to detect:
   - Is someone speaking (mouth movement, gestures)?
   - Is the person the main subject of the frame?
   - Confidence score for "talking head" shot quality
5. **Segment Scoring**: Combines audio and visual analysis to score segments
6. **Clip Extraction**: Exports best clips in 9:16 format for social media

#### Example Video Processing Command:
```bash
npm run process-video "https://www.youtube.com/watch?v=VIDEO_ID"
```

### How It Works

1. **User Input**: You ask about young founders or paste a YouTube URL
2. **AI Processing**: GPT-4o-mini analyzes your query and uses built-in search when needed
3. **Web Search**: OpenAI's built-in search finds current information about founders
4. **Video Analysis**: Computer vision analyzes video frames to find speaking segments
5. **Response Generation**: GPT-4o-mini creates engaging, story-like responses with latest data
6. **Streaming Output**: Results are streamed back in real-time

## API Architecture

### Chat Endpoint (`/api/chat`)

The main API route that:
- Receives chat messages from the frontend
- Uses OpenAI GPT-4o-mini with function calling
- Integrates built-in web search capabilities

### Video Processing Endpoints

- `/api/process-video` - Processes YouTube videos and returns clips
- `/api/download-clip` - Downloads processed video clips  
- `/api/preview-clip` - Streams video previews with range support

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **AI/ML**: Vercel AI SDK, OpenAI GPT-4o-mini with vision
- **Video Processing**: FFmpeg, ytdl-core, fluent-ffmpeg
- **Search**: OpenAI built-in web search
- **Deployment**: Vercel (recommended)

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── chat/route.ts           # Main chat API endpoint
│   │   ├── process-video/route.ts  # Video processing API
│   │   ├── download-clip/route.ts  # Clip download endpoint
│   │   └── preview-clip/route.ts   # Video preview endpoint
│   ├── video-processor/page.tsx    # Video processing interface
│   ├── layout.tsx                  # Root layout component
│   ├── page.tsx                    # Main chat interface
│   └── globals.css                 # Global styles
├── scripts/
│   └── process-video.js            # Video processing script
├── processed_videos/               # Output directory for clips
├── env.example                     # Environment variables template
├── package.json
├── tailwind.config.js
└── README.md
```

## Deployment

### Deploy to Vercel

1. **Connect your repository** to Vercel
2. **Add environment variables** in the Vercel dashboard:
   - `OPENAI_API_KEY`
3. **Install FFmpeg** in your deployment environment
4. **Deploy** - Vercel will automatically build and deploy your app

### Environment Variables for Production

Make sure to set these in your deployment platform:
- `OPENAI_API_KEY`

## Video Processing Tips

### Best Results:
- **Interview-style videos** work best (single speaker, minimal cuts)
- **Good lighting** improves AI frame analysis accuracy
- **Clear audio** helps with speech segment detection
- **Videos 5-60 minutes** long are optimal

### Troubleshooting:
- Ensure FFmpeg is installed and accessible
- Check that YouTube URL is accessible and not age-restricted
- Verify OpenAI API key has sufficient credits
- Make sure you have disk space for temporary video files

## Customization

### Adding New Search Functions

You can extend the search capabilities by modifying the chat API system prompt in `app/api/chat/route.ts`.

### Modifying Video Processing

Edit `scripts/process-video.js` to:
- Change minimum clip duration (currently 7 seconds)
- Adjust AI analysis prompts for frame detection
- Modify output video format/resolution
- Add new video sources beyond YouTube

### Styling

The app uses Tailwind CSS. Modify styles in:
- `app/globals.css` - Global styles
- Component files - Component-specific styles
- `tailwind.config.js` - Tailwind configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (especially video processing pipeline)
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the GitHub Issues page
- Review the Vercel AI SDK documentation
- Check OpenAI API documentation
- For video processing issues, verify FFmpeg installation 