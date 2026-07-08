# Demo Script — Sentinel Gateway Showpiece

**Purpose:** Step-by-step conversation sequences to demonstrate both apps on both channels.

---

## Setup Checklist (Before Demo)

- [ ] WhatsApp test number registered in Meta dashboard
- [ ] Telegram bot created, webhook registered
- [ ] Both gateways running and accessible via public URL
- [ ] Google Calendar configured with service account access
- [ ] OpenAI API key set
- [ ] Demo `.env` loaded for both services

---

## Demo Flow 1 — WhatsApp: Concierge Booking

| Turn | You send                  | Expected bot reply                        |
| ---- | ------------------------- | ----------------------------------------- |
| 1    | (cold start — no message) | Menu with options 1 & 2                   |
| 2    | `what is sentinel`        | Global FAQ answer about Sentinel          |
| 3    | `1`                       | Concierge intro + asks for date           |
| 4    | `what are your hours`     | In-app FAQ: "Mon–Fri 9am–5pm"             |
| 5    | `tomorrow`                | Lists available time slots                |
| 6    | `2`                       | Confirms selected slot, asks yes/no       |
| 7    | `yes`                     | Booking confirmed + reference code + menu |
| 8    | (now back at menu) `2`    | Cook intro: send a photo                  |

---

## Demo Flow 2 — WhatsApp: Cook via Cold Photo

| Turn | You send               | Expected bot reply               |
| ---- | ---------------------- | -------------------------------- |
| 1    | 📸 (photo of any dish) | Recipe + nutritional info + menu |

---

## Demo Flow 3 — Escape Mid-Flow

| Turn | You send  | Expected bot reply                             |
| ---- | --------- | ---------------------------------------------- |
| 1    | `1`       | Concierge intro                                |
| 2    | `15 July` | Time slot list                                 |
| 3    | `menu`    | Back to main menu (session cleared)            |
| 4    | `2`       | Cook intro (clean session, no Concierge state) |

---

## Demo Flow 4 — Telegram: Same Flows

Repeat Flows 1–3 on Telegram. Key differences to highlight:

- Bot uses a different token/secret verification (secret token vs HMAC)
- Same session does NOT bleed between WhatsApp and Telegram (different channel prefix)
- Same UX, same replies

| Turn | You send            | Expected bot reply                   |
| ---- | ------------------- | ------------------------------------ |
| 1    | `what is concierge` | Concierge FAQ                        |
| 2    | `1`                 | Concierge intro                      |
| 3    | `next Monday`       | Available slots for next Monday      |
| 4    | `0`                 | Back to menu                         |
| 5    | 📸 (dish photo)     | Cook auto-routes: recipe + nutrition |

---

## Points to Highlight During Demo

1. **Channel-agnostic core** — same routing/FAQ/session logic runs on both WhatsApp and Telegram.
2. **Global escape hatch** — `menu` or `0` works anywhere, any session state.
3. **Cold photo auto-route** — no need to type `2` first; just send a photo.
4. **Session isolation** — two users in parallel, independent sessions.
5. **In-app FAQ** — questions answered without disrupting the booking flow.
6. **Status "done" teardown** — after booking/recipe, session auto-clears and menu reappears.
