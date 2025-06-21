# Choreo Deployment Guide

## Prerequisites
1. WSO2 Choreo account (https://console.choreo.dev/)
2. GitHub repository with your app code
3. PostgreSQL database (use Aiven, ElephantSQL, or Neon)

## Step 1: Prepare Your Repository
Ensure these files are in your GitHub repo:
- `choreo.yaml` (deployment config)
- `.choreoignore` (ignore unnecessary files)
- `package.json` with build dependencies moved to main dependencies

## Step 2: Create Component in Choreo
1. Login to Choreo console
2. Click "Create Component"
3. Select "Web Application"
4. Connect your GitHub repository
5. Set branch to `main`
6. Choreo will auto-detect the `choreo.yaml` configuration

## Step 3: Configure Environment Variables
In Choreo dashboard, add these environment variables:
- `NODE_ENV`: `production`
- `DATABASE_URL`: Your PostgreSQL connection string
- `PORT`: `5000` (if not auto-detected)

## Step 4: Database Setup
Since Choreo doesn't provide managed PostgreSQL:
1. Use external provider (Aiven, Neon, ElephantSQL)
2. Create database and get connection URL
3. Add URL to Choreo environment variables
4. Database schema will be created automatically on first run

## Step 5: Deploy
1. Click "Deploy" in Choreo
2. Monitor build logs
3. Wait for deployment completion
4. Access your app via provided URL

## Build Process
Choreo will:
1. Install Python 3.11 and yt-dlp
2. Install Node.js dependencies
3. Build frontend with Vite
4. Bundle backend with esbuild
5. Start the application

## Expected Deployment Time
- Build: 3-5 minutes
- Deploy: 1-2 minutes
- Total: 5-7 minutes

## Post-Deployment
Your media downloader will be live with:
- Instagram/YouTube/TikTok downloading
- Forest-themed glassmorphism UI
- PostgreSQL database integration
- Rate limiting protection

## Troubleshooting
If build fails:
- Check that yt-dlp installs correctly
- Verify DATABASE_URL is valid
- Ensure all dependencies are in main dependencies section
- Check Choreo build logs for specific errors

## Alternative: Use Dockerfile
If choreo.yaml doesn't work, Choreo also supports Docker deployment using the provided Dockerfile.