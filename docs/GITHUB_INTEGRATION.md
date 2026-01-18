# GitHub Integration & Feedback Setup

This document outlines how to set up the Feedback integration for TechnologyOne Analyser.

## 1. The Strategy: Client-Side Security

Since this application runs entirely in the browser ("Local-First" / "Vanilla SPA"), **it is unsafe to store high-privilege API Keys (like GitHub Personal Access Tokens) directly in the code.** If you do, anyone with access to the application files can extract your key and impersonate you.

Therefore, our "Feedback" implementation uses a **Direct Redirect** strategy:

1.  The user clicks "Feedback".
2.  The app opens a new tab to your repository's "New Issue" page.
3.  The user logs in to GitHub (if not already) and submits the issue themselves.

This ensures:

- **Zero Key Exposure**: No secrets are bundled in the app.
- **User Attribution**: Issues are correctly linked to the user reporting them, not a generic "bot".

## 2. Configuration

To enable the feedback button, you need to configure your repository URL in `src/main.ts` (or a config file).

### Setting the URL

Search for the `FEEDBACK_URL` constant in `src/main.ts` and update it:

```typescript
// src/main.ts
const FEEDBACK_URL =
  "https://github.com/YOUR_ORG/YOUR_REPO/issues/new?labels=feedback";
```

## 3. Advanced: Using a GitHub App (Optional)

If you absolutely require programmatic access (e.g., automatically creating issues without user interaction), you must use a **GitHub App** with a **Backend Proxy**.

### Step A: Create the GitHub App

1.  Go to **GitHub Settings > Developer settings > GitHub Apps > New GitHub App**.
2.  **Name**: "T1 Analyser Feedback".
3.  **Homepage URL**: Your app's URL.
4.  **Callback URL**: Your app's URL (for OAuth).
5.  **Permissions**:
    - **Issues**: Read & Write.
6.  **Subscribe to events**: Check "Issues".
7.  **Create App**.
8.  Generate a **Private Key** and note the **App ID**.

### Step B: The Backend Proxy (Crucial)

You cannot use the Private Key in the browser. You must set up a server (e.g., Firebase Functions, AWS Lambda):

1.  **Client** sends feedback text to **Your Server**.
2.  **Your Server** (which holds the Private Key) authenticates with GitHub.
3.  **Your Server** posts the issue to GitHub.
4.  **Your Server** returns success to the Client.

**We strongly recommend sticking to the Direct Redirect method for this local tool to avoid this infrastructure complexity.**

## 4. FAQ: Can I embed the Ticket Form directly in the UI?

Short Answer: **No, not securely without a backend.**

### Why?

1.  **Iframes are Blocked**: GitHub sends `X-Frame-Options: deny` headers. You simply cannot display `github.com` inside an `<iframe>` in your app. The browser will block it.
2.  **CORS & Security**: To call the GitHub API directly (`POST /repos/.../issues`), you need an API Token.
    - **Browser-side Token**: If you put a token in your JS code, _anyone_ who uses your app can grab it and delete your entire repository.
    - **No Token**: GitHub will reject the request.

### The "Embedded Experience" Compromise

If you want the _feel_ of an embedded form without the security risk:

1.  **Data Collection Modal**: Create a form in your generic "Feedback" modal (Subject, Body).
2.  **Encoded URL**: When they click "Send", constructs a URL with those values:
    (e.g., `.../issues/new?title=My+Bug&body=I+found+a+bug...`).
3.  **Redirect**: Opens that URL. The user lands on GitHub with the ticket **already filled out**, just needing to click "Submit".

This provides 90% of the "embedded" value (custom prompts, logs attached automatically) with 0% of the security risk.

## 5. FAQ: Can users log tickets without a GitHub account?

Short Answer: **Yes, but it requires a "Middleman".**

GitHub _always_ requires an authenticated user to create an issue. To allow "anonymous" users to post, you must have a system that "pretends" to be a GitHub user.

### Option A: The "Proxy Server" (High Effort)

You build a backend (Cloud Function / AWS Lambda) that:

1.  Accepts the message from your app.
2.  Authenticates as a **GitHub App Bot**.
3.  Posts the issue to the repo.

**Major Risk: SPAM.** If you do this without a CAPTCHA, bots will find your endpoint and flood your repository with thousands of junk issues.

### Option B: The "Form + Automation" (Low Code)

1.  Create a **Google Form** or **Microsoft Form**.
2.  Embed that form in your app (Iframe is allowed for these).
3.  Use **Zapier** or **Power Automate** to watch for new form responses -> Create GitHub Issue.

**Pros:**

- Zero code in your app.
- Spam protection handled by Google/Microsoft.
- Users don't need GitHub accounts.

**Cons:**

- Interaction is one-way (users won't see updates on their issue).

## 6. Draft: Anonymous Feedback Form

If you choose **Option B**, create a form with the following structure:

### **Section 1: The Basics**

- **What type of feedback is this?** (Dropdown)
  - 🐛 Bug Report
  - ✨ Feature Request
  - ❓ General Question
- **Summary** (Short Answer)
  - _e.g., "The ETL viewer crashes on large files"_

### **Section 2: The Details (Conditional: Bug Report)**

- **What happened?** (Paragraph)
  - _Describe the steps to reproduce the issue._
- **What did you expect to happen?** (Paragraph)
- **Browser / Environment** (Short Answer)
  - _e.g., Chrome v120 on Windows 11_
- **Console Errors (Optional)** (Paragraph)
  - _Paste any red text from the Developer Console (F12)._

### **Section 3: Feature Ideas (Conditional: Feature Request)**

- **Describe your idea** (Paragraph)
- **Why is this important?** (Paragraph)
  - _How does this help your workflow?_

### **Section 4: Contact (Optional)**

- **Your Email** (Email Validation)
  - _Leave blank to remain anonymous. If provided, we may contact you for clarification._

---

**Tip:** Once created, copy the "Embed HTML" code from the form and place it in a generic modal within the app.

## 7. Advanced: Pre-populating the Google Form

Yes! You can automatically fill in fields (like App Version or Browser Info) so users don't have to.

### How to do it:

1.  Open your Google Form in **Edit** mode.
2.  Click **Three Dots (⋮) > Get pre-filled link**.
3.  Fill in the form with placeholder data (e.g., `APP_VERSION`, `BROWSER_INFO`).
4.  Click **Get Link** and copy it.
5.  It will look like this:
    `https://docs.google.com/forms/d/e/.../viewform?entry.12345=APP_VERSION&entry.67890=BROWSER_INFO`

### Implementation in Code:

In your `src/main.ts`, construct this URL dynamically before opening the window:

```typescript
const FORM_BASE = "https://docs.google.com/forms/d/e/.../viewform";

window.openFeedback = () => {
  const version = "3.1 (Local)";
  const browser = navigator.userAgent;

  // Use URLSearchParams to safe-encode values
  const params = new URLSearchParams();
  params.append("entry.12345", version); // Replace with your actual field ID
  params.append("entry.67890", browser); // Replace with your actual field ID

  window.open(`${FORM_BASE}?${params.toString()}`, "_blank");
};
```

This ensures high-quality context for every bug report without burdening the user.
