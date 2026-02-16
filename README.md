# JobAdder to Brevo Job Alerts System

Automated job alert system that sends daily roundups and on-demand alerts from JobAdder to Brevo.

## Features

- ✅ **Daily Job Roundup**: Automatically sends all live jobs at 2 PM daily
- ✅ **On-Demand Alerts**: Webhook-triggered alerts when new jobs are posted
- ✅ **OAuth2 with Refresh Tokens**: Secure JobAdder authentication
- ✅ **Brevo Integration**: Uses transactional email templates
- ✅ **Filtered Recipients**: Only sends to contacts with JOB_ALERTS = "Yes"

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file with:

```
BREVO_API_KEY=your_brevo_api_key
DAILY_ROUNDUP_TEMPLATE_ID=158
SINGLE_JOB_ALERT_TEMPLATE_ID=159
JOBADDER_CLIENT_ID=your_client_id
JOBADDER_CLIENT_SECRET=your_client_secret
JOBADDER_REDIRECT_URI=https://your-app.up.railway.app/auth/callback
PORT=3000
```

### 3. Deploy to Railway

1. Push code to GitHub
2. Connect GitHub repo to Railway
3. Add environment variables in Railway dashboard
4. Deploy and get your Railway URL (e.g., `https://your-app.up.railway.app`)

### 4. Update JobAdder Developer Portal

1. Go to https://developers.jobadder.com/
2. Update your application's **Redirect URI** to: `https://your-app.up.railway.app/auth/callback`
3. Save changes

### 5. Authorize JobAdder

1. Visit `https://your-app.up.railway.app/auth/jobadder`
2. Log in to JobAdder and authorize the application
3. You'll be redirected back with a success message
4. The app will now have access to JobAdder API with refresh tokens

## API Endpoints

- `GET /` - Health check and authorization status
- `GET /auth/jobadder` - Start OAuth2 authorization flow
- `GET /auth/callback` - OAuth2 callback endpoint
- `POST /webhook/jobadder` - Webhook for JobAdder job posted events
- `POST /trigger/daily-roundup` - Manually trigger daily roundup
- `POST /trigger/single-job/:jobId` - Manually trigger alert for specific job

## Deployment to Railway

### Step-by-Step:

1. **Create GitHub Repository**
   ```bash
   cd jobadder-brevo-alerts
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Connect to Railway**
   - Go to https://railway.app
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway will auto-detect Node.js and deploy

3. **Add Environment Variables in Railway**
   - Go to your project → Variables
   - Add all variables from `.env` file
   - **Important**: Update `JOBADDER_REDIRECT_URI` to your Railway URL + `/auth/callback`

4. **Update JobAdder Redirect URI**
   - Copy your Railway URL (e.g., `https://jobadder-brevo-alerts-production.up.railway.app`)
   - Go to JobAdder developer portal
   - Update Redirect URI to: `https://your-railway-url.up.railway.app/auth/callback`

5. **Authorize the Application**
   - Visit `https://your-railway-url.up.railway.app/auth/jobadder`
   - Complete OAuth2 authorization
   - Done! ✅

## Scheduled Tasks

- **Daily Roundup**: Runs at 2 PM Australia/Sydney time every day

## Testing

### Test Daily Roundup
```bash
curl -X POST https://your-app.up.railway.app/trigger/daily-roundup
```

### Test Single Job Alert
```bash
curl -X POST https://your-app.up.railway.app/trigger/single-job/YOUR_JOB_ID
```

## Architecture

```
JobAdder → Webhook → Express App → Brevo API → Email Recipients
                ↓
            Cron Job (2 PM daily)
                ↓
         OAuth2 Refresh Tokens
```

## Troubleshooting

### "Not authorized" error
- Visit `/auth/jobadder` to complete OAuth2 authorization
- Make sure Redirect URI in JobAdder matches your Railway URL exactly

### "unauthorized_client" error
- Check that Redirect URI in JobAdder developer portal is correct
- Ensure it matches `JOBADDER_REDIRECT_URI` in your `.env`
- Must include `/auth/callback` at the end

### Tokens expired
- The app automatically refreshes tokens using the refresh token
- If refresh fails, re-authorize at `/auth/jobadder`
