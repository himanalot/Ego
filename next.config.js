/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/instagram_posts/:path*',
        destination: '/api/serve-clip/:path*',
      },
      {
        source: '/video_projects/:path*',
        destination: '/api/serve-project/:path*',
      },
    ];
  },
};

module.exports = nextConfig; 