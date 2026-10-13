# Chapter 7 The Prompt Tab - Collecting and Growing Your Spells

A prompt that worked well is your own treasure.
But if you only paste it into a notepad, you can easily lose track of which was which.

The **Prompt** tab is a place to **save, sort and reuse** prompts.
In addition, you can use translation with local AI, and "wildcards" that change the prompt a little each time.

---

## 7-1 Prompt basics

Before getting into how to use the Prompt tab, let's cover the basics of writing prompts.

### Positive and negative
| Kind | What to write | Example |
| --- | --- | --- |
| Positive Prompt | What you want drawn | `1girl, smiling, school uniform, cherry blossoms, spring` |
| Negative Prompt | What you do not want drawn | `low quality, blurry, extra fingers, watermark` |

### Tips for writing
- **Write in English** - most models were trained on English.
- **Separate with commas (,)** - it is common to line up words and short phrases separated by commas.
- **Put important things first** - words written earlier tend to be reflected more strongly.
- **Emphasize words with (word:number)** - writing `(red hair:1.3)` emphasizes that word (1.0 is the default).

> **Tip: change the emphasis number from the keyboard**
> In the prompt field of GenerateUI, select the word to emphasize and press **Ctrl + Up/Down**
> to raise or lower the number in `(word:number)` by 0.05. When the number returns to 1.0, the parentheses are removed automatically.

> **Tip**
> Anime-style SDXL models suit "lining up tags", and newer models such as FLUX suit "describing in ordinary English sentences".
> The model's distribution page often lists a recommended way of writing, so check it.

---

## 7-2 The Prompt tab screen

The Prompt tab is divided into three columns: left, center and right.

| Column | Name | Role |
| --- | --- | --- |
| Left | AI Assistant | Chat and translation with local AI (7-5) |
| Center | Presets / Preset Manager | Saving, listing and sorting prompts (7-3) |
| Right | Wildcard / Style | Managing wildcards and styles (7-4) |

With **Form / Table** at the top of the screen, you can switch how things are displayed.

- **Form** - a screen for editing one item at a time (the screen this chapter explains)
- **Table** - a screen for editing presets and wildcards together in a table (handy when the count grows)

---

## 7-3 Saving and sorting as presets

A **preset** is a pair of positive and negative prompts saved together under a name.

### Saving a preset
1. In the center column, open the **Presets** tab.
2. Check that the topmost pull-down shows **New Preset (none selected)**.
3. Fill in the following items.

   | Item | Contents |
   | --- | --- |
   | Preset Name | The name of the preset (for example `Sakura and uniform`) |
   | Category | A classification (for example `Portrait`, `Landscape`). May be omitted |
   | Positive Prompt | What you want drawn |
   | Negative Prompt | What you do not want drawn |

4. Press **Save**. When a message says the preset was saved, you are done.

> **Tip**
> Get into the habit of saving prompts you tried in GenerateUI and thought "this is good!" as presets on the spot.
> Later, when you want to make an image with the same feel, you can recall it right away.

### Recalling and using a preset
1. From the topmost pull-down, choose the preset you want to use.
2. Press a button according to how you want to use it.

| Button | What it does |
| --- | --- |
| GenUI Set | Sets both the positive and negative into the prompt fields of GenerateUI at once |
| PP Copy | Copies the positive prompt |
| NP Copy | Copies the negative prompt |

> **Caution**
> **GenUI Set** can be used while a workflow is loaded in GenerateUI.
> Load a workflow first, using the steps in Chapter 5.

### Sorting with groups
Presets can also be sorted into groups.

1. With a preset selected, press **+ Group** to make a new group.
2. Choose a group from **Select group...** and press **Add to Group**.

A group can also be deleted (**Del Group**).

Groups made here can be used as "Prompt" groups in GenerateUI batch generation (Chapter 5, section 5-5).
For example, if you put spring, summer, autumn and winter presets in a group called "Seasons series",
you can generate the pictures of all four seasons in bulk.

### Listing with Preset Manager
In the **Preset Manager** tab of the center column, you can see the saved presets as a list.

- **All** - all presets
- **Star** - presets registered as favorites
- **Groups** - shown by group

With the **Search presets...** box at the top, you can search presets.

Saved presets are also shown in the **P (Prompts)** tab of the **WS Library** beside ComfyUI's node screen,
and can be dragged onto the canvas for use (Chapter 9).

---

## 7-4 Wildcards and styles

In the right column, you manage **wildcards**, which change the prompt automatically,
and **styles**, which add a mood to the prompt.
Switch with **Wildcard / Style** at the top of the column.

### What is a wildcard?
A wildcard is a mechanism that **randomly swaps out a part of the prompt every time you generate**.
With the same prompt, you can make many images with variation.

The easiest way in Workflow Studio is to use a **wildcard file**.
Make a file listing candidates, and when you write `__filename__` in the prompt,
one line from the file is chosen at random every time you generate.

### Making a wildcard file
As an example, let's make a file called `colors` containing candidate colors.

1. In the right column, choose **Wildcard** and press **+ New** under **Wildcard Files**.
2. Enter a file name (for example `colors`) and choose **txt** as the format.
3. Enter one candidate per line.

   ```
   red
   blue
   green
   golden
   ```

4. Press **Save**.

### Using a wildcard
In the prompt, write the file name enclosed in `__` (two underscores).

```
1girl, __colors__ dress, standing in a garden
```

Each time you generate in GenerateUI, the `__colors__` part is replaced with one of `red`, `blue`, `green` or `golden`.

> **Tip**
> Instead of typing `__colors__` by hand, you can also choose a file with the **File** button in the right column and insert it.

### More advanced notation (for Impact Pack)
At the top of the right column there are also buttons that insert symbols such as `{ }`, `$$` and `[ ]`.
These are for notations like the following.

- `{cat|dog|rabbit}` - choose one out of the three
- `{2$$cat|dog|bird}` - choose two out of the three

> **Caution**
> What GenerateUI expands automatically is only the `__filename__` notation.
> To use notations such as `{A|B}`, you need to put the wildcard node of the custom node **ComfyUI-Impact-Pack**
> (ImpactWildcardProcessor and so on) in the workflow.
> Until you are used to it, using only the `__filename__` notation is enough.

### Sending the prompt you built
The prompt you built in the right column can be sent out with the buttons below.

- **-> Pos** - send to the preset's Positive Prompt
- **-> Neg** - send to the preset's Negative Prompt
- **Copy** - copy it

The `__filename__` parts are expanded automatically when you generate in GenerateUI.

### Styles
A **style** is a "mood template" added to the prompt.
For example, the "cinematic" style has contents registered such as `cinematic still, {prompt}, dramatic lighting`.
Your own prompt goes into the `{prompt}` part.

To use a style, in the top bar of GenerateUI, turn on the **Style** checkbox and choose a style from the pull-down.
When you generate, the chosen style is combined into the prompt automatically (the workflow itself is not rewritten).

Many styles come with Workflow Studio.
In **Style** of the Prompt tab, you can look at the list of styles and make your own with **+ New**.

> **Tip**
> To see what mood each style gives, it helps to use **Create Catalog** in GenerateUI to make sample images for each style in bulk.
> The samples you make can be listed in the Style_Catalog of the Gallery tab (Chapter 8).

---

## 7-5 Getting AI to help with translation and prompt making

In the **AI Assistant** in the left column, you can have AI running on your computer (local AI) help you make prompts.

> **What you need in advance**
> To use this feature, you need local AI software such as **Ollama** or **LM Studio**, and an AI model prepared.
> How to prepare is explained in Chapter 10. If it is not ready, **Disconnected** is shown at the top of the AI Assistant.

### Translating your language into English
Even if you are not good at English prompts, it is fine.

1. In the input box at the bottom of the left column, write in your language what you want drawn.

   ```
   A girl in a school uniform smiling under a cherry tree, soft spring light
   ```

2. Press the **JA->EN** button under **Translate:** (choose the languages to suit your text).
3. The translated result is shown in the chat area.

With the buttons shown below the translation result, you can use the result.

| Button | What it does |
| --- | --- |
| Apply to GenerateUI | Puts it into the positive prompt field of GenerateUI |
| Copy | Copies it (for pasting into a preset and so on) |

When you want to know the meaning of an English prompt, you can conversely translate it with **EN->JA**.

### Making prompts while consulting the AI
Write a question in the input box and press **Send** (or the Enter key) to chat with the AI.

- "Make a prompt for a sunset seaside scene, in English tag format"
- "Add a more fantastical mood to this prompt"

If you ask like this, it offers draft prompts.
If you are using an AI model that can read images, you can attach an image with **Attach Image**
and ask "turn the mood of this image into a prompt".

- **Shift + Enter** - line break
- **Clear Chat** - reset the conversation
- **Gear button** - settings for which AI software and model to use (Chapter 10)

> **Caution**
> A local AI's answers are not always correct.
> Adjust the prompts that come out while actually generating to check them.

> **Summary of this chapter**
> - Prompts are basically English and comma-separated. Emphasis is `(word:number)`
> - Save prompts that worked as presets with a name
> - With "GenUI Set", you can set a preset into GenerateUI right away
> - If you sort them into groups, you can try them in bulk with batch generation
> - Make a wildcard file and write `__filename__` to make the prompt vary with each generation
> - If you prepare local AI, you can translate and consult about prompts
