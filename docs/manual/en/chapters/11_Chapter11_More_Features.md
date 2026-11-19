# Chapter 11 Even More Features (Overview)

By now, you have covered the basic usage of Workflow Studio from start to finish.
This chapter introduces the tabs and features not yet covered, focusing on **what you can do with them**.
You do not need to use everything right now. Keep in the back of your mind that "you can do this too",
and try them when you need them.

---

## 11-1 The Nodes tab - listing the installed nodes

In the **Nodes** tab, you can list all the nodes installed in ComfyUI.

- **Search and filtering** - narrow down by name, category and package (which custom node it belongs to). Even with thousands of nodes, the list appears first and search runs lightly (v0.8.0 and later).
- **Detail panel** - when you select a node, you can check the kinds of its inputs and outputs (the I/O specification).
- **Favorites, groups and tags** - organize the nodes you use often.

Nodes you register as favorites or in groups here are shown in the **N** tab of the WS Library,
and can be placed by dragging onto the node screen (Chapter 9).

> **When it helps**
> "I installed a custom node but can't tell what nodes were added"
> -> narrow down by **Package** and you can see the list of nodes contained in that custom node.

---

## 11-2 Tagger - automatically making tags from images

The **Tagger** tab is a feature that reads an image and automatically makes tags that describe it (such as `1girl, long hair, smile`).
It can be used for making prompts for anime-style models, and for tagging images for training.

### Three subtabs
| Subtab | What you can do |
| --- | --- |
| Single | Make tags from one image |
| Batch | Tag the images in a folder in bulk (it can also write out a `.txt` file with the same name as each image) |
| DB | Search and edit the records of images you tagged |

