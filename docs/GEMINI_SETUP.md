# Gemini API Setup Guide

This guide walks you through creating a Google Gemini account and securely adding the API key for the Command Center app (e.g., DevTools Error Wrap-Up analysis).

## 1. Create or Use a Google Account

- **Personal:** Use any Gmail account.
- **Work/School:** Use your organization’s Google Workspace account if allowed by your admin.

## 2. Get a Gemini API Key

1. Go to **[Google AI Studio](https://aistudio.google.com/app/apikey)**.
2. Sign in with your Google account.
3. Accept the Terms of Service if prompted.
4. Click **Create API key** (or **Get API key**).
5. Choose a project:
   - **New users:** A default project is created.
   - **Existing users:** Select an existing project or create one.
6. Copy the generated API key and store it securely.

## 3. Add the Key Securely to the App

### Local development

1. Copy `.env.example` to `.env` if you haven’t already:
   ```bash
   cp .env.example .env
   ```
2. Add your key to `.env`:
   ```
   GEMINI_API_KEY="your-actual-api-key-here"
   ```
3. `.env` is gitignored — never commit it.

### Deployed (Railway)

1. Open your Railway project dashboard.
2. Go to **Variables**.
3. Add the variable:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** Your API key (paste as plain text; Railway hides it).
4. Redeploy if needed so the new variable is picked up.

## 4. Security rules

- **Never commit** the API key to Git.
- **Never expose** in client-side code (e.g., `NEXT_PUBLIC_*`).
- **Use only** in server-side API routes (e.g., `/api/devtools/gemini-analyze`).
- **Rotate** the key if it becomes compromised.
- **Restrict** the key in Google Cloud Console if you use it in production (IP limits, API restrictions).

## 5. Optional: Google Cloud restrictions

For production use:

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services** → **Credentials**.
3. Find your API key and edit it.
4. Add restrictions:
   - **Application restrictions:** Restrict to your server IPs or HTTP referrers.
   - **API restrictions:** Limit to “Generative Language API”.

## 6. Verify

- Local: Run the app and use DevTools Error Wrap-Up (if Gemini integration is enabled).
- Railway: Check that the variable is set in the Variables tab and redeploy.
