const axios = require('axios');
const cheerio = require('cheerio');

async function searchFounderImages(founderName) {
    try {
        // DuckDuckGo image search queries
        const searchQueries = [
            `${founderName} founder CEO headshot`,
            `${founderName} entrepreneur profile photo`,
            `${founderName} founder portrait professional`,
            `${founderName} CEO biography image`,
            `${founderName} startup founder picture`
        ];
        
        console.error(`Searching for images of ${founderName} using DuckDuckGo...`);
        
        const allImages = [];
        
        for (const query of searchQueries) {
            try {
                console.error(`Searching: ${query}`);
                
                // DuckDuckGo image search endpoint
                const response = await axios.get('https://duckduckgo.com/', {
                    params: {
                        q: query,
                        t: 'h_',
                        iax: 'images',
                        ia: 'images'
                    },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                
                // Try to get the token from the page
                const $ = cheerio.load(response.data);
                const vqd = $('script').text().match(/vqd=['"]([^'"]+)['"]/);
                
                if (vqd && vqd[1]) {
                    // Make the actual image search request
                    const imageResponse = await axios.get('https://duckduckgo.com/i.js', {
                        params: {
                            l: 'us-en',
                            o: 'json',
                            q: query,
                            vqd: vqd[1],
                            f: ',,,',
                            p: '1'
                        },
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Referer': 'https://duckduckgo.com/'
                        }
                    });
                    
                    if (imageResponse.data && imageResponse.data.results) {
                        const images = imageResponse.data.results.map(item => ({
                            url: item.image,
                            title: item.title,
                            source: item.source,
                            thumbnail: item.thumbnail,
                            width: item.width,
                            height: item.height,
                            query: query
                        }));
                        
                        allImages.push(...images);
                        console.error(`Found ${images.length} images for this query`);
                    }
                }
                
                // Small delay to be respectful
                await new Promise(resolve => setTimeout(resolve, 1000));
                
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
                if (width >= 150 && height >= 150) {
                    // Skip obvious non-person images
                    const titleLower = (image.title || '').toLowerCase();
                    const sourceLower = (image.source || '').toLowerCase();
                    
                    const badKeywords = ['logo', 'icon', 'banner', 'chart', 'graph', 'infographic', 'screenshot'];
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
            
            const goodKeywords = ['headshot', 'profile', 'ceo', 'founder', 'professional', 'portrait', 'photo'];
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