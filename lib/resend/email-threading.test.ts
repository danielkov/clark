/**
 * Email Threading Service Tests
 * 
 * Tests for email threading utilities including:
 * - Reply address generation and parsing
 * - Message-ID extraction
 * - Email content cleaning
 * - Comment formatting
 * 
 * Note: These tests focus on utility functions that don't require external services.
 * The sendThreadedEmail function is tested separately with mocked Resend client.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateReplyToAddress,
  parseReplyToAddress,
  extractMessageIdFromComment,
  cleanEmailContent,
  formatEmailCommentWithMetadata,
} from './email-threading';

// Set up minimal environment for tests
beforeAll(() => {
  process.env.RESEND_REPLY_DOMAIN = 'replies.example.com';
});

describe('Email Threading Service', () => {
  describe('generateReplyToAddress', () => {
    it('should generate valid reply-to address', () => {
      const address = generateReplyToAddress('acme', 'issue-123');
      expect(address).toMatch(/^acme\+issue-123@/);
    });

    it('should sanitize org and issue ID', () => {
      const address = generateReplyToAddress('Acme Corp!', 'ISSUE_123');
      expect(address).toMatch(/^acmecorp\+issue123@/);
    });

    it('should handle special characters', () => {
      const address = generateReplyToAddress('test@org', 'issue#456');
      expect(address).toMatch(/^testorg\+issue456@/);
    });
  });

  describe('parseReplyToAddress', () => {
    it('should parse valid reply-to address', () => {
      const result = parseReplyToAddress('acme+issue-123@replies.example.com');
      expect(result).toEqual({
        linearOrg: 'acme',
        issueId: 'issue-123',
      });
    });

    it('should return null for invalid format', () => {
      const result = parseReplyToAddress('invalid@example.com');
      expect(result).toBeNull();
    });

    it('should return null for missing parts', () => {
      const result = parseReplyToAddress('acme@example.com');
      expect(result).toBeNull();
    });

    it('should handle complex issue IDs', () => {
      const result = parseReplyToAddress('myorg+abc-123-xyz@replies.example.com');
      expect(result).toEqual({
        linearOrg: 'myorg',
        issueId: 'abc-123-xyz',
      });
    });
  });

  describe('extractMessageIdFromComment', () => {
    it('should extract Message-ID from comment footer', () => {
      const comment = `Hello, this is my reply.

---

From: John Doe
Message-ID: msg_abc123`;
      
      const messageId = extractMessageIdFromComment(comment);
      expect(messageId).toBe('msg_abc123');
    });

    it('should extract Message-ID with angle brackets', () => {
      const comment = `Reply content

---

From: Jane Smith
Message-ID: <msg_xyz789>`;
      
      const messageId = extractMessageIdFromComment(comment);
      expect(messageId).toBe('msg_xyz789');
    });

    it('should return null if Message-ID not found', () => {
      const comment = 'Just a regular comment without metadata';
      const messageId = extractMessageIdFromComment(comment);
      expect(messageId).toBeNull();
    });

    it('should handle case-insensitive Message-ID', () => {
      const comment = `Content

---

From: User
message-id: msg_test123`;
      
      const messageId = extractMessageIdFromComment(comment);
      expect(messageId).toBe('msg_test123');
    });
  });

  describe('cleanEmailContent', () => {
    it('should remove quoted lines', () => {
      const email = `This is my reply.

> This is a quoted line
> Another quoted line

More content.`;
      
      const cleaned = cleanEmailContent(email);
      expect(cleaned).not.toContain('> This is a quoted line');
      expect(cleaned).toContain('This is my reply');
      expect(cleaned).toContain('More content');
    });

    it('should remove "On ... wrote:" patterns', () => {
      const email = `My response here.

On Mon, Jan 1, 2024 at 10:00 AM, John Doe wrote:
Previous message content`;
      
      const cleaned = cleanEmailContent(email);
      expect(cleaned).not.toContain('On Mon, Jan 1, 2024');
      expect(cleaned).toContain('My response here');
    });

    it('should remove excessive whitespace', () => {
      const email = `Line 1


Line 2




Line 3`;
      
      const cleaned = cleanEmailContent(email);
      expect(cleaned).toBe('Line 1\n\nLine 2\n\nLine 3');
    });

    it('should strip HTML tags', () => {
      const email = '<p>Hello <strong>world</strong></p>';
      const cleaned = cleanEmailContent(email);
      expect(cleaned).toBe('Hello world');
    });

    it('should trim whitespace', () => {
      const email = '  \n  Content here  \n  ';
      const cleaned = cleanEmailContent(email);
      expect(cleaned).toBe('Content here');
    });

    it('should handle complex email with multiple patterns', () => {
      const email = `Thanks for your response!

> On 1/1/2024, Jane wrote:
> > Previous message
> Another quote

On Tue, Jan 2, 2024, User <user@example.com> wrote:
Old content`;
      
      const cleaned = cleanEmailContent(email);
      expect(cleaned).toContain('Thanks for your response');
      expect(cleaned).not.toContain('On 1/1/2024');
      expect(cleaned).not.toContain('Previous message');
      expect(cleaned).not.toContain('Another quote');
    });
  });

  describe('formatEmailCommentWithMetadata', () => {
    it('should format comment with metadata footer', () => {
      const formatted = formatEmailCommentWithMetadata(
        'This is the email body',
        'John Doe',
        'msg_abc123'
      );
      
      expect(formatted).toContain('This is the email body');
      expect(formatted).toContain('---');
      expect(formatted).toContain('From: John Doe');
      expect(formatted).toContain('Message-ID: msg_abc123');
    });

    it('should maintain proper formatting structure', () => {
      const formatted = formatEmailCommentWithMetadata(
        'Email content',
        'Jane Smith',
        'msg_xyz789'
      );
      
      const lines = formatted.split('\n');
      expect(lines[0]).toBe('Email content');
      expect(lines[2]).toBe('---');
      expect(lines[4]).toBe('From: Jane Smith');
      expect(lines[5]).toBe('Message-ID: msg_xyz789');
    });

    it('should handle multi-line email body', () => {
      const body = `Line 1
Line 2
Line 3`;
      
      const formatted = formatEmailCommentWithMetadata(body, 'User', 'msg_123');
      expect(formatted).toContain('Line 1\nLine 2\nLine 3');
      expect(formatted).toContain('From: User');
    });
  });
});
