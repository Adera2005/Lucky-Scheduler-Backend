// ============================================================
// youtubeController.js
// Searches YouTube for learning videos.
//
// Strategy:
// 1. Cleans and contextualizes queries with course name and academic filters.
// 2. First tries the official YouTube v3 Data API.
// 3. If the API key is missing or quota is exhausted (HTTP 403/429),
//    it automatically falls back to YouTube public web search so
//    the user NEVER gets blocked by quota limits.
// 4. Returns up to 5 structured video items.
// ============================================================

// Clean raw page snippets so search query contains meaningful educational keywords
function sanitizeSearchQuery(topic, course) {
  if (!topic) return course ? `${course} tutorial` : 'study tutorial';

  // Remove programming syntax, punctuation, braces, quotes, bullets, variable names
  let cleaned = topic
    .replace(/[{}[\]();=<>:"'`.•\r\n\t_]/g, ' ')
    // Remove common programming boilerplate words and code noise
    .replace(/\b(public|private|protected|void|static|new|println|System|out|import|package|class|return|gpa|student|studentGpa|name|age|null|true|false|Exercise|Practice|Assignment)\b/gi, ' ')
    // Remove individual names that appear in student code exercises (e.g. Kipchoge, Akinyi, Muthui, Dennis, etc.)
    .replace(/\b(Kipchoge|Akinyi|Dennis|Muthui|Jane|Tom|John|Alice|Bob)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Take the most relevant first 5-6 words
  const words = cleaned.split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w));
  let coreQuery = words.slice(0, 6).join(' ');

  // Always anchor with the course name to ensure results remain strictly within subject domain
  if (course && !coreQuery.toLowerCase().includes(course.toLowerCase())) {
    coreQuery = `${coreQuery} ${course}`.trim();
  }

  return coreQuery || (course ? `${course} tutorial` : 'study tutorial');
}

// Fallback search that scrapes YouTube's public search results page
async function searchYouTubePublic(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' tutorial')}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const html = await response.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const contents =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    const itemSection = contents?.find((c) => c.itemSectionRenderer)?.itemSectionRenderer?.contents;

    if (!Array.isArray(itemSection)) return [];

    const videos = [];
    for (const item of itemSection) {
      if (videos.length >= 5) break;
      const vr = item.videoRenderer;
      if (!vr || !vr.videoId) continue;

      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'YouTube Video';
      const channel = vr.ownerText?.runs?.[0]?.text || 'YouTube';
      const thumb =
        vr.thumbnail?.thumbnails?.[vr.thumbnail.thumbnails.length - 1]?.url ||
        `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;

      videos.push({
        videoId:   vr.videoId,
        title,
        channel,
        thumbnail: thumb,
        url:       `https://www.youtube.com/watch?v=${vr.videoId}`,
      });
    }

    return videos;
  } catch (err) {
    console.error('Public YouTube search fallback error:', err.message);
    return [];
  }
}

exports.searchVideos = async (req, res) => {
  try {
    const { topic, course } = req.query;
    if (!topic && !course) {
      return res.status(400).json({
        status:  'fail',
        message: 'Kindly enter the topic or course you want in order to receive relevant YouTube videos',
      });
    }

    const cleanKeywords = sanitizeSearchQuery(topic, course);
    const apiKey = process.env.YOUTUBE_API_KEY;
    let videos = [];
    let usedProvider = 'API';

    // ── 1. Try Official YouTube API if key exists ──
    if (apiKey) {
      try {
        const searchQuery = encodeURIComponent(`${cleanKeywords} study tutorial explanation`);
        const url =
          `https://www.googleapis.com/youtube/v3/search` +
          `?part=snippet` +
          `&q=${searchQuery}` +
          `&type=video` +
          `&maxResults=10` +
          `&order=relevance` +
          `&videoCategoryId=27` + // Education
          `&safeSearch=strict` +
          `&key=${apiKey}`;

        const apiResponse = await fetch(url);
        const apiData = await apiResponse.json();

        if (apiData.error) {
          console.warn(`⚠️ YouTube API responded with code ${apiData.error.code}: ${apiData.error.message}`);
          console.log('🔄 Switching to YouTube public search fallback...');
        } else if (Array.isArray(apiData.items)) {
          videos = apiData.items
            .filter((item) => item.id?.videoId)
            .slice(0, 5)
            .map((item) => ({
              videoId:   item.id.videoId,
              title:     item.snippet.title,
              channel:   item.snippet.channelTitle,
              thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
              url:       `https://www.youtube.com/watch?v=${item.id.videoId}`,
            }));
        }
      } catch (apiErr) {
        console.warn('⚠️ YouTube API fetch error:', apiErr.message);
      }
    }

    // ── 2. Fallback to public search if quota exceeded or 0 results ──
    if (!videos.length) {
      usedProvider = 'Public Search Fallback';
      videos = await searchYouTubePublic(cleanKeywords);
    }

    // Set cache-control so repeated clicks within 1 hour don't re-query
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.status(200).json({
      status:   'success',
      topic:    cleanKeywords,
      provider: usedProvider,
      results:  videos.length,
      data:     { videos },
    });

  } catch (error) {
    console.error('YouTube search fatal error:', error.message);
    res.status(500).json({
      status:  'error',
      message: 'Failed to retrieve YouTube videos.',
    });
  }
};
