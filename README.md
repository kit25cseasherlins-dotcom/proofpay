# ProofPay

AI-powered payment-proof layer for small shops. Built for the PayPal AI Hackathon.

## Problem
Customers say "I paid" (UPI/GPay), but the money never arrives and there is no way to verify it.

## What it does
- Creates a bill with a PayPal checkout link/QR; PayPal webhook marks it PAID automatically
- AI reads payment screenshots, rules check them, and flag mismatches/pending cases
- AI agent drafts reminders and proposes actions (owner approves)

## Tools used
- PayPal Sandbox: Orders API, Webhooks, Refunds
- AI: (Gemini / Claude, fill later)
- Node.js, Express

## Setup
1. `git clone <repo-url>` and `cd proofpay`
2. `npm install`
3. Copy `.env.example` to `.env` and add your PayPal sandbox Client ID/Secret
4. `node server.js` (will update)

## Test accounts
Use PayPal sandbox buyer/seller accounts (see developer.paypal.com).

## License
MIT