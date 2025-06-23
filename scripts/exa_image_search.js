const { Exa } = require('exa-js');

async function searchFounderImages(founderName) {
    try {
        const exa = new Exa(process.env.EXA_API_KEY || "your-exa-api-key");
        
        // Phase 1: Learn about the person first
        console.error(`Phase 1: Learning about ${founderName}...`);
        const contextQuery = `"${founderName}" founder CEO biography`;
        
        let personContext = '';
        try {
            const contextResults = await exa.searchAndContents(contextQuery, {
                type: "neural",
                useAutoprompt: true,
                numResults: 3,
                text: true
            });
            
            // Extract key information about the person
            const contextText = contextResults.results.map(r => r.text || '').join(' ');
            
            // Look for company names, roles, and other identifying information
            const companyMatches = contextText.match(/(?:CEO|founder|co-founder)\s+(?:of|at)\s+([A-Z][a-zA-Z\s]+?)(?:\s|,|\.|\n)/gi);
            const roleMatches = contextText.match(/(CEO|founder|co-founder|CTO|president)\s+(?:of|at)\s+([A-Z][a-zA-Z\s]+)/gi);
            
            if (companyMatches || roleMatches) {
                personContext = (companyMatches || []).concat(roleMatches || []).join(' ');
                console.error(`Found context: ${personContext.substring(0, 100)}...`);
            }
        } catch (e) {
            console.error(`Context search failed: ${e.message}`);
        }
        
        // Phase 2: Search for images using the learned context
        console.error(`Phase 2: Searching for images with context...`);
        const baseQueries = [
            `"${founderName}" founder CEO profile photo`,
            `"${founderName}" entrepreneur headshot`,
            `"${founderName}" founder biography image`
        ];
        
        // Add context-specific queries if we learned about their company/role
        const contextQueries = [];
        if (personContext) {
            // Extract potential company names from context
            const words = personContext.split(/\s+/).filter(word => 
                word.length > 2 && 
                word[0] === word[0].toUpperCase() && 
                !['CEO', 'CTO', 'Founder', 'Co-founder', 'President', 'The', 'And', 'Of', 'At'].includes(word)
            );
            
            const uniqueWords = [...new Set(words)].slice(0, 3); // Take up to 3 unique company/context words
            
            uniqueWords.forEach(contextWord => {
                contextQueries.push(`"${founderName}" ${contextWord} CEO founder photo`);
                contextQueries.push(`"${founderName}" ${contextWord} founder headshot`);
            });
        }
        
        const allQueries = [...baseQueries, ...contextQueries].slice(0, 8); // Limit to 8 total queries
        console.error(`Searching with ${allQueries.length} queries...`);
        
        const allResults = [];
        
        for (const query of allQueries) {
            try {
                const results = await exa.searchAndContents(query, {
                    type: "neural",
                    useAutoprompt: true,
                    numResults: 4,
                    text: true
                });
                
                allResults.push(...results.results);
            } catch (e) {
                console.error(`Search failed for "${query}": ${e.message}`);
            }
        }
        
        // Extract potential image URLs from the results
        const imageUrls = [];
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        
        // Keywords that suggest this is likely a profile/headshot image
        const profileKeywords = ['profile', 'headshot', 'portrait', 'founder', 'ceo', 'linkedin', 'bio', 'about'];
        const excludeKeywords = ['logo', 'icon', 'banner', 'thumb', 'small', '50x50', '100x100', 'favicon'];
        
        for (const result of allResults) {
            // Look for image URLs in the content and URL
            const content = (result.text || '') + ' ' + (result.url || '');
            
            // Simple regex to find image URLs
            const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+\.(jpg|jpeg|png|webp)/gi;
            const matches = content.match(urlPattern) || [];
            
            matches.forEach(url => {
                if (imageUrls.includes(url) || imageUrls.length >= 10) return;
                
                const urlLower = url.toLowerCase();
                
                // Skip obvious non-profile images
                if (excludeKeywords.some(keyword => urlLower.includes(keyword))) {
                    return;
                }
                
                // Prefer images that seem like profiles
                const hasProfileKeywords = profileKeywords.some(keyword => urlLower.includes(keyword));
                const isLikelyProfile = hasProfileKeywords || 
                                      urlLower.includes('photo') || 
                                      urlLower.includes('image') ||
                                      urlLower.includes('picture');
                
                if (isLikelyProfile) {
                    imageUrls.unshift(url); // Add to front if it looks like a profile
                } else {
                    imageUrls.push(url); // Add to back otherwise
                }
            });
            
            // Also check if the main URL might be an image
            if (result.url && imageExtensions.some(ext => result.url.toLowerCase().includes(ext))) {
                const urlLower = result.url.toLowerCase();
                if (!imageUrls.includes(result.url) && 
                    !excludeKeywords.some(keyword => urlLower.includes(keyword))) {
                    imageUrls.push(result.url);
                }
            }
        }
        
        console.log(JSON.stringify({
            success: true,
            imageUrls: imageUrls.slice(0, 5),  // Limit to 5 images
            foundResults: allResults.length
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