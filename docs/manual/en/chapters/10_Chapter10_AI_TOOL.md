# Chapter 10 AI TOOL - Making Local AI Your Assistant

Workflow Studio can work together with **local AI (large language models)** running inside your computer.
If you prepare local AI, you can do things like the following.

- Translate what you thought up in your own language into an English prompt
- Chat with the AI and have it come up with prompt ideas
- Show it an image and have it make a description, prompt or tags for that image
- Have it make candidate lists for wildcards
- Pick a **skill** to switch what it is good at: writing prompts, storyboards, troubleshooting and more (v0.9.5+)
- Have it check whether a generated image matches your request and fix only what is missing (v0.9.5+)
- Read the text shown in an image (OCR, v0.9.5+)

Because it runs inside your own computer rather than as a service on the internet,
a big feature is that **what you type and the images you use are not sent outside**.

> **Tip**
> AI features are "nice to have" features. Even if you do not use them, all of Workflow Studio's basic features are available.
> If your computer has room to spare (especially GPU memory), please give them a try.

---

## 10-1 Preparing local AI software

### Supported software
Workflow Studio supports the following four pieces of local AI software.

| Software | Characteristics | Default address |
| --- | --- | --- |
| **Ollama** | The standard. Easy from downloading models to running them | `http://localhost:11434` |
| **LM Studio** | Operated from a screen. You can also look for models inside the app | `http://localhost:1234` |
| Lemonade Server | Easy to run on AMD GPUs and NPUs | `http://localhost:13305` |
| Unsloth | Requires extra setup such as an API key (for advanced users) | `http://localhost:8888` |

For beginners, **Ollama** is recommended. This chapter explains using Ollama as the example.

> **Tip**
> `localhost` in the address means "this computer", and the number after it is the **port number** (Chapter 2, section 2-4).
> Just like ComfyUI, AI software also listens on its own fixed port number.

