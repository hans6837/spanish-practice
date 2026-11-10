# Spanish Pronunciation Practice

Practise speaking Spanish (Spain, es-ES) on your iPad and get feedback sound by sound,
scored by Microsoft Azure "Pronunciation Assessment".

It is a web page that runs entirely in Safari: no app to install.
Your Azure key and your results are stored **only on your iPad**, never in this code.

## Opening it

Open the program's web address, **https://hans6837.github.io/spanish-practice/**, in **Safari**, then tap **Share** (square with an arrow) →
**Add to Home Screen** → **Add**. From then on, open it with the **Español** icon.
(Using the icon also keeps your results safe: Safari may delete data of websites you haven't visited for a while.)

## First time: Setup

The program opens on the **Setup** tab:
1. Paste your **KEY 1** and **Region** (for example `westeurope`), choose a voice and speed, tap **Save**.
   The Azure connection is tested straight away: you should hear "Hola, vamos a practicar".
2. **Microphone → Test**: tap **Allow**, speak, and watch the bar move.
3. **Pronunciation test → Test**: say "Hola, buenos días".

## Practising

| Button | What it does |
|---|---|
| 🔊 Listen | Correct pronunciation (Spain voice, slightly slow) |
| 🐢 Slower | Same, much slower |
| 🎤 Record | Say the phrase. It stops by itself when you finish (or tap ⏹ Stop) |
| 👂 Hear myself | Plays back your last recording |
| Next ➡ | Next item |

You get an **overall** score plus **accuracy**, **fluency** and **completeness**. Each word is green (80+),
orange (60–79) or red (under 60). Weak sounds are underlined and explained in plain language, for example
*"rodilla: r, rolled r. Roll it: the tip of your tongue vibrates…"*. Tap a word to see the score of each sound.

**Items come back based on your first try:** under 65 → after a few other items; 65–84 → tomorrow;
85+ → longer and longer gaps (1, 3, 7, 14, 30 days).

- **Progress**: daily average, your hardest sounds (tap one for a tip), the words to work on, and
  **Save a backup** / **Restore a backup** (save it to iCloud Drive via "Save to Files").
- **My words**: add your own words or sentences with English and French, in any deck.

## Getting your Azure key

1. Go to <https://azure.microsoft.com/free> and create a free account (you can sign in with your Microsoft/Hotmail
   account). Microsoft asks for a phone number and a card **to check your identity**.
2. Open <https://portal.azure.com>, search **Speech** at the top, choose **Speech services**, then **+ Create**.
3. Fill in: *Resource group* → **Create new** → `spanish-practice`; *Region* → **West Europe**;
   *Name* → something unique like `my-spanish-speech-123`; *Pricing tier* → **Free F0**.
4. **Review + create** → **Create**, wait about a minute → **Go to resource**.
5. Left menu → **Keys and Endpoint**: copy **KEY 1** and note **Location/Region**.

**Free tier (F0):** about 5 hours of speech scoring and 500,000 characters of spoken audio per month.
F0 does not charge: when the limit is reached it simply stops until the next month.

## Files

- `index.html`, `style.css`, `app.js`: the page
- `sounds.js`: Spanish sound guide and tips
- `store.js`: saving on the iPad (results, review schedule, your words, settings)
- `decks.js`: the built-in decks (76 items)
- `vendor/speech-sdk.min.js`: Microsoft's Speech toolkit for browsers
- `tests/`: automated checks (`node tests/test_sounds.js`, `node tests/test_store.js`)
