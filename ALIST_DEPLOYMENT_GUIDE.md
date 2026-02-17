# The A-List Feature - Deployment Guide

## 🎉 Implementation Complete!

The A-List candidate email feature has been successfully integrated into your existing job alerts dashboard as a **unified interface with tabs**.

---

## 📋 What Was Added

### New Files Created (4)
```
services/
  ├── candidateService.js       - Fetches candidates from JobAdder, filters by interview notes
  └── aiService.js               - Generates AI summaries using OpenAI

controllers/
  └── candidateAlertsController.js - Business logic, state management, workflow

.env.example                     - Updated with new environment variables
```

### Modified Files (3)
```
index.js                         - Added A-List API routes
services/jobadderService.js      - Added getCandidateById() method
package.json                     - Added openai dependency
public/dashboard.html            - INTEGRATED with tabs for both features
```

---

## 🚀 Deployment Steps

### Step 1: Install Dependencies

```bash
cd jobadder-brevo-alerts
npm install
```

This will install the new `openai` package.

### Step 2: Update Environment Variables

Add these to your `.env` file (or Railway dashboard):

```bash
# A-List Configuration
A_LIST_TEMPLATE_ID=160
OPENAI_API_KEY=your_openai_api_key_here
```

**Where to get OpenAI API Key:**
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy and paste into your environment variables

**Note:** The system already has `OPENAI_API_KEY` available in the environment, so you may not need to add it manually.

### Step 3: Commit and Push to GitHub

```bash
git add .
git commit -m "Add The A-List candidate email feature with unified dashboard"
git push origin main
```

### Step 4: Railway Deployment

Railway will automatically deploy when you push to GitHub.

**Add Environment Variable in Railway:**
1. Go to your Railway project dashboard
2. Click on your service
3. Go to "Variables" tab
4. Add: `A_LIST_TEMPLATE_ID` = `160`
5. If needed, add: `OPENAI_API_KEY` = `your_key`

### Step 5: Verify Deployment

Once deployed, visit:
- **Unified Dashboard**: `https://your-app.railway.app/dashboard`
  - Tab 1: 📧 Job Alerts
  - Tab 2: 🌟 The A-List

---

## 🧪 Testing Guide

### Test 1: Access Dashboard

1. Navigate to `/dashboard`
2. You should see two tabs:
   - **📧 Job Alerts** (active by default)
   - **🌟 The A-List**

### Test 2: Switch to A-List Tab

1. Click on **"🌟 The A-List"** tab
2. You should see:
   - Current State: EMPTY
   - Candidates Selected: 0
   - Generate A-List button enabled
   - All other buttons disabled

### Test 3: Generate A-List

1. Click **"🎲 Generate A-List"**
2. Wait 30-60 seconds (fetching candidates + AI generation)
3. Expected result:
   - State changes to GENERATED
   - Shows 5 candidates with summaries
   - "Regenerate" and "Send Test" buttons enabled
   - "Approve & Send" still disabled

**What happens behind the scenes:**
- Queries JobAdder notes API for:
  - "Internal Interview"
  - "Candidate Interview"
  - "Phonescreen"
- Filters by last 3 weeks
- Randomly selects 5 candidates
- Generates AI summaries for each
- Saves to `.alist-state.json`

### Test 4: Send Test Email

1. Click **"🧪 Send Test"**
2. Check your `TEST_EMAIL` inbox
3. Expected result:
   - Email received with 5 candidates
   - State changes to TESTED
   - "Approve & Send" button now enabled

### Test 5: Regenerate (Optional)

1. Click **"🔄 Regenerate"** to get a different random 5
2. State stays TESTED if you already sent test
3. You can regenerate as many times as you want

### Test 6: Approve & Send

1. Click **"✅ Approve & Send"**
2. Confirm the dialog
3. Expected result:
   - Email sent to all contacts with `JOB_ALERTS = "Yes"`
   - State changes to SENT
   - After 2 seconds, state resets to EMPTY
   - Ready for next A-List generation

### Test 7: Switch Back to Job Alerts

1. Click **"📧 Job Alerts"** tab
2. Verify job alerts functionality still works
3. Both features operate independently

---

## 🔍 Troubleshooting

### Issue: "No candidates found with interviews in the last 3 weeks"

**Possible causes:**
1. No interviews logged in JobAdder in last 3 weeks
2. Note types don't match exactly

**Solutions:**
- Check JobAdder for interview notes
- Verify note type names in `services/candidateService.js`:
  ```javascript
  this.INTERVIEW_NOTE_TYPES = [
    'Internal Interview',
    'Candidate Interview', 
    'Phonescreen'
  ];
  ```
- Adjust the note type names if needed
- Or change the time period from 3 weeks to longer (in `candidateAlertsController.js`)

### Issue: AI Summary Generation Fails

**Fallback behavior:**
- System automatically uses candidate's existing summary from JobAdder
- Or generates a basic summary from available data
- Check console logs for OpenAI errors