### Preparing Ollama
1. From Ollama's official site, download the installer for your OS and install it.
2. Start Ollama (on Windows it starts automatically after installation and stays resident in the taskbar's notification area).
3. Download the AI model you will use. In Command Prompt or similar, type the following.

   ```
   ollama pull (model name)
   ```

   Model names can be checked in the model list on Ollama's official site.

> **Guide to choosing a model**
> - **You also want the image-reading feature (VLM)** -> choose a model that supports image input (vision)
>   (in the author's testing, image generation and image reading work well with Gemma 4 `e4b` and similar)
> - **GPU memory is small** -> choose a model with a small parameter count (a few B, that is a few billion)
> - If translation accuracy matters, choose a model that is good at your language
>
> The world of AI models changes quickly, so please try newer models too.

> **Caution: competing for GPU memory**
> Local AI also uses **GPU memory (VRAM)**, just like image generation.
> If you run both at the same time, memory runs short and image generation slows down or errors out.
> Countermeasures are explained in 10-3.

---

## 10-2 Using the AI TOOL tab

Open the **AI TOOL** tab of the main Workflow Studio.
The screen is divided into four parts, all shown at the same time.

| Part | What you can do |
| --- | --- |
| Translate | Translation between languages such as Japanese, English and Chinese |
| Chat | Conversation with the AI. Skills switch what it is good at. If the conditions are met, generating images from the conversation too |
| TOOLS | Reading images (VLM), reading text (OCR), making wildcards |
| Settings | Settings for which AI software and model to use |

> **Tip: Translate and Settings can be collapsed (v0.9.5+)**
> Press the arrow (◀ / ▶) at the right end of the Translate or Settings header to collapse that part into a thin strip, giving Chat and TOOLS more room.
> Click anywhere on the strip to open it again. The collapsed state is kept the next time you open the tab.

### First: connect to the AI software in the settings
1. In **Backend** under the settings, choose the software to use (for example Ollama).
2. Check the address under **Connection**. If you use Ollama with its defaults, no change is needed.
3. Press **Test Connection**. If it shows success, it is OK.
4. Press **Refresh** next to **Model** and choose the model to use from the list.
5. Press **Save Settings**.

> **Tip**
> The settings here are shared with the **A (AI TOOL)** tab of the WS Library on the ComfyUI side.
> On the other hand, the Prompt tab (Chapter 7) and the Tagger tab each have their own **gear button** settings.
> If "it works in the AI TOOL tab but the Prompt tab says Disconnected", set the same thing with the gear button in the Prompt tab as well.

> **If it does not connect well**
> - Check that software such as Ollama is running.
> - For LM Studio, you need to **start the server** inside the app.
> - Check that the port number in the address matches the software's settings.
> - If the model list is empty, check that the model has been downloaded.

### Translate
1. Choose the source and target languages (swap them with the **swap** button).
2. Write the text in the input box and press **Translate**.
3. **Copy** the result and paste it into GenerateUI or a preset.

> **Tip**
> Text read in TOOLS (such as OCR in 10-8) can be put straight into this input box with **To Translation** in TOOLS.

> **Tip**
> Small models sometimes return the original text as it is without translating.
> In that case a message says the model returned the original text, so try another model.

### Chat
Talk in the input box and send with **Enter** (**Shift + Enter** for a line break).
It remembers the flow of the conversation, so follow-up requests such as "make it a brighter mood" also work.
**Clear** resets the conversation.

> **Tip: generating images from chat (advanced)**
> If you use a model that supports "Tool Calling",
> just asking in chat "draw a cat" generates an image with the workflow loaded in GenerateUI, and it is shown inside the chat.
> This feature can be turned on or off with the **Allow image generation** check next to the input box.

> **Tip**
> Choose a **skill** in the dropdown above the chat to switch what the AI is good at (10-5).
> The AI's replies are shown with headings, lists and code boxes formatted (v0.9.5+).

### TOOLS - reading images (VLM)
With a model that supports image input (a VLM), you can have the AI read the contents of an image.

1. Drop an image (PNG / JPG / WebP) into the **TOOLS** frame.
2. Choose a task.

   | Task | Contents |
   | --- | --- |
   | Describe | Explains in text what is in the image |
   | Create prompt | Makes a prompt for reproducing the image |
   | Create tags | Writes out the elements of the image in tag format |
   | Create wildcards | Makes candidate wildcard lists by specifying a category name and count (no image needed) |
   | OCR (extract text) | Reads the text shown in the image (10-8) |

3. Press **Run**.
4. Use the result with the buttons under it (v0.9.5+).

   | Button | What it does |
   | --- | --- |
   | To Translation | Puts it into the Translate input box (opens Translate if it is collapsed) |
   | To Chat | Adds it to the chat input box |
   | Copy | Copies it to the clipboard |

> **Example**
> When you want to imitate the mood of an illustration you like, run "Create prompt" on that image
> and try the resulting prompt in GenerateUI - you can use it like that.

### It can be used inside the ComfyUI screen too
The same AI features can also be used in the **A** tab of the WS Library on the ComfyUI side.
Handy when you want to translate something briefly while working on the node screen.

---

## 10-3 Freeing VRAM and managing memory

As touched on in 10-1, local AI and image generation compete for GPU memory (VRAM).
Ollama keeps a model that has been used in memory for a while,
so if you generate images after using the AI, memory may run short.

### Freeing manually
Pressing **Unload Model** in the AI TOOL settings takes the AI model out of memory and frees VRAM.
(With Ollama, all loaded models are unloaded)

### Freeing automatically before generation
In **VRAM Management (Ollama)** in the Settings tab, you can set Ollama's models to be unloaded automatically just before image generation.

| Behavior before generation | What it does |
| --- | --- |
| Do nothing | Does not unload automatically |
| Unload what is needed only when free memory is below the target | Unloads only when free VRAM is less than the **Target free VRAM (GB)** |
| Unload everything every time | Always unloads everything at every generation |

> **Tip**
> If you can't decide which to choose, "Unload what is needed only when free memory is below the target" is recommended.
> For the target free VRAM, enter a rough value of the amount of memory image generation needs (it differs by the model you use).
> The **Unload all now** button can also free it immediately, on the spot.

> **Caution**
> This automatic unloading applies to Ollama only. If you use LM Studio or similar, free memory manually.

---

## 10-4 Security notes

### By default it connects only to AI on "your own computer"
For safety, the AI software Workflow Studio connects to (Ollama, LM Studio and so on) is by default limited to
**software running inside the same computer (localhost / 127.0.0.1)**.

### When you want to use AI on another computer
If you want to run Ollama on another computer on your home LAN (such as a computer with a strong GPU) and use it,
register the address of the computer you want to connect to in the environment variable **`WFS_ALLOWED_BACKEND_HOSTS`**, and restart ComfyUI.

```
WFS_ALLOWED_BACKEND_HOSTS=192.168.1.20:11434
```

If there are several, list them separated by commas (,).
How to set environment variables differs depending on how you start ComfyUI.

### If you start ComfyUI with `--listen`
If you start ComfyUI with the `--listen` option, other computers and smartphones on the same network
can also access ComfyUI (and Workflow Studio).
In that case, anyone who can access it can use your AI software and images.

> **Caution**
> Use `--listen` **only on a trusted network**, such as a home LAN.
> Do not use it in cafes or on public Wi-Fi.

---

## 10-5 Skills - switching what the chat is good at (v0.9.5+)

A **skill** is a set of instructions that tells the chat what role to play and how to answer.
When you pick one in the dropdown above the chat (it starts as "-- No skill --"), its instructions are sent along with every message
(the instructions themselves are not shown in the chat).

### Built-in skills
Workflow Studio comes with the following six skills.

| Skill | What it does | How you use the result |
| --- | --- | --- |
| T2I Prompt Enhancer | Turns a short idea into a prompt written the way the model in your GenerateUI workflow understands best | Buttons under the prompt |
| Image to Prompt | Writes a prompt that recreates the image you put in TOOLS (needs a model that can read images) | Buttons under the prompt |
| Storyboard to Lab | Splits a story into one prompt per scene, ready for continuous generation in Lab | **Open in Lab** |
| Workflow Doctor | Explains the workflow and helps you find the cause of errors (10-7) | Answers in text |
| SVG Icon Generator | Draws simple icons and illustrations as SVG (vector images) | Preview and **Save to Gallery** |
| Skill Creator | Asks you questions and builds a new skill (10-9) | **Save as new skill** |

### Making a prompt and generating with it (T2I Prompt Enhancer)
1. Load the workflow you want to use into GenerateUI. The skill looks at that workflow's model to decide how to write the prompt.
2. In the AI TOOL chat, choose **T2I Prompt Enhancer** in the dropdown.
3. Describe the picture in your own words, for example "a cat holding an umbrella in rainy Tokyo at night, neon", and send it.
4. The reply shows which writing style was chosen (the `Style:` line) and the English prompt in a box. Use the buttons under it.

| Button | What it does |
| --- | --- |
| Apply to GenerateUI | Writes the positive / negative prompt into GenerateUI |
| Generate with this prompt | Generates right away and shows the image in the chat |
| Copy | Copies the positive prompt |

The writing style depends on the model:

| Model in GenerateUI | How the prompt is written |
| --- | --- |
| Qwen-Image, FLUX, Z-Image, etc. | English sentences (the negative is left empty when CFG is about 1) |
| Illustrious, NoobAI, Pony, etc. (SDXL anime models) | Danbooru tags (starting with quality tags) |
| Realistic SDXL, SD1.5 | Short phrases separated by commas |

> **Tip**
> Follow-up requests such as "make it more night-like" or "two cats" give you the whole updated prompt again.

> **Tip: the prompt currently in GenerateUI is not sent**
> Normally the prompt already typed into GenerateUI is not passed to the AI, because small models tend to mix it (for example an old negative prompt) into the new prompt.
> It is passed only when your message refers to it, such as "**improve the current prompt**".

### Generating a storyboard in a row (Storyboard to Lab)
1. Load a text-to-image (T2I) workflow into GenerateUI.
2. In the chat, choose **Storyboard to Lab** and ask, for example, "A tabby kitten wakes up in the morning, chases a butterfly in the garden, and naps on the veranda in the evening. 3 scenes."
3. The reply shows the scene list and an **Open in Lab (3 scenes)** button. Press it.
4. GenerateUI's **Lab** (Chapter 5, section 5-7) opens with the plan loaded as an unsaved plan.
   T2I mode is on, Batch is the number of scenes, and the Prompt column has one keyframe per scene. The KSampler column holds a seed shared by all scenes (`Seed ...`).
5. Check it and press **Run**. To keep it, use **Plan Save**.

> **Tip**
> The characters' looks (hair, clothing colors and so on) are written with the same words in every scene, and the seed is fixed,
> so the same character is easier to keep across scenes.

### Automatic check of replies
For skills that output a prompt or an SVG, Workflow Studio checks the shape of the reply automatically.
If, for example, the prompt box is broken or the SVG is not closed, a dashed notice "**Auto-check: ...**" appears and the AI is asked once to fix it.
Replies that do not try to output a prompt or SVG (for example when you only asked for an explanation) are left alone.

### Managing skills (pencil button)
The pencil button to the right of the dropdown opens the skill list.

- **+ New** writes a new skill, the pencil on each row edits or deletes it, and **Import** adds other skills (10-9)
- Skills that ship with Workflow Studio are marked **built-in**.
  Built-in skills you have not edited are updated automatically when Workflow Studio is updated.
  An edited one is not replaced automatically; when a newer version exists, a **↻ (update)** button appears.
- Skill files are saved in `ComfyUI/user/default/Workflow-Studio/ai_skills/`.

> **Caution**
> Replacing a skill with the newer version via ↻ (update) discards your edits to that skill.

---

## 10-6 Checking generated images and fixing them (v0.9.5+)

This feature has the AI check whether an image generated from the chat matches what you asked for.
If something is missing, you can redraw with a prompt that fixes just that.

### Preparation: a judging model
The check does not use a normal chat model but an Ollama **decision model** (a model that answers yes/no questions with a probability).
Get one that can read images with `ollama pull` (the author confirmed `d3:4b`, `clef-flash` and `clef`).

> **Tip: why a separate model**
> In the author's tests, a chat model shown an image sometimes answered "yes" to "is the person holding a sword?" when there was no sword.
> A decision model returns the probability of "yes" as a number, so uncertain answers can be told apart.

1. In AI TOOL's **Settings**, under **Chat Image Check**, choose the **Judge model (Ollama decision model)** (press **Refresh** if the list is empty).
2. Choose **Automatic fix rounds**. **0 (fix by button)** is recommended at first.
3. Press **Save Settings**.

### How to use it
1. Tick **Check images** below the chat input.
2. Generate an image from the chat (the AI's image generation, or **Generate with this prompt**).
3. A result card appears under the image. The AI splits your request into 3 to 8 check items and checks them one by one.

| Mark | Meaning |
| --- | --- |
| ✔ (met) | Probability of "yes" is 85% or more |
| ? (unclear) | 30-85% |
| ✘ (not met) | Less than 30% |

4. If there is a ✘ or ?, press **Fix missing items and regenerate**. Only the unmet items are sent to the AI, which rewrites the prompt and draws again.

If you set Automatic fix rounds to 1-3, this repeats automatically up to that number of times.

> **Tip: SVGs can be checked too**
> SVGs drawn with SVG Icon Generator are turned into an image and checked for "does it look like what you asked for" and "are its parts (beak, wings and so on) drawn".
> **Ask to redraw unclear parts** asks the AI to fix them.

> **Caution**
> - The check is not perfect. It is especially weak at "who is wearing what",
>   so when there are several people it automatically adds reverse check items such as "the hat is not on the girl" to compensate.
> - How well the redraw works depends on the chat model. If it does not improve, change your request or the model.
> - The judging model also uses GPU memory (about 6 GB for `d3:4b`). Once loaded, a check takes a few seconds.

---

## 10-7 Asking about workflow problems (Workflow Doctor, v0.9.5+)

**Workflow Doctor** is a skill that explains the workflow loaded in GenerateUI and helps you find the cause of errors.
Instead of relying only on the AI's knowledge, every time you send a message Workflow Studio passes it the following facts it has actually checked.

| What is checked | Example |
| --- | --- |
| Nodes that are not installed | Names of nodes ComfyUI does not know |
| Files and values not in ComfyUI's lists | Models or LoRAs that cannot be found (with similar names) |
| Connections | Inputs that are not connected, links to nodes that do not exist |
| The last execution error | The error recorded in ComfyUI's history |
| ComfyUI's log | The latest error part of the log |

### How to use it
1. Load the workflow you want to ask about into GenerateUI (for an error, run it once so the error is recorded).
2. In the chat, choose **Workflow Doctor**.
3. Ask, for example, "check this workflow for problems before I run it" or "what caused the last error?".

> **Example**
> For a workflow whose LoRA file had been moved to another folder, it answered
> "the file specified in the `temp\` folder cannot be found; a file with the same name exists in `Illustrious\`", including how to fix it.

> **Tip**
> The checked facts are rebuilt every time you send a message. After fixing something, just ask again.

---

## 10-8 Reading text in images (OCR, v0.9.5+)

In TOOLS you can read the text shown in an image. The text you read can be sent straight to translation or the chat.

### Preparation: an OCR model
OCR uses a model that is good at reading text, separate from the chat model. Prepare one in Ollama.
These are the author's results on an image mixing horizontal and vertical Japanese and English text.

| Model | Time | Result |
| --- | --- | --- |
| LightOnOCR-3 (`maternion/LightOnOCR-3:4b`) | About 1 s (6-8 s with positions) | Read everything |
| PaddleOCR-VL (manga version) | About 4 s | Read everything |
| DeepSeek-OCR family | About 14 s | Read everything (always with positions) |
| PaddleOCR-VL 1.6, GLM-OCR | About 11-15 s | Missed the vertical text |

### How to use it
1. Drop an image into TOOLS.
2. Choose **OCR (extract text)** as the task.
3. Choose the **OCR model**. Ollama models whose name contains "ocr" are listed, best first (press ↻ if the list is empty).
4. Press **Run**. The text is shown in the result box, one line each.

> **Tip: Show text positions**
> Tick **Show text positions** to draw numbered boxes over the image so you can see where each text is.
> Clicking a box selects the same line in the result box.
> Only LightOnOCR and the DeepSeek-OCR family can return positions; for other models this check cannot be selected.

> **Tip**
> If the result is empty or the same line repeats, it is automatically read once more in grayscale.

---

## 10-9 Making and importing skills (advanced, v0.9.5+)

### Making one with Skill Creator
In the chat, choose **Skill Creator** and say something like "I want a skill that is good at ...".
The AI asks questions one at a time; answer them and you get a draft skill.
Press **Save as new skill** under the reply; the skill list opens with the draft filled in, so check it and save.
You can also ask it to improve an existing skill, for example "this part of this skill does not work well".

### What a skill file contains
A skill is a text file (`.md`). Write the name and description in the part enclosed by `---` at the top, and the instructions for the AI below it.
Under `metadata:` in the top part you can also write these settings (all optional).

| Setting | Meaning |
| --- | --- |
| `output` | `prompt` or `svg`. Checks the shape of the reply automatically and adds the buttons |
| `tools` | `[]` stops the AI from starting image generation on its own |
| `temperature` | How varied the answers are (0.3 stable, 0.9 free) |
| `think` | Turns Thinking mode on or off just for this skill |
| `context` | Information passed to the AI: `workflow` (workflow summary), `current-prompt` (the current prompt), `workflow-detail` / `logs` (the same checks as Workflow Doctor) |

### Importing other skills
**Import** in the skill list adds:

- a single `.md` skill
- a ZIP of a folder containing `SKILL.md` (the **Agent Skills** format shared by many AI tools)

Text files in the folder (reference material and so on) are imported too, and the AI reads them only when it needs them
(this needs a model that supports tool calling).

> **Caution**
> - Only text files are imported. Programs such as scripts are not imported and never run.
> - A skill's instructions are passed to the AI as they are. Read a skill made by someone else before using it.

> **Summary of this chapter**
> - If you prepare local AI (Ollama and so on), you can translate, chat and read images. What you type is not sent outside
> - In the AI TOOL tab's settings, choose the backend, address and model, and test the connection
> - The Prompt tab and Tagger tab have separate gear-button settings
> - AI and image generation compete for VRAM. Free it with "Unload Model" or "VRAM Management (Ollama)"
> - By default it connects only to AI on your own computer. Use `--listen` only on a trusted network
> - **Skills** switch what the chat is good at. T2I Prompt Enhancer writes a prompt that buttons apply to GenerateUI or generate with
> - With **Check images** on, a decision model checks the generated image and you can redraw fixing only what is missing
> - Workflow Doctor helps with workflow problems based on facts it has actually checked
> - **OCR (extract text)** in TOOLS reads the text in an image and sends it to translation or the chat
