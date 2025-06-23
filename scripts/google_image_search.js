const axios = require('axios');

async function searchFounderImages(founderName) {
    try {
        const API_KEY = process.env.GOOGLE_API_KEY;
        const SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
        
        if (!API_KEY || !SEARCH_ENGINE_ID) {
            throw new Error('Google API key and Search Engine ID are required. Set GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.');
        }
        
        // Multiple search queries to find different types of photos
        const searchQueries = [
            `"${founderName}" founder CEO headshot photo`,
            `"${founderName}" entrepreneur profile picture`,
            `"${founderName}" founder portrait professional`,
            `"${founderName}" CEO biography photo`,
            `"${founderName}" startup founder image`
        ];
        
        console.error(`Searching for images of ${founderName}...`);
        
        const allImages = [];
        
        for (const query of searchQueries) {
            try {
                console.error(`Searching: ${query}`);
                
                const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                    params: {
                        key: API_KEY,
                        cx: SEARCH_ENGINE_ID,
                        q: query,
                        searchType: 'image',
                        num: 4,
                        imgType: 'photo',
                        imgSize: 'medium',
                        safe: 'active',
                        fileType: 'jpg,png,jpeg'
                    }
                });
                
                if (response.data.items) {
                    const images = response.data.items.map(item => ({
                        url: item.link,
                        title: item.title,
                        source: item.displayLink,
                        thumbnail: item.image?.thumbnailLink,
                        width: item.image?.width,
                        height: item.image?.height,
                        query: query
                    }));
                    
                    allImages.push(...images);
                    console.error(`Found ${images.length} images for this query`);
                }
                
                // Small delay to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 200));
                
            } catch (error) {
                console.error(`Search failed for "${query}": ${error.message}`);
            }
        }
        
        // Remove duplicates and filter for quality
        const uniqueImages = [];
        const seenUrls = new Set();
        
        for (const image of allImages) {
            if (!seenUrls.has(image.url) && uniqueImages.length < 10) {
                // Basic quality filters
                const width = parseInt(image.width) || 0;
                const height = parseInt(image.height) || 0;
                
                // Skip very small images (likely thumbnails or icons)
                if (width >= 200 && height >= 200) {
                    // Skip obvious non-person images
                    const titleLower = (image.title || '').toLowerCase();
                    const sourceLower = (image.source || '').toLowerCase();
                    
                    const badKeywords = ['logo', 'icon', 'banner', 'chart', 'graph', 'infographic'];
                    const hasBadKeywords = badKeywords.some(keyword => 
                        titleLower.includes(keyword) || sourceLower.includes(keyword)
                    );
                    
                    if (!hasBadKeywords) {
                        uniqueImages.push(image);
                        seenUrls.add(image.url);
                    }
                }
            }
        }
        
        // Sort by likely relevance (prefer professional photos)
        uniqueImages.sort((a, b) => {
            const aTitle = (a.title || '').toLowerCase();
            const bTitle = (b.title || '').toLowerCase();
            
            const goodKeywords = ['headshot', 'profile', 'ceo', 'founder', 'professional', 'portrait'];
            const aScore = goodKeywords.reduce((score, keyword) => 
                score + (aTitle.includes(keyword) ? 1 : 0), 0);
            const bScore = goodKeywords.reduce((score, keyword) => 
                score + (bTitle.includes(keyword) ? 1 : 0), 0);
            
            return bScore - aScore;
        });
        
        console.log(JSON.stringify({
            success: true,
            imageUrls: uniqueImages.slice(0, 5).map(img => img.url),
            images: uniqueImages.slice(0, 5),
            totalFound: allImages.length,
            uniqueFound: uniqueImages.length
        }));
        
    } catch (error) {
        console.log(JSON.stringify({
            success: false,
            error: error.message,
            imageUrls: []
        }));
    }
}

// Get founder name from command line arguments
const founderName = process.argv[2];
if (!founderName) {
    console.log(JSON.stringify({
        success: false,
        error: "Founder name is required",
        imageUrls: []
    }));
    process.exit(1);
}

searchFounderImages(founderName); 