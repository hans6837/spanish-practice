# Spanish Pronunciation Practice

Practise speaking Spanish (Spain, es-ES) and get feedback sound by sound,
scored by Microsoft Azure "Pronunciation Assessment".

## What you need (one time)

1. **Python** (free). The program uses it to run on your computer.
   - Download from <https://www.python.org/downloads/> and install.
   - **Windows:** on the first installer screen, tick **"Add python.exe to PATH"**.
   - **Mac:** after installing, open *Applications → Python 3.x* and double-click
     *Install Certificates.command* (optional, but recommended).
2. **A free Azure Speech key** (see "Getting your Azure key" below).
3. **Chrome, Edge or Safari** as your browser.

## Starting the program

- **Windows:** double-click `Start Spanish Practice (Windows).bat`
- **Mac:** double-click `Start Spanish Practice (Mac).command`
  (the first time, macOS may say it's from an unidentified developer:
  right-click the file → **Open** → **Open**).

A small window opens (keep it open while you practise) and your browser shows
the program at <http://localhost:8765>. To stop, close that small window.

**Desktop shortcut**
- Windows: right-click the `.bat` file → *Show more options* → *Send to* → *Desktop (create shortcut)*.
- Mac: right-click the `.command` file → *Make Alias*, then drag the alias to your Desktop.

## First time: Setup check

The program opens on the **Setup check** page:
1. Paste your **KEY 1** and **Region**, then press **Save**.
2. **Azure connection → Test**: you should hear "Hola, vamos a practicar".
3. **Microphone → Test**: allow the microphone, speak, and watch the bar move.
4. **Pronunciation test → Test**: say "Hola, buenos días".

## Practising

| Button | What it does |
|---|---|
| 🔊 Listen | Correct pronunciation (Spain voice, slightly slow) |
| 🐢 Slower | Same, much slower |
| 🎤 Record | Say the phrase. Recording stops by itself when you finish |
| 👂 Hear myself | Plays back your last recording |
| Next ➡ | Next item |

After recording you see an **overall** score plus **accuracy**, **fluency** and **completeness**.
Each word is green (80+), orange (60–79) or red (below 60). Weak sounds are underlined and explained
(for example *"rodilla: r, rolled r. Roll it: the tip of your tongue vibrates…"*). Click any word to see
the score of each of its sounds. Retry as often as you like.

**Items come back based on your first try:** below 65 → it returns after a few other items;
65–84 → tomorrow; 85+ → the gap grows (1, 3, 7, 14, 30 days).

**My progress** shows your daily average, the sounds you find hardest, and the words to work on.
**My words** lets you add your own words or sentences (with English/French) into any deck.

## Getting your Azure key

1. Go to <https://azure.microsoft.com/free> and create a free account (you can sign in with your
   Microsoft/Hotmail account). Microsoft asks for a phone number and a card **to check your identity**.
2. Open <https://portal.azure.com>. In the search bar at the top type **Speech**, choose
   **Speech services**, then **+ Create**.
3. Fill in:
   - *Subscription*: your free subscription
   - *Resource group*: **Create new** → `spanish-practice`
   - *Region*: **West Europe**
   - *Name*: anything unique, e.g. `my-spanish-speech-123`
   - *Pricing tier*: **Free F0**  ← important
4. **Review + create** → **Create**. Wait about a minute → **Go to resource**.
5. In the left menu choose **Keys and Endpoint**. Copy **KEY 1** and note the **Location/Region**
   (e.g. `westeurope`). Paste both into the Setup check page.

**Free tier (F0) limits:** about 5 hours of speech scoring and 500,000 characters of spoken audio
per month, which is plenty for daily practice. F0 does not charge; when the monthly limit is reached
it simply stops until the next month.

## Where things are stored

- `settings.txt`: your key and region (private, stays on your computer, never in the code)
- `data/`: your results (`attempts.jsonl`), review schedule and your own words. Back this folder up if you like.
- `content/decks.json`: the built-in decks.
