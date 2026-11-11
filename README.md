# Spanish Pronunciation Practice

A Spanish course on your iPad (Spain or Mexico accent) and get feedback sound by sound,
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

## The course

The course lives in **`spanish_course.json`** (6 levels: sounds → A1 → A2 → B1 → B2 → C1, ending with clinical
physiotherapy language). Each level has units; each unit has a short lesson, example phrases and practice items
(Spanish, English, French and a pronunciation tip with the stressed syllable in CAPITALS).

- **Home** shows all levels and units with the % learned, an **Up next** button (the first unit not yet learned),
  today's new items and reviews due, and **your weakest sounds** across the whole course.
- A **unit counts as learned** when 80% of its items have scored **80 or more on two different days**.
- Nothing is locked: open any unit at any time.
- In a unit: read the lesson, listen to the example phrases (🔊 Listen / 🐢 Slow), then tap **Practice**.
  For each item the model plays, you record, and you get your scores; the tip and the French translation
  appear after your attempt.
- **Spaced repetition:** items you score badly on come back after a few other items; good ones come back
  after 1, 3, 7, 14, then 30 days. New items are limited per day (Settings, default 10); you can always continue anyway.
- **Level 1 (the sounds)** names the exact sound that was wrong and compares it with French
  (for example "keep the r at the tip of the tongue, not in the throat like French").
- **Settings:** accent (Spain es-ES or Mexico es-MX, used for the model voice *and* the scoring),
  voice, speed and new items per day.

**Updating the course:** replace `spanish_course.json` with a new version. The app reads it fresh each time it
opens. Your progress is linked to the Spanish text of each item, so it is kept even if units are renamed,
reordered or moved. If the file can't be read, the app says why (Settings → Course) and shows the old word decks.

## Vocabulary (spoken test)

The **Vocabulary** tab tests the words and phrases you have practised in the course, by voice only:

- **Spanish → English:** you hear the Spanish (the text stays hidden) and say what it means in English.
- **English → Spanish:** you see and hear the English and say it in Spanish (you also get a pronunciation score).
- In "Both directions", a word is first tested Spanish → English; once you get it right, English → Spanish is added.
- Wrong answers come back after a minute (and again before the test ends); right answers come back after
  10 minutes, then 1, 3, 7, 21 and 60 days. Home shows how many words are due.
- Answers are checked generously (e.g. "to stretch" = "stretch"; any meaning in "tomorrow; morning" counts).
  If the recogniser mishears you, tap **I was right**. **I don't know** shows the answer.
- **Difficult words are remembered.** Each miss gives a word 2 "difficulty points", each right answer removes 1
  (a right Spanish answer with pronunciation under 60 adds 1). Words with points open every new test (up to 5),
  never wait more than a day, and are listed under **My difficult words** with a button to practise only them.

## Practice buttons

| Button | What it does |
|---|---|
| 🔊 Listen | Correct pronunciation |
| 🐢 Slower | Same, much slower |
| 🎤 Record | Say the phrase. It stops by itself when you finish (or tap ⏹ Stop) |
| 👂 Hear myself | Plays back your last recording |
| Next ➡ | Next item |

Scores: **overall**, **accuracy**, **fluency** and **completeness**. Each word is green (80+), orange (60–79) or
red (under 60); weak sounds are underlined and explained. Tap a word to see the score of each sound.

- **Progress**: daily average, hardest sounds, words to work on, and **Save a backup** / **Restore a backup**.
- **My words**: add your own words or sentences; they appear on Home under "My words".

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

- `spanish_course.json`: the course (replace it to update the course)
- `index.html`, `style.css`, `app.js`: the screens
- `course.js`: reads the course file (accepts English or Spanish field names)
- `speech.js`: Azure voice, recording and scoring (with the iPad audio fixes)
- `vocab.js`: checks spoken vocabulary answers (English and Spanish)
- `sounds.js`: Spanish sound guide, tips and French comparisons (Spain and Mexico)
- `store.js`: saving on the iPad (results, review schedule, your words, settings)
- `decks.js`: the original word decks (used to carry over old progress, and as a fallback)
- `vendor/speech-sdk.min.js`: Microsoft's Speech toolkit for browsers
- `tests/`: automated checks (`node tests/test_course.js`, `node tests/test_store.js`, `node tests/test_sounds.js`, `node tests/test_vocab.js`)
