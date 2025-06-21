# How to Upload Your Media Downloader to GitHub

## Step 1: Create New GitHub Repository
1. Go to github.com and click "New repository"
2. Name it "media-downloader" or similar
3. Make it public or private (your choice)
4. Don't initialize with README (we have our own)
5. Click "Create repository"

## Step 2: Upload Files
You can either:
- Use GitHub's web interface to upload files
- Or clone the repo and push files via Git

## Required File Structure:
```
your-repo/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json
├── drizzle.config.ts
├── render.yaml
├── Dockerfile
├── README.md
├── client/
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── lib/
│       ├── components/
│       ├── pages/
│       └── hooks/
├── server/
│   ├── index.ts
│   ├── routes.ts
│   ├── storage.ts
│   ├── db.ts
│   └── vite.ts
└── shared/
    └── schema.ts
```

## Step 3: Deploy to Render
1. Connect your GitHub repo to Render
2. Add PostgreSQL database add-on
3. Set DATABASE_URL environment variable
4. Deploy automatically using render.yaml

Your app will be live at: https://your-app-name.onrender.com