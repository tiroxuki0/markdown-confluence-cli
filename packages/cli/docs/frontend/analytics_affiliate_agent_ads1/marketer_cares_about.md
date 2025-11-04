---
pageId: 449118219
title: Marketer Cares About?
spaceKey: S5
version: 2
lastUpdated: '712020:0aa84074-41f8-442b-b137-ac2d5bd53315'
pulledAt: '2025-11-04T10:17:44.826Z'
confluenceUrl: 'https://s5philippines.atlassian.net/pages/viewpage.action?pageId=449118219'
parentId: 458457099
connie-publish: true
connie-page-id: '449118219'
---

## 👉 What events actually drive insights that help increase deposit and revenue?
🎯 Marketing Objective

> **Maximize deposits and revenue**
> by understanding where users come from (affiliates, campaigns),
> how they behave (browse, claim, deposit),
> and where they drop off.


---

## 🧩 Key AppEvents a Marketer Cares About
Let’s group them by **marketing goal**:


---

### 1️⃣ Acquisition & Attribution

| Event                      | Purpose                                | Why it matters                                     |
| -------------------------- | -------------------------------------- | -------------------------------------------------- |
| `affiliate_click`          | When a user lands from an ad (`?aff=`) | Measures traffic volume from each agent / campaign |
| `signup_submit_success`    | Completed signup                       | Measures conversion rate from click → signup       |
| `login_submit_success`     | Logged-in returning user               | Measures retention and reactivation                |
| `identify` / `set_user_id` | Ties all events to a single player     | Enables user-level LTV analysis                    |

👉 **KPIs**:

- CTR per campaign
- Signup Conversion Rate
- Cost per Signup (CPS)


---

### 2️⃣ Engagement & Retention

| Event                                                          | Purpose                           | Why it matters                               |
| -------------------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| `promotion_view`, `promotion_click`, `promotion_claim_success` | Measure bonus campaign engagement | Which promotions drive deposits or gameplay  |
| `game_view`, `game_click`, `game_launch_success`               | Game interest & engagement        | Identify popular games that attract deposits |
| `game_search`                                                  | What players are looking for      | Optimize game categories or SEO              |
| `news_view`, `news_category_click`                             | Engagement with content           | Tracks interest in informational content     |

👉 **KPIs**:

- Bonus engagement rate
- Game engagement rate
- Return visit rate


---

### 3️⃣ Monetization Funnel

| Event                                 | Purpose                      | Why it matters                                    |
| ------------------------------------- | ---------------------------- | ------------------------------------------------- |
| `deposit_payment_option_button_click` | User viewed/selected payment | Detect drop-offs in payment step                  |
| `deposit_submit_success`              | Payment form completed       | Pre-deposit intent metric                         |
| `deposit_success`                     | Money deposited              | Main conversion goal                              |
| `withdraw_success`                    | Payout                       | Indicates active/high-value users                 |
| `kyc_submit_success`                  | Verified users               | Unlocks deposit/withdraw; tracks funnel readiness |

👉 **KPIs**:

- Deposit Conversion Rate
- Average Deposit Amount
- First Deposit Rate
- Cost per First Deposit (CPF)
- Retention (2nd deposit, 7-day activity)


---

### 4️⃣ Retargeting / CRM Triggers
Use these AppEvents to power **remarketing audiences** in Google, Meta, TikTok Ads:


| Audience Segment                   | Event Conditions                                 | Use For                    |
| ---------------------------------- | ------------------------------------------------ | -------------------------- |
| “Clicked ad but not signed up”     | `affiliate_click` but no `signup_submit_success` | Retarget with signup offer |
| “Signed up but never deposited”    | `signup_submit_success` but no `deposit_success` | Deposit welcome campaign   |
| “Deposited once but not in 7 days” | 1 `deposit_success`, inactivity 7d               | Re-engagement bonus ad     |
| “Viewed game but didn’t play”      | `game_view` but no `game_launch_success`         | Game-based retargeting     |
| “Claimed promo”                    | `promotion_claim_success`                        | Upsell related promo       |


---

## 🔁 Ideal Marketing Funnel with AppEvents

| Stage              | AppEvent                   | What Marketer Learns           |
| ------------------ | -------------------------- | ------------------------------ |
| 1️⃣ Ad click       | `affiliate_click`          | Source, campaign effectiveness |
| 2️⃣ Signup         | `signup_submit_success`    | Conversion rate per agent      |
| 3️⃣ First deposit  | `deposit_success`          | ROI per campaign               |
| 4️⃣ Gameplay       | `game_launch_success`      | Engagement level               |
| 5️⃣ Repeat deposit | `deposit_success` (repeat) | Retention / LTV per campaign   |

This builds a **full-funnel dashboard**:

> Impressions → Clicks → Signups → First Deposits → Active Players → Total Revenue

## 📊 As an Agency, You’ll Want to Track

| Metric                      | Based On AppEvents                            | What it tells you             |
| --------------------------- | --------------------------------------------- | ----------------------------- |
| Click → Signup conversion   | `affiliate_click` → `signup_submit_success`   | Campaign funnel performance   |
| Signup → Deposit conversion | `signup_submit_success` → `deposit_success`   | Quality of leads from agents  |
| Deposit amount per campaign | `deposit_success.amount`                      | Campaign ROI                  |
| LTV per aff_id              | All user revenue grouped by `aff_id`          | Affiliate profitability       |
| Game interest by campaign   | `game_click` + `aff_id`                       | Which game drives deposits    |
| Promotion effectiveness     | `promotion_claim_success` + `deposit_success` | Which promo leads to deposits |


---

## 💰 How This Translates to Growth

| Insight                                              | Action                                       |
| ---------------------------------------------------- | -------------------------------------------- |
| “TikTok1 gets signups but no deposits”               | Improve onboarding or bonus for TikTok users |
| “Facebook2 users deposit 2× more”                    | Increase budget for FB2 agent                |
| “Most deposits come after promotion clicks”          | Schedule more promos for active campaigns    |
| “GCash deposits convert best”                        | Feature that payment prominently             |
| “Slots category gets high game_view but low deposit” | Run slot-specific promo campaign             |


---

## 🧠 Summary: What You Should Track for Revenue Growth

| Funnel Stage | Must-Have AppEvent                               | Purpose         |
| ------------ | ------------------------------------------------ | --------------- |
| Awareness    | `affiliate_click`                                | Attribution     |
| Acquisition  | `signup_submit_success`, `login_submit_success`  | Conversion      |
| Activation   | `deposit_submit_success`, `deposit_success`      | Monetization    |
| Retention    | `promotion_claim_success`, `game_launch_success` | Engagement      |
| Revenue      | `deposit_success.amount`, `withdraw_success`     | LTV measurement |
