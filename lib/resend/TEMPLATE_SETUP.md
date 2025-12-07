# Resend Email Template Setup Instructions

This document provides instructions for creating email templates in the Resend dashboard.

## Prerequisites

1. Sign up for a Resend account at https://resend.com
2. Verify your domain in the Resend dashboard
3. Get your API key from https://resend.com/api-keys

## Template Creation

Navigate to https://resend.com/templates and create the following templates:

### 1. Confirmation Email Template

**Template Name:** Application Confirmation

**Variables:**
- `candidate_name` - Candidate's full name
- `organization_name` - Organization name
- `position_title` - Job position title

**Subject:** Application Received - {{position_title}}

**Sample Content:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2>Thank you for your application!</h2>
    
    <p>Hi {{candidate_name}},</p>
    
    <p>We've received your application for the <strong>{{position_title}}</strong> position at {{organization_name}}.</p>
    
    <p>Our team will review your application and get back to you soon. If you have any questions in the meantime, feel free to reply to this email.</p>
    
    <p>Best regards,<br>
    The {{organization_name}} Team</p>
  </div>
</body>
</html>
```

**After creating:** Copy the template ID and add it to your `.env.local` file as `RESEND_TEMPLATE_CONFIRMATION`

---

### 2. Rejection Email Template

**Template Name:** Application Update

**Variables:**
- `candidate_name` - Candidate's full name
- `position_title` - Job position title

**Subject:** Update on your application for {{position_title}}

**Sample Content:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2>Application Update</h2>
    
    <p>Hi {{candidate_name}},</p>
    
    <p>Thank you for your interest in the <strong>{{position_title}}</strong> position and for taking the time to apply.</p>
    
    <p>After careful consideration, we've decided to move forward with other candidates whose experience more closely matches our current needs.</p>
    
    <p>We appreciate your interest in our organization and encourage you to apply for future opportunities that match your skills and experience.</p>
    
    <p>Best wishes in your job search,<br>
    The Hiring Team</p>
  </div>
</body>
</html>
```

**After creating:** Copy the template ID and add it to your `.env.local` file as `RESEND_TEMPLATE_REJECTION`

---

### 3. Screening Invitation Email Template

**Template Name:** AI Screening Invitation

**Variables:**
- `candidate_name` - Candidate's full name
- `organization_name` - Organization name
- `position_title` - Job position title
- `session_link` - ElevenLabs agent session URL

**Subject:** AI Screening Interview - {{position_title}}

**Sample Content:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2>You're invited to an AI Screening Interview!</h2>
    
    <p>Hi {{candidate_name}},</p>
    
    <p>Great news! Your application for the <strong>{{position_title}}</strong> position at {{organization_name}} has passed our initial review.</p>
    
    <p>As the next step, we'd like to invite you to complete a brief AI-powered screening interview. This conversation will take about 10-15 minutes and will help us better understand your qualifications and experience.</p>
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="{{session_link}}" style="background-color: #0066cc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Start Screening Interview</a>
    </div>
    
    <h3>About the Position</h3>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
      {{job_description}}
    </div>
    
    <h3>What to Expect</h3>
    <p>During the interview, we'll discuss:</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
      {{conversation_pointers}}
    </div>
    
    <p><strong>Tips for success:</strong></p>
    <ul>
      <li>Find a quiet place with a good internet connection</li>
      <li>Have your resume handy for reference</li>
      <li>Be yourself and speak naturally</li>
      <li>Take your time to think before answering</li>
    </ul>
    
    <p>If you have any questions, feel free to reply to this email.</p>
    
    <p>Best regards,<br>
    The {{organization_name}} Team</p>
  </div>
</body>
</html>
```

**After creating:** Copy the template ID and add it to your `.env.local` file as `RESEND_TEMPLATE_SCREENING_INVITATION`

---

### 4. Comment Email Template

**Template Name:** Application Comment

**Variables:**
- `candidate_name` - Candidate's full name
- `position_title` - Job position title
- `comment_body` - The comment content
- `commenter_name` - Name of the person sending the comment in Linear

**Subject:** Update on your application for {{position_title}}

**Sample Content:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2>Message from the Hiring Team</h2>
    
    <p>Hi {{candidate_name}},</p>
    
    <p>We have an update regarding your application for the <strong>{{position_title}}</strong> position:</p>
    
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; white-space: pre-wrap;">
{{comment_body}}
    </div>
    
    <p>If you have any questions or would like to provide additional information, feel free to reply to this email.</p>
    
    <p>Best regards,<br>
    The Hiring Team</p>
  </div>
</body>
</html>
```

**After creating:** Copy the template ID and add it to your `.env.local` file as `RESEND_TEMPLATE_COMMENT`

---

## Publishing Templates

After creating each template:

1. Click "Publish" to make the template available for use
2. Copy the template ID (format: `template_xxxxxxxxxxxxx`)
3. Add the template ID to your environment variables

## Testing Templates

You can test templates in the Resend dashboard by:

1. Navigating to the template
2. Clicking "Send Test Email"
3. Providing sample values for all variables
4. Sending to your test email address

## Webhook Configuration

After setting up templates, configure the Resend webhook:

1. Navigate to https://resend.com/webhooks
2. Create a new webhook endpoint
3. Set the URL to: `https://yourdomain.com/api/webhooks/resend`
4. Select the following events:
   - `email.sent`
   - `email.delivered`
   - `email.bounced`
   - `email.complained`
5. Copy the webhook secret and add it to your `.env.local` file as `RESEND_WEBHOOK_SECRET`

## Environment Variables Summary

After completing all steps, your `.env.local` should include:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
RESEND_REPLY_DOMAIN=replies.yourdomain.com
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
RESEND_TEMPLATE_CONFIRMATION=template_xxxxxxxxxxxxx
RESEND_TEMPLATE_REJECTION=template_xxxxxxxxxxxxx
RESEND_TEMPLATE_SCREENING_INVITATION=template_xxxxxxxxxxxxx
RESEND_TEMPLATE_COMMENT=template_xxxxxxxxxxxxx
```