### How to use it (Single)
1. Drop an image onto the preview area (you can also open it from the **Tagger** button in the Gallery's detail panel).
2. Choose the model to use and press the run button to make tags.
3. Use the result.

   | Button | What it does |
   | --- | --- |
   | GenUI:P | Adds it to GenerateUI's positive prompt |
   | Send to Prompt | Adds it to the positive prompt in the Prompt tab |

With the **threshold** slider, you can adjust how certain a tag must be to be shown.
Raising the number leaves only fewer, more certain tags; lowering it gives more.

### Preparation needed
To use Tagger, you need the following preparation.

1. Put a **model for tagging** (such as WD Tagger) in ComfyUI's `models/tagger/(model name)/` folder.
   Put a `.onnx` file and `selected_tags.csv` in the folder.
   **PixAI Tagger v1.0** (v0.8.10 and later) also works. From the community conversion on Hugging Face (`Mexes/pixai-tagger-v1.0-onnx-fp32-fp16-int8`),
   put one `.onnx` file (`model_fp16.onnx` is recommended for a GPU) together with `selected_tags.csv` and `preprocess.json` in one folder, and it is detected automatically.
   When you choose a PixAI model, the threshold sliders switch to PixAI's recommended values (0.17 / 0.27).
2. Install the **extra Python packages**.
   Use the `requirements.txt` in the Workflow Studio folder.

   ```
   (ComfyUI's Python) -m pip install -r requirements.txt
   ```

   The location of "ComfyUI's Python" differs by environment. Check the table in Chapter 2, section 2-6
   (for example, for the Windows portable version it is `python.exe` inside the `python_embeded` folder).

> **Caution**
> Installing into the Python that was already on your computer cannot be used from ComfyUI.
> Always install into **the Python that ComfyUI uses**.
> If you are not sure, there is also a method of installing packages with a ComfyUI Manager feature.

> **Caution: check that it runs on the GPU**
> On an NVIDIA GPU, Tagger takes less than a second per image, but on the CPU, PixAI takes about 20 seconds per image.
> If it is very slow, check that the GPU package is installed correctly (Chapter 12, section 12-5).

> **Tip**
> You can also combine it with the local AI image reading (VLM) from Chapter 10 to make tags that combine both results.

---

## 11-3 Image Edit - touching up generated images

The **Image Edit** tab is a simple image-editing tool with layers.
You can put text on a generated image, or make a mask for redrawing part of it.

### Main features
| Tool | What you can do |
| --- | --- |
| Select | Move, scale and rotate layers |
| Draw | Draw with a pen (pen-tablet pressure is also supported) |
| Text | Put in text |
| Shape | Draw rectangles, circles and lines |
| Fill | Fill and gradients |
| Mask | Specify the part you want redrawn (making a mask) |
| Blur | Blur and mosaic |
| BG Remove | Remove the background |
| Inpaint | Redraw the masked part with the GenerateUI workflow |

- Open an image by drag and drop, **File Open**, or the **Image Edit** button in the Gallery.
- Save the edited image with **Save PNG** (download), **Save to Gallery** and so on.
- Undo with **Ctrl + Z**, redo with **Ctrl + Y**.

### Draw colors and shortcuts (v0.9.3+)
When you choose **Draw**, a **color palette** appears in the second row of the tool options.

- It shows **Color 1 / Color 2**, 20 basic colors and 20 custom slots. Click a color to paint with it.
- Click **+** or an empty slot to register the current color as a custom color. Right-click a color to register, edit or delete it (basic colors can be changed too, and returned to their original color).
  Registered colors are saved per browser.
- The **eyedropper** button next to **Color** on the right picks a color from the canvas (Esc cancels).
- The starting colors are black (Color 1) and white (Color 2).

| Key (while Draw is active) | What it does |
| --- | --- |
| D / E | Draw / Erase |
| X | Swap Color 1 and Color 2 |
| [ / ] | Make the brush smaller / larger |
| B | Open or close the brush picker (Esc also closes it) |

### Inpainting (redrawing part of an image)
The handiest use of Image Edit is **inpainting**.
It is for when "I want to redraw only the face" or "I want to fix only the place where the hand broke".

1. Load an inpainting workflow (such as the bundled sample `ws_inpaint_basic`) into GenerateUI.
2. Open the image in Image Edit and paint the part you want redrawn with **Mask**.
3. Run it with the **Inpaint** tool, and only the painted part is redrawn.

> **Tip**
> To use a higher-quality version of background removal, or more advanced masking,
> the author's separate custom node **comfyui-mask-editor-one** is needed.
> Saving and loading in PSD format requires an extra Python package (psd-tools).

---

## 11-4 Video - making and joining videos

The **Video** tab is a dedicated screen for making short videos from images or text using video-generation models.

### Supported video-generation models
- **MiniMax H3** (image to video)
- **LTX-2.5** (text to video, image to video, and video from specified first and last images)
- **Wan2.2** (text to video)
- **FastH3 OmniRef / Pika-H3-Flex** (MiniMax H3 reference to video, v0.8.14 and later)

You load a matching workflow with **Load in Video** in the Workflow tab and use it (Chapter 4, section 4-6).

### Main features
| Subtab | What you can do |
| --- | --- |
| Plan | Divide a video into "blocks", decide the prompt, length and first/last image for each block, and generate in order |
| Edit | Line up generated videos and images, then cut, join, add text and BGM, and export |
| Asset | List generated videos, images and audio. Audio can be set as BGM or added as sound (the Audio Only type filter shows audio only) |

There are also the **Frame** feature, which saves a favorite scene of a video as a still image, and **GIF**, which converts a video to an animated GIF.

> **Tip**
> The **Prompt** field of a Plan block also has the Prompt Translation globe button (Chapter 5, section 5-10).
> With **Video Plan - Run** turned on in Settings, you can run the plan with prompts in your own language and send only English.

> **Note**
> Up to v0.9.8, with workflows saved by newer ComfyUI versions, the prompt, length (Duration) and Turbo settings entered in Plan were not applied, and the values saved in the workflow were used instead (fixed in v0.9.9).
> Because Plan values are applied now, running the same plan as before may give different results.

### Register as Asset and audio conversion (v0.8.9 and later)
- **Register as Asset** - a button in the Video Source panel on the left. It copies a video from your PC into the output folder (`output/video`) and registers it in the "Video Assets" group.
  Once registered, it appears in the Asset subtab list and can be used in Edit and elsewhere.
  Videos already in the output folder (ones chosen in Asset or generation results) are only tagged into the group, not copied. If the name already exists, a number is added after it.
- **Convert audio...** - a button next to the crop buttons in the Edit subtab. It converts only the audio of the selected video clip to FLAC, MP3, Opus, M4A or WAV and saves it into `output/video`.
  It is the same dialog as Gallery's Convert. Only video clips that contain audio are covered.
- Pressing the audio-conversion button opens the dialog below. Choose the **output format** (such as FLAC), the **sample rate** and the **channels**, then press **Convert**.
  If you check the option to carry over the embedded prompt/workflow tags, the original video's information is kept in formats that can hold tags (such as FLAC).

- The Video Source panel is a little wider, the file name shows on one line, and the buttons sit in a single row.

### Reference to video (FastH3 OmniRef / Pika-H3-Flex) (v0.8.14 and later)
These workflows make a video from **reference images** instead of a first and last frame,
so the image fields in the Plan subtab are renamed:

- **Reference Image** - the first reference image (the usual First Image field)
- **Reference Image 2 (optional)** - the second reference image (the usual Last Image field)

- Prompt, duration (seconds), aspect ratio and so on work the same as for other video workflows.
- A block whose image field is left empty with **None** or **Clear** is generated without that image, even if the workflow has a reference image wired in.
  Blocks added with "+ Block" start with empty images, so set an image on each block that needs a reference.
- Choosing **Use previous block's last frame** makes the last frame of the video actually generated by the previous block the first reference image of that block.
- The Asset subtab buttons also change to "Set as Reference Image" and "Set as Reference Image 2".

> **Caution**
> Video generation uses far more GPU memory and time than image generation.
> Check the required specs of the model before trying it.

---

## 11-5 Main items of the Settings tab

In the **Settings** tab, you configure Workflow Studio as a whole.
Items are collapsed, so click a heading to open it.
Here we mainly introduce items not covered in earlier chapters.

| Item | Contents | Related chapter |
| --- | --- | --- |
| Theme | Screen color scheme and font | Chapter 3 |
| UI Language / Summary Language | Display language | Chapter 2 |
| Text Size | Size of text such as in the prompt fields | Chapter 3 |
| Workflow Data Folder | The folder workflows are read from | Chapter 4 |
| Gallery Output Folder | The folder shown in the Gallery | Chapter 8 |
| Default Workflow | The workflow automatically loaded into GenerateUI when you open Workflow Studio | Below |
| Default Checkpoint | Automatically replaces the model when loading a workflow into GenerateUI | Below |
| CivitAI API Key | For fetching Civitai information (optional) | Chapter 6 |
| Eagle integration (optional) | Automatically save generated images to Eagle | Chapter 8 |
| VRAM Management (Ollama) | Unload AI models from memory before generation | Chapter 10 |
| Prompt Translation (native language -> English) | Turn prompts in your own language into English with the globe button or automatic translation when running | Chapter 5, 5-10 |
| Data Management | Backing up and restoring settings and data | Below |

### Default Workflow
If you set the basic workflow you always use, it is loaded into GenerateUI automatically when you open Workflow Studio.
You can also set it with the **Set as Default** button on the Workflow tab's detail screen.

### Default Checkpoint
Workflows you get online often specify models you do not have (Chapter 5, section 5-3).
If you set a **Default Checkpoint** and turn it on, each time you load a workflow into GenerateUI,
the Checkpoint is automatically replaced with the specified model. It saves the trouble of choosing a model again.

### Data Management (backup)
In **Data Management**, you can write out the information you organized in Workflow Studio (favorites, badges, groups, presets and so on)
to a file (Export), and read it back to restore it (Import).

With **Full Backup (ZIP)**, you can back up everything together, including folder-based data such as styles and Lab plans.

Since v0.9.10, the settings kept in the browser (groups, badge colors, appearance, AI and VRAM Management settings, presets, the Game tab settings and so on)
are included in both the JSON export and the full backup.
After an import (restore), press the **Reload page** button that appears to apply the browser settings, and then restart ComfyUI.

In the full backup, checkboxes choose whether to include these:

| Checkbox | Contents |
| --- | --- |
| Include the Gallery semantic search index | On by default. Rebuilding it re-embeds every image (with Gemini this costs API usage) |
| Include the TagSpace cache | Off by default. Large, and can be rebuilt in the TagSpace tab |

> **Tip**
> Always take a backup before buying a new computer or reinstalling ComfyUI.
> The information you spent time organizing can be carried over as it is to the new environment.
> (For safety, API keys are not included in backups)

## 11-6 A companion app: ComfyUI Comic Creator - making manga from generated images

**ComfyUI Comic Creator** (Comic Creator from here on) is a custom node **for making manga** that runs on ComfyUI,
developed by the same author as Workflow Studio.
It is software you install separately from Workflow Studio, but if you install both, they work together.

### What you can do with Comic Creator
| Feature | Contents |
| --- | --- |
| Panel layout | Choose a template and make panels on a page (your own templates can also be registered) |
| Placing images | Place images into panels by drag and drop |
| Speech balloons and text | Vertical and horizontal dialogue, balloons of various shapes, sound-effect text |
| Manga effects | Add speed lines, screen tones, halftone dots and so on |
| Image editing | Image editing with layers (the Image tab) |
| Automatic creation with AI | Draft a story, script and panel layout from a theme with AI (the Auto tab) |
| Export | Output as JPEG / PNG / WebP / SVG / PDF / **EPUB** |

### Working together with Workflow Studio
If you install both, the following integrations are possible.

- **Use Workflow Studio's Gallery inside Comic Creator**
  Workflow Studio's Gallery appears inside Comic Creator, and you can choose generated images and send them to panels with **Send CC Layout** (Layout tab panel / overlay) or to the Image tab with **Send CC Image**.
  (The Send CC buttons are shown only in a Gallery opened inside Comic Creator)
- **Generate images from Comic Creator**
  From the Comic Creator screen, through Workflow Studio (GenerateUI), you can generate images to put in panels (T2I),
  or redraw based on a rough you drew or an image you placed (I2I and inpainting).
  From Comic Creator's Nanobanana+ tab (local mode), you can also run image-editing workflows that use several reference images (Flux.3 Klein, Qwen Image 2.1 and so on) (v0.8.12 and later).

With the flow "make images in Workflow Studio -> put them together as manga in Comic Creator",
you can go from image generation to finished manga entirely inside ComfyUI.

### Installing and launching
1. In ComfyUI Manager's **Install via Git URL**, enter the following URL and install.

   ```
   https://github.com/ketle-man/comfyui-comic-creator
   ```

   (For a manual install, `git clone` into `ComfyUI/custom_nodes/`, same as Workflow Studio)

2. Restart ComfyUI.
3. Press the **CC** button added to ComfyUI's top menu, and Comic Creator opens in a new tab.

> **Tip**
> For detailed usage of Comic Creator, see the **Help** tab inside the app (with search).

---

## 11-7 TagSpace - picking tags and prompts from a "map of meaning" (v0.9.0 and later)

The **TagSpace** tab lays out the prompts, tags and generated images inside Workflow Studio in a 3D space
according to **closeness of meaning**. Things close together mean similar things, so you can browse the space
("which tags are close to this mood?") and pick tags to build a prompt.

### What is in the space
- **Cards** - the sample images of the Gallery's **ImagePrompt** (Chapter 8, section 8-4) with their prompts, shown as thumbnails
- **Tags** - words taken (split at commas) from ImagePrompt prompts, prompts embedded in generated images, wildcards, the Tagger DB and the Prompt library, shown as dots colored by source
- **Gallery points** - some of your generated images, shown as faint dots (each carries the tags of its own prompt)

### Preparation
As with the Gallery's semantic search (Chapter 8, section 8-6), **Ollama** and **EmbeddingGemma 2** are needed.
If the Gallery's semantic index was made with Gemini Embedding 2, rebuild it with EmbeddingGemma 2 first.

### Building the space
Choose the settings in the toolbar and press **Build / Update**.

- **Tags** - how many tags to include. The sources take turns, each in order of how often a tag is used
- **All tags** - when on, every candidate tag is used instead of the Tags number (up to 20,000)
- **Min uses** - leaves out tags used fewer times than this. 2 removes one-off spelling variants and the like
- **Wildcards** - whether wildcards are used as a tag source
- **Gallery points** - how many generated images to show (0 = none)
- **Tagger fill** - tags generated images whose prompt cannot be read, using a Tagger model (OFF / a model name; choose "Gallery points only" or "All images without a prompt")

- The first build takes a few minutes to read image prompts and prepare tags. Later builds reuse the previous results and finish in seconds to tens of seconds.
- The status line shows the numbers of cards, tags and Gallery points. When only part of the candidates is used, "(of N candidates)" is shown.

> **Tip**
> Most distinct tags are words that only appear in wildcards.
> Turning "Wildcards" off and "All tags" on lays out every tag you have actually used (about 10,000 in testing).

> **Caution**
> Tagger fill takes about 0.5 second per image on the CPU. Before choosing "All images without a prompt", check that Tagger runs on the GPU (Chapter 12, section 12-5).

### Looking and searching
- **Drag** to rotate, **right-drag** to pan, and use the **wheel** to zoom.
- Hovering over a point shows its name, thumbnail and prompt or sources.
- The toolbar checkboxes switch Cards, Thumbnails, Tags and Gallery on or off, as well as **Glow** (stars shining in a night sky) and **Twinkle**.
  The checkboxes for each source show or hide tags by source.
- Type words or a sentence in the search box at the top right and press **Enter** (any language). A white mark is placed at that meaning, and nearby cards and tags are listed.

### Picking tags to build a prompt
1. Click a card or tag to select it. Cards and tags close in meaning are listed under **Nearby** on the right.
   (Clicking a Gallery point also lists similar generated images)
2. **Double-click** what you want in the prompt, or press **Add** in **Selection**, or the **+** in the list.
   A card adds its whole prompt, a tag adds the tag itself, and a Gallery point adds that image's tags to the **Prompt** area at the far right.
3. **Add to GenerateUI (Positive)** appends it to the positive prompt of the workflow loaded in GenerateUI (load a workflow in GenerateUI first).
   You can also **Copy** it to the clipboard.

### Searching with the tags of a card or generated image
When you select a card or Gallery point, its prompt tags are shown as buttons under **Selection**.
Click tags to choose them (click again to deselect) and press **Search with selected** to search the space with them.
This helps when you want to find things close to, say, only the hairstyle and clothing of an image.
While tags are selected, the **Add** button in **Selection** becomes **Add selected (N)** and adds only those tags to the prompt area.
With no tags selected it adds the whole item as before (a card's whole prompt, or all tags of a Gallery point).

When a Gallery point is selected, **Selection** also shows an **Open in Gallery** button.
It switches to the Gallery tab, selects the image's folder, and selects the image in the list (its details open on the right).
So that the image is sure to appear, the Gallery's search, favorite, tag and group filters are cleared.
A card's whole prompt can be read under **Full prompt**.

---

## 11-8 Game - play a game, and make images from what you clear (v0.10.0 and later, experimental)

The **Game** tab lets you play mini games in the style of 1980s computer games.
Each time you clear a stage, a "victory shot" of that game's heroine is generated automatically with ComfyUI.
Generation runs in the background while you play, so you never have to stop.

The games themselves come in a separate package, **ComfyUI-WFS-Games** (the game pack).
Without the game pack, neither the Game tab nor the "Game Tab" page of the Help tab is shown (nothing else changes).

### Preparation 1: install the game pack
The game pack is not registered in ComfyUI Manager. Install it in one of these ways.

- **With git**: open a command prompt in the `ComfyUI/custom_nodes` folder and run:

```
git clone https://github.com/ketle-man/ComfyUI-WFS-Games
```

- **With a ZIP**: download the latest ZIP from the GitHub releases page (https://github.com/ketle-man/ComfyUI-WFS-Games/releases)
  and extract it into `ComfyUI/custom_nodes`. Name the folder `ComfyUI-WFS-Games`.

Restart ComfyUI and open Workflow Studio; the **Game** tab appears to the right of the TagSpace tab.
The game pack needs Workflow Studio v0.10.0 or later.

### Preparation 2: prepare a workflow for the images
The Game tab generates images with the workflow chosen in its settings. The default is **`ws_game_sdxl_t2i`**, a sample made for the Game tab
(an SDXL (Illustrious) text-to-image workflow, 1216x832, saved to `ComfyUI/output/WFS_Game`).

The Checkpoint saved in the sample is often not on your computer, so set it to your own model:

1. Import `ws_game_sdxl_t2i.png` from the `workflows` folder into the Workflow tab, as in Chapter 4, section 4-8.
2. Load the imported workflow into GenerateUI, choose one of your SDXL Checkpoints under **Model** and press **Apply** (Chapter 5).
3. Save it under a name with **Save** (Chapter 5, "Saving the workflow you generated with").
4. In the **Settings** tab on the right of the Game tab, choose the saved workflow under **Workflow**.
   If it is not in the list, press the **Reload workflow list** button next to it.

Other text-to-image workflows work too, as long as they have a positive prompt node.

> **Caution**
> If the Checkpoint saved in the workflow is not on your computer, the game's images fail with an error.
> Generate once in GenerateUI and choose a workflow that works.

### The screen
| Place | Contents |
| --- | --- |
| **Games** on the left | The installed games. Click one to start it in the center |
| Center | The game. **Restart** at the top right goes back to the title screen |
| **Result** tab on the right | Cards for the generated images (newest on top) |
| **Settings** tab on the right | Play settings and image generation settings |

**Click** the game screen to send the keyboard to the game (keys pressed there do not affect the rest of Workflow Studio).
The game pauses when you switch to another tab or window.

### When images are generated
| When | Card | Image |
| --- | --- | --- |
| You clear a stage | A card for that stage | A victory shot of the heroine with that stage in the background |
| You caught all 5 hearts in the stage | A pink card (PERFECT!) | Instead of the victory shot, a private photo of the heroine off duty in casual clothes |
| You clear every stage | ENDING | The ending scene |
| Game over | A red GAME OVER card | A defeat scene of the heroine, with the stage where you fell in the background |

Images are made one at a time, in order. The seed is random every time.
They are saved in `ComfyUI/output/WFS_Game`. Starting a new game from the title screen clears the cards in the Result tab (the images stay).

What the heroine wears in a private photo differs by game and stage. The game adds negative tags so that it never goes beyond a swimsuit.

### What you can do with a card
- Open **Prompt** to see the prompts the game gave, each marked with its kind (**Style**, **Heroine**, **Scene**, **Stage**).
  Uncheck any you don't want or edit **Prompt to generate (editable)**, then press **Regenerate** to make it again.
- **Open in GenerateUI** loads the workflow with that card's prompt into GenerateUI.
  Handy when you want to remake it there with another size or model.

### The Settings tab
| Item | Contents |
| --- | --- |
| Difficulty | Easy, Normal or Hard. Lives and so on change by game |
| Music, Sound effects | On or off |
| Workflow | The workflow used to generate images (Preparation 2 above) |
| Base prompt | Words added before the prompts the game gives |
| Negative prompt | If empty, the workflow's own negative is used. The negative the game adds is appended to it |
| Generate an image at each stage clear / Also generate the ending image automatically / Also generate an image on game over | When off, images are generated only when you press **Generate** on a card |

Changing the play settings (difficulty, music, sound effects) restarts the game.
The settings are saved in the browser and included in the Settings tab's backups (section 11-5).

> **Tip**
> While the Game tab is open, VRAM Management messages (toasts) are not shown, so they never cover the game.

### The games (game pack v0.4.1)
| Game | Genre | Heroine | Contents |
| --- | --- | --- | --- |
| Star Formation | Vertical shooter | Rina | 5 stages, each ending with a boss. Enemies flashing yellow drop hearts |
| Turbo Heart | Racing | Misaki | 5 races. 8 cars; finish in the top 3 to go on. Nitro and obstacles |
| Prompt Typer | Typing | (none) | 10 stages. What you type, typos included, becomes the image prompt. 85% correct clears a stage |
| Sky Heart | Into-the-screen shooter | Hikari | 5 stages with bosses. An altimeter, hearts in the air and on the ground, power-ups |
| Smash Heart | Tennis | Nanami | Matches against 5 rivals, 4 games each. No music; racket hits and the umpire's calls set the mood |
| Knight Heart | Side-scrolling action | Kanon | 5 stages with bosses. Speed up on slopes, slide while running, jump farther the faster you run |

Every game except Prompt Typer has 5 hearts per stage (race, match).
Prompt Typer generates an image after every stage whether you clear it or not (when typing in Japanese or Chinese, use an image model that understands that language).

### Controls
| Game | Controls |
| --- | --- |
| Star Formation | ← → (A D) move, Space or Z shoots |
| Turbo Heart | ← → steer, ↑ or Z accelerates, ↓ or X brakes, Space or C nitro (3 per race) |
| Prompt Typer | Type the words. After a stage, Enter goes on, R retries, Q gives up. On the title, ↑ ↓ picks the language and ← → the start stage |
| Sky Heart | Arrow keys or WASD move, hold Space or Z to shoot |
| Smash Heart | Arrow keys move, Z or Space hits, X lobs. Hold ← → at contact to aim. Serve: Z to toss, Z again to hit |
| Knight Heart | ← → move, Space or X jumps, Z or C attacks (↑+attack throws straight up, ↓+attack in the air straight down), ↓ while running slides |

Every game pauses with **Esc** or **P**. A gamepad also works (except in Prompt Typer).
The detailed rules of each game are on the **Game Tab** page of the Help tab.

> **Tip**
> On game over in Knight Heart you can choose to **retry the stage** or **give up**.
> The defeat scene is generated only when you give up. While paused, **R** restarts the stage for one life.

---

> **Summary of this chapter**
> - In the Nodes tab you can list and organize installed nodes, and use them in the WS Library
> - Tagger automatically generates tags from images. A model and extra packages must be prepared
> - Image Edit is a simple editing tool with layers. Inpainting also lets you redraw parts
> - In the Video tab, you can make videos with supported video-generation models and do simple editing
> - "Default Checkpoint" and "Data Management (backup)" in the Settings tab are especially handy
> - Combined with Comic Creator by the same author, you can make manga from generated images
> - TagSpace lays out your tags, prompts and generated images in 3D by closeness of meaning, so you can browse it and pick tags for a prompt
> - In the Game tab you play the game pack's mini games, and an image of the heroine is generated automatically each time you clear a stage