**Solutions:**
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI account has credits
- Check API key permissions

### Issue: Test Email Not Received

**Check:**
1. `TEST_EMAIL` environment variable is set
2. Brevo API key is valid
3. Template ID 160 exists in Brevo
4. Check spam folder

### Issue: Buttons Not Enabling/Disabling Correctly

**This is by design:**
- Generate: Always enabled
- Regenerate: Enabled when state is GENERATED or TESTED
- Send Test: Enabled when state is GENERATED or TESTED
- Approve & Send: **Only** enabled when state is TESTED

**The workflow enforces:**
You MUST send a test email before you can approve and send to all recipients.

---

## 📊 API Endpoints Reference

### A-List Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Unified dashboard with both features |
| GET | `/api/alist/state` | Get current A-List state |
| POST | `/api/alist/generate` | Generate new A-List |
| POST | `/api/alist/send-test` | Send test email |
| POST | `/api/alist/send` | Approve and send to all |
| POST | `/api/alist/reset` | Reset state to EMPTY |

### Job Alerts Endpoints (Unchanged)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Unified dashboard (same as above) |
| POST | `/trigger/daily-roundup` | Send daily job roundup |
| POST | `/trigger/single-job/:jobId` | Send single job alert |

---

## 🎨 Brevo Template Requirements

Your Brevo template (ID: 160) should use these variables:

```handlebars
{{#each params.candidates}}
<div class="candidate-card">
  <h3>#{{this.number}}. {{this.title}}</h3>
  <p><strong>{{this.name}}</strong></p>
  <p>Experience: {{this.experience}}</p>
  <p>{{this.summary}}</p>
  <a href="{{this.profile_url}}">View Profile</a>
</div>
{{/each}}
```

**Available variables per candidate:**
- `number` - Position (1-5)
- `name` - Full name
- `title` - Job title
- `experience` - "X Years"
- `summary` - AI-generated summary
- `profile_url` - JobAdder profile link
- `avatar_url` - Profile photo URL (may be null)

---

## 🔐 Security Notes

1. **State File**: `.alist-state.json` is created in the project root
   - Contains current draft candidates
   - Not committed to git (add to `.gitignore` if needed)
   - Reset after successful send

2. **API Keys**: All sensitive keys in environment variables
   - Never commit `.env` to git
   - Use Railway's secure variable storage

3. **Authorization**: All A-List endpoints check JobAdder authorization
   - Returns 401 if not authorized
   - User must complete OAuth flow first

---

## 📈 Usage Recommendations

### Frequency
- Generate A-List weekly or bi-weekly
- Ensures fresh candidates for clients
- Avoid over-emailing same candidates

### Customization
- Adjust time period in `candidateAlertsController.js`:
  ```javascript
  const allCandidates = await candidateService.getRecentlyInterviewedCandidates(3);
  // Change 3 to any number of weeks
  ```

- Adjust candidate count in `candidateService.js`:
  ```javascript
  selectRandomCandidates(allCandidates, 5);
  // Change 5 to any number
  ```

### Monitoring
- Check console logs for generation details
- Monitor OpenAI usage and costs
- Track email open rates in Brevo

---

## 🎯 Next Steps (Optional Enhancements)

### Phase 2 Features
1. **Scheduling**: Auto-generate and send weekly
2. **Filtering**: Select candidates by skills/role/location
3. **Analytics**: Track which candidates get client interest
4. **Templates**: Multiple email templates for different audiences
5. **History**: Log of all sent A-Lists with candidates

### Implementation Priority
Start with manual workflow, gather feedback, then add automation.

---

## 📞 Support

If you encounter issues:

1. **Check Logs**: Railway logs show detailed error messages
2. **Test Locally**: Run `npm start` locally to debug
3. **Verify Environment**: Double-check all environment variables
4. **Check APIs**: Ensure JobAdder and Brevo APIs are accessible

---

## ✅ Deployment Checklist

- [ ] `npm install` completed
- [ ] `A_LIST_TEMPLATE_ID=160` added to environment
- [ ] `OPENAI_API_KEY` added to environment (if needed)
- [ ] Code pushed to GitHub
- [ ] Railway deployed successfully
- [ ] Dashboard accessible at `/dashboard`
- [ ] Both tabs visible and functional
- [ ] Test generation works
- [ ] Test email received
- [ ] Brevo template renders correctly
- [ ] Approve & Send works
- [ ] State resets after send
- [ ] Job Alerts tab still works

---

## 🎉 You're Ready!

The A-List feature is now live and integrated into your existing dashboard. Navigate to `/dashboard` and switch between Job Alerts and The A-List using the tabs!

**Dashboard URL:**
- `https://your-app.railway.app/dashboard`
  - Tab 1: 📧 Job Alerts
  - Tab 2: 🌟 The A-List

Happy recruiting! 🚀
