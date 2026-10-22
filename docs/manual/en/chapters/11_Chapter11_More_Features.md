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

You load a matching workflow with **Load in Video** in the Workflow tab and use it (Chapter 4, section 4-6).

### Main features
| Subtab | What you can do |
| --- | --- |
| Plan | Divide a video into "blocks", decide the prompt, length and first/last image for each block, and generate in order |
| Edit | Line up generated videos and images, then cut, join, add text and BGM, and export |
| Asset | List generated videos, images and audio. Audio can be set as BGM or added as sound (the Audio Only type filter shows audio only) |

There are also the **Frame** feature, which saves a favorite scene of a video as a still image, and **GIF**, which converts a video to an animated GIF.

### Register as Asset and audio conversion (v0.8.9 and later)
- **Register as Asset** - a button in the Video Source panel on the left. It copies a video from your PC into the output folder (`output/video`) and registers it in the "Video Assets" group.
  Once registered, it appears in the Asset subtab list and can be used in Edit and elsewhere.
  Videos already in the output folder (ones chosen in Asset or generation results) are only tagged into the group, not copied. If the name already exists, a number is added after it.
- **Convert audio...** - a button next to the crop buttons in the Edit subtab. It converts only the audio of the selected video clip to FLAC, MP3, Opus, M4A or WAV and saves it into `output/video`.
  It is the same dialog as Gallery's Convert. Only video clips that contain audio are covered.
- Pressing the audio-conversion button opens the dialog below. Choose the **output format** (such as FLAC), the **sample rate** and the **channels**, then press **Convert**.
  If you check the option to carry over the embedded prompt/workflow tags, the original video's information is kept in formats that can hold tags (such as FLAC).

- The Video Source panel is a little wider, the file name shows on one line, and the buttons sit in a single row.

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
  Workflow Studio's Gallery appears inside Comic Creator, and you can choose generated images and send them to panels with the **Send CC** button.
  (The Send CC button is shown only in a Gallery opened inside Comic Creator)
- **Generate images from Comic Creator**
  From the Comic Creator screen, through Workflow Studio (GenerateUI), you can generate images to put in panels (T2I),
  or redraw based on a rough you drew or an image you placed (I2I and inpainting).

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

> **Summary of this chapter**
> - In the Nodes tab you can list and organize installed nodes, and use them in the WS Library
> - Tagger automatically generates tags from images. A model and extra packages must be prepared
> - Image Edit is a simple editing tool with layers. Inpainting also lets you redraw parts
> - In the Video tab, you can make videos with supported video-generation models and do simple editing
> - "Default Checkpoint" and "Data Management (backup)" in the Settings tab are especially handy
> - Combined with Comic Creator by the same author, you can make manga from generated images
