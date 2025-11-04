---
pageId: 449445889
title: Analytics/Affiliate/Agent/Ads
spaceKey: S5
version: 3
lastUpdated: '712020:0aa84074-41f8-442b-b137-ac2d5bd53315'
pulledAt: '2025-11-04T10:17:44.827Z'
confluenceUrl: 'https://s5philippines.atlassian.net/pages/viewpage.action?pageId=449445889'
parentId: 458457099
connie-publish: true
connie-page-id: '449445889'
---

Since **Terragon Platform (S5)** runs both **web** and **app**, and supports **affiliate-driven traffic** (TikTok, FB, Google Ads, etc.), we’ll design a **unified analytics event schema** that works for all surfaces (web, app, and S2S).

Let’s structure it to:

- Attribute all user actions to the **affiliate (agent)**.
- Support **ad campaign performance tracking**.
- Enable **funnel analysis** from click → signup → deposit → play.
- Work with **Google Analytics 4 + S2S (Measurement Protocol)** + optional export to **TikTok / Meta via CAPI**.


---

## 🎯 Core Design Principles
- ✅ **Consistent event names** across web/app/S2S
- ✅ **Affiliate (aff) ID** persists across all actions (until logout or reset)
- ✅ **Each event includes user + session identifiers** (`user_id`, `aff`, `session_id`, etc.)
- ✅ **Ready for export** to ads networks (TikTok, Meta, Google Ads, etc.)


---

## 🧩 Event Taxonomy (Recommended for S5 Platform)
### **1️⃣ Acquisition Events**

| Event Name        | Trigger                        | Parameters                                       | Notes                                                      |
| ----------------- | ------------------------------ | ------------------------------------------------ | ---------------------------------------------------------- |
| `affiliate_click` | User lands on URL with `?aff=` | `aff`, `campaign`, `source`, `medium`            | Capture from URL, store in cookie/localStorage/app storage |
| `signup_start`    | Signup form opened             | `aff`, `page_location`                           | Useful for drop-off rate                                   |
| `signup`          | User completes signup          | `user_id`, `aff`, `method`, `source`, `campaign` | Sent to GA4 and S2S                                        |
| `login`           | User logs in                   | `user_id`, `aff`, `method`                       | Include `method` = Password / Google / OTP                 |


---

### **2️⃣ Engagement & Retention Events**

| Event Name        | Trigger                           | Parameters                                                              | Notes                         |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------- | ----------------------------- |
| `view_promotion`  | Promotion/bonus page viewed       | `promotion_id`, `promotion_name`, `aff`, `user_id`                      | GA4 content event             |
| `click_promotion` | User clicks on a bonus            | `promotion_id`, `promotion_name`, `aff`, `user_id`                      | Used for CTR tracking         |
| `claim_promotion` | Bonus successfully claimed        | `promotion_id`, `promotion_name`, `user_id`, `aff`, `value`, `currency` | Important for ROI tracking    |
| `search_game`     | User searches for a game          | `search_term`, `aff`, `user_id`                                         | Helps build interest insights |
| `view_game`       | Game page or modal viewed         | `game_id`, `game_name`, `aff`, `user_id`, `provider`                    |                               |
| `click_game`      | User clicks “Play”                | `game_id`, `game_name`, `aff`, `user_id`, `provider`                    |                               |
| `start_game`      | Actual play starts (loading game) | `game_id`, `game_name`, `aff`, `user_id`                                |                               |
| `end_game`        | User finishes or exits game       | `game_id`, `duration`, `win_amount`, `lose_amount`, `aff`, `user_id`    | Optional advanced metric      |


---

### **3️⃣ Payment Funnel Events**

| Event Name             | Trigger                                  | Parameters                                                                 | Notes |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------------------------- | ----- |
| `view_payment_option`  | Payment screen opened                    | `page_location`, `aff`, `user_id`                                          |       |
| `click_payment_option` | User clicks on a specific payment method | `payment_method`, `aff`, `user_id`                                         |       |
| `deposit_start`        | User initiates deposit                   | `amount`, `currency`, `payment_method`, `aff`, `user_id`                   |       |
| `deposit_success`      | Deposit confirmed                        | `amount`, `currency`, `payment_method`, `aff`, `user_id`, `transaction_id` |       |
| `withdraw_start`       | Withdraw flow started                    | `amount`, `currency`, `method`, `user_id`, `aff`                           |       |
| `withdraw_success`     | Withdraw confirmed                       | `amount`, `currency`, `method`, `user_id`, `aff`, `transaction_id`         |       |


---

### **4️⃣ System & Lifecycle Events**

| Event Name      | Trigger                                | Parameters                                  |
| --------------- | -------------------------------------- | ------------------------------------------- |
| `session_start` | When session begins (login, new visit) | `user_id`, `aff`, `device`, `os`, `browser` |
| `session_end`   | On logout or timeout                   | `user_id`, `duration`, `aff`                |
| `logout`        | User logs out manually                 | `user_id`, `aff`                            |


---

## 🧠 Event Example (JSON payload)
Here’s how one event might look when sent S2S or via GA4:

``` 
{
  "name": "deposit_success",
  "params": {
    "user_id": "u12345",
    "aff": "tiktok1",
    "campaign": "tiktok1",
    "amount": 500,
    "currency": "PHP",
    "payment_method": "GCash",
    "transaction_id": "tx_001234",
    "source": "app_android",
    "timestamp": 1730272000
  }
}

```

---

## 🧮 Conversion Funnel (For Performance Ads)

| Funnel Stage | Event                   | Example               |
| ------------ | ----------------------- | --------------------- |
| Impression   | (Tracked by ad network) | TikTok / Meta Ad      |
| Click        | `affiliate_click`       | URL has `aff=tiktok1` |
| Signup       | `signup`                | New user              |
| Deposit      | `deposit_success`       | Money in              |
| Play         | `start_game`            | Real engagement       |

This gives a clean conversion path for **ads → signup → deposit → play**, with `aff` tagging the entire journey.

## 🧱 Implementation Strategy
### **Client-side (Web & App)**
- Capture `?aff` on entry
- Store in cookie/localStorage
- Attach `aff` to all GA4 and S2S events
- Send GA4 client-side events using GTM or Firebase SDK

### **Server-side (S2S)**
- Mirror key financial or authenticated actions (`signup`, `deposit`, `withdraw`)
- Send via **GA4 Measurement Protocol**
- Also send to **Meta CAPI / TikTok Events API / Google Ads API**


---

## ⚙️ Example Event Mapping (GA4 + Ads)

| Event            | GA4                     | Meta (CAPI)            | TikTok                 | Google Ads          |
| ---------------- | ----------------------- | ---------------------- | ---------------------- | ------------------- |
| signup           | `sign_up`               | `CompleteRegistration` | `CompleteRegistration` | `sign_up`           |
| deposit_success  | `purchase`              | `Purchase`             | `Purchase`             | `purchase`          |
| withdraw_success | `withdraw` (custom)     | (custom event)         | (custom event)         | (custom conversion) |
| start_game       | `engagement`            | (custom)               | (custom)               | (custom)            |
| claim_promotion  | `earn_virtual_currency` | (custom)               | (custom)               | (custom)            |


---

## 🧩 Optional Add-ons (Future Proof)
- `aff`** → **`user_properties.aff` in GA4 (so all events include it automatically)
- **Server Event Router** (Node/Go/Python microservice):
- Receives all platform events
- Sends to: GA4 + Meta + TikTok + internal DB
- **Custom Dashboards** in Looker Studio showing:
- Aff-level performance (tiktok1, fb1…)
- Funnel: Click → Signup → Deposit → Play
