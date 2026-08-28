exports.searchVideos = async (req, res) => {
  try {
const {topic} = req.query;
if(!topic){
    return res.status(400).json({status:'fail',message:'Kindly enter the topic you want in order to receive relevant  youtube videos'});
}

const apiKey = process.env.YOUTUBE_API_KEY;
const searchQuery = encodeURIComponent(`${topic} study tutorial explanation`);
const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&maxResults=5&key=${apiKey}`;
const response = await fetch(url);
const data = await response.json();
const videos = data.items.map((item) => ({
  videoId:   item.id.videoId,
  title:     item.snippet.title,
  channel:   item.snippet.channelTitle,
  thumbnail: item.snippet.thumbnails.medium.url,
  url:       `https://www.youtube.com/watch?v=${item.id.videoId}`,
}));

res.status(200).json({
  status:  'success',
  topic,
  results: videos.length,
  data:    { videos },
});





  } catch (error) {
    console.error('YouTube error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to recover your YouTube videos.',
    });
  }
};