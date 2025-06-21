# Media Downloader

A modern multi-platform media downloader supporting Instagram, YouTube, and TikTok with a beautiful forest-themed UI.

## Features

- Download videos from Instagram, YouTube, and TikTok
- Beautiful glassmorphism UI with forest background
- PostgreSQL database for download history tracking
- Rate limiting for API protection
- Responsive design for mobile and desktop

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Wouter
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Media Extraction**: yt-dlp

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up PostgreSQL database and add DATABASE_URL to environment variables

3. Push database schema:
```bash
npm run db:push
```

4. Start development server:
```bash
npm run dev
```

## Deployment on Render

### Option 1: Using render.yaml (Recommended)

1. Connect your GitHub repository to Render
2. Render will automatically detect the `render.yaml` file
3. Add your DATABASE_URL environment variable in Render dashboard
4. Deploy

### Option 2: Manual Setup

1. Create a new Web Service on Render
2. Connect your repository
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables:
   - `NODE_ENV=production`
   - `DATABASE_URL=your_postgres_url`

### Environment Variables Required

- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV` - Set to "production" for deployment

## API Endpoints

- `POST /api/download` - Download media from URL
- `GET /api/health` - Health check
- `GET /api/history` - Get download history

## Database Schema

The application uses two main tables:
- `download_history` - Tracks download attempts
- `download_links` - Stores extracted media links

## Rate Limiting

- 30-second cooldown between downloads per IP address
- Configurable in `server/routes.ts`