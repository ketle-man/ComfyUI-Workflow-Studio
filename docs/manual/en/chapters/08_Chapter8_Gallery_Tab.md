# Chapter 8 The Gallery Tab - Looking Back at Generated Images

As you keep generating images, hundreds and thousands of images pile up in ComfyUI's `output` folder.
The **Gallery** tab is a place to browse them comfortably,
and to solve "how did I make this image?".

Images generated in ComfyUI have information about the workflow and prompt used for generation (**metadata**) embedded in them.
The Gallery tab reads this information so that you can reproduce the same settings right away.
Videos (MP4 and WebM) and audio files (WAV, MP3, OGG, M4A, FLAC and Opus) can also be handled in the same list as images.

---

## 8-1 Listing images

At the top of the Gallery tab there are four subtabs.

| Subtab | Role | In this book |
| --- | --- | --- |
| Output | The list of generated images (this is what you normally use) | 8-1 to 8-3 |
| ImagePrompt | Build prompts while looking at sample images | 8-4 |
| Style_Catalog | Choose from sample images of styles | 8-4 |
| Metadata | Drop an image file to inspect the information in it | 8-2 |

### The Output screen
The **Output** subtab is divided into three parts: left, center and right.

| Place | Role |
| --- | --- |
| Left (folders) | The list of folders inside the `output` folder. The topmost **[root]** is the whole `output` folder |
| Center (list) | The images of the chosen folder. Scroll down and more are loaded |
| Right (detail panel) | Information about the chosen image (8-2) |

First, choose a folder from the folder list on the left, and its images appear in the center.

> **Tip**
> If images you newly generated in GenerateUI or ComfyUI do not appear, press **Refresh** on the toolbar.

> **Tip**
> The location of the `output` folder that is read can be changed with **"Gallery Output Folder"** in the Settings tab.

### Switching the display, searching and sorting
As in other tabs, you can do the following.

- **Thumbnail / Table** - switch between thumbnail display and table display
- **Search box** - search by file name, tags, memo and **the contents of the prompt**. If you turn on the **S** button next to it, you can search by the meaning of a sentence (8-6)
- **Sorting** - Date (Newest) / Date (Oldest) / Name A-Z / Name Z-A
- **Star** - show favorites only
- **x Clear** - clear all filters at once

> **Tip**
> In the search box you can also search by words in the prompt.
> For example, searching "cat" finds images whose prompt contains cat.
> (Prompt search targets images that you have opened once in the detail panel)

### Looking large, and comparing
- Clicking an image shows it large in the right-hand detail panel.
- **Hold the Ctrl key** and click images to select several.
  Select two to four and press **Compare** to view them side by side.

Lining up images made by changing only the seed or the model makes the differences easy to see.

### Organizing
- You can sort with **favorites (star), tags, memo and groups** (set in the detail panel).
- You can select several and add them to a group together, or move them to another folder.
  The screen for choosing the destination (**Move To...**) has a filter box: enter part of a folder name to narrow the candidates, and press Enter to move to the first candidate.
- Pressing **Export** bundles the chosen images into a ZIP file for download.

> **Caution**
> Using **Delete** in the detail panel, or **Delete File** for a multiple selection, deletes the image files themselves.

---

## 8-2 Reading generation settings from metadata

When you click an image, four tabs appear in the right-hand detail panel.

| Tab | Contents |
| --- | --- |
| Prompt | The prompts used to generate the image (the tab shown first) |
| Info | File name, size, date, tags, memo |
| JSON | The workflow embedded in the image (JSON) |
| Groups | Group settings |

### Checking the prompt
The **Prompt** tab lists the prompts that were embedded in the image.
Positive ones are marked **POS**, negative ones **NEG**.
Clicking an item shows the whole text.

### Examining more closely (the Metadata subtab)
When you want to know in detail even the models and LoRAs used, press the **Metadata** button in the detail panel
(or click an image while holding the Alt key).
The Gallery's **Metadata** subtab opens and the following information is shown in an organized way.

- **Models** - Checkpoint, VAE, Diffusion Model, Text Encoder (center column)
- **LoRA** - the LoRAs used and their strength (center column)
- **Prompt** - positive and negative (center column)
- **Settings** - the image size (width x height), and the KSampler's Seed, Steps, CFG, Sampler, Scheduler and Denoise (right column; v0.7.14 and later)
- **Nanobanana** - the generation history of images made in Comic Creator's nanobanana tab: engine, model, prompt and so on (right column; only for matching images)

With the buttons beside the prompt, you can send the contents to other tabs.

| Button | What it does |
| --- | --- |
| Copy | Copy |
| GenUI:P / GenUI:N | Put it into GenerateUI's positive / negative |
| Prompt:P / Prompt:N | Put it into the positive / negative of a preset in the Prompt tab |

> **Tip: you can also examine images you found online**
> If you **drop** an image file onto the left side of the Metadata subtab, you can examine that image's information.
> Besides ComfyUI images, PNG images made with SD WebUI (AUTOMATIC1111), SD Forge and Fooocus are also supported.
> Handy when you want to know how an image found on a distribution site was made
> (however, it cannot be read from images whose metadata was stripped when they were posted).

---

## 8-3 Reproducing the same settings

The handiest use of the Gallery is to **generate again with the same settings as an image you like**.
There are two ways.

### Method 1: Reproduce in GenerateUI (Load GenUI)
1. In the Gallery, click the image you want to reproduce.
2. Press the **Load GenUI** button in the detail panel.
3. The workflow embedded in the image is loaded into GenerateUI.

After that, as in Chapter 5, you can generate while changing the prompt a little or changing the seed.

> **Tip**
> **When you want to make the same image again (v0.8.3 and later)**
> The workflow embedded in the image also contains the seed value from that time.
> If you set the generate panel's seed mode to **Workflow** and press Generate, it generates with that seed as it is.
>
> If the mode stays at Random, it generates with a different seed.
> Also, if you use Fixed, paste the value of the **Seed** field in the **Settings** subtab into the generate panel's **Seed** field (because the generate panel's value takes priority).

### Method 2: Reproduce on ComfyUI's node screen (Copy & Send Canvas)
1. In the Gallery, click the image you want to reproduce.
2. Open the **JSON** tab in the detail panel.
3. Press **Copy & Send Canvas**.

The workflow that made that image is loaded onto ComfyUI's node screen.
Use this when you want to adjust things in detail on the node screen.

> **Caution**
> If a message says "this image has no ComfyUI workflow embedded", it cannot be reproduced.
> This applies to images made with settings that do not save workflow information, and images edited or compressed with other software.

### Using an image as material for the next generation
You can also use a Gallery image as an "input image" for generation.

| Button | What it does |
| --- | --- |
| Send GenUI Image | Sets the chosen image as the input image (LoadImage node) of the GenerateUI workflow |
| Send to LI node | Sets the chosen image on the image-loading node currently selected on ComfyUI's node screen |
| Image Edit | Opens the chosen image in the Image Edit tab (Chapter 11) |
| Send CC | Sends the chosen image to a panel in Comic Creator (shown only when the Gallery is opened inside Comic Creator; Chapter 11, section 11-6) |

Handy when redrawing a generated image further with an I2I (image to image) workflow.

---

## 8-4 ImagePrompt and Style_Catalog

### ImagePrompt - building prompts from sample images
**ImagePrompt** is a subtab for building prompts by choosing visually,
with "sample images" and "prompts" lined up as sets.

1. Click a sample image and the prompt of that image appears on the right side.
2. Press **+ Add** and it is added to **Selected Prompts**.
3. After adding several, a **Final Prompt**, with them joined by commas, is produced.
4. Use **Copy** to copy it and paste it into GenerateUI or a preset.

Put the sample images in the `ws_image_prompt` folder, which is created automatically inside the `output` folder.
If you put a `.txt` file with the same name as the image (its contents being the prompt) alongside it, it becomes usable as a sample.

> **Example**
> `ws_image_prompt/hairstyle/ponytail.png` and `ws_image_prompt/hairstyle/ponytail.txt` (contents: `ponytail, long hair`)

### Style_Catalog - choosing styles by sample images
The styles introduced in Chapter 7 are hard to picture from their names alone.
In **Style_Catalog**, you can line up sample images for each style and choose by how they look.

Sample images are made with **Create Catalog** in the top bar of GenerateUI.

1. Load a workflow that makes images from text into GenerateUI.
2. In the **Style** section of the **Batch** subtab, tick the styles you want samples of.
3. Press **Create Catalog** in the top bar, decide the destination folder and run.
4. Press **Catalog** in the top bar to move to Style_Catalog in the Gallery.

When you choose a sample image in Style_Catalog and press **Select as Style**,
GenerateUI's style switches to that style.

> **Tip**
> How a style takes effect changes with the model.
> If you separate the destination folders by model, they are easier to compare.

---

## 8-5 Eagle integration and PSD export (optional)

From here on, these are features only for those who need them.

### Eagle integration
**Eagle** is paid software for organizing images.
If you enable **Eagle integration** in the Settings tab, images generated in GenerateUI can be automatically saved to Eagle together with information such as the prompt.
If you manage images in Eagle, give it a try.

### PSD export
Select several images in the Gallery and press **Create PSD**,
and you can make a PSD (Photoshop format) file with each image stacked as a layer.
Handy when you want to gather difference images together and finish them in image-editing software.

> **Caution**
> To use PSD-related features, an extra Python package (psd-tools) is needed.
> If it is not installed, the installation method is shown in an error message (Chapter 11).

---

## 8-6 Finding images by "meaning" (semantic search)

Normal search finds images whose file name, tags or prompt characters match.
**Semantic search** (v0.8.2 and later) searches by the "meaning" of an image.
For example, if you enter "a city street at dusk", it finds images with a matching mood even when the prompt does not contain those words.
You can also bring up a list of **similar images** to the one you choose.

### How to use it
1. Turn on the **S** button next to the search box. The search box switches to semantic search, and a second row appears on the toolbar.
2. Press the **gear** (settings) button on the second row and build the **index** (an index for searching) (see below).
3. Enter a sentence in the search box and press **Enter**. Results line up in score order, with the score shown on each thumbnail.
4. Select an image and press **Similar** on the second row, and images similar to it line up. Select another image and press the **refresh** button to redo the similar-image list for that image. Press **Similar** again to return to the normal display.

> **Tip**
> Sorting and tag/group filtering do not apply to semantic search results.
> The search range is inside the folder you have selected (including subfolders).
> A folder with a green dot next to its image count has all the images directly in it indexed.

### Choosing a model (the "Model" tab of the gear)
| Model | Characteristics | Preparation |
| --- | --- | --- |
| Gemini Embedding 2 | Computed on Google's service. Fast. Images are sent to Google | Get an API key, write `GEMINI_API_KEY=key` in the plugin's `.env`, and restart ComfyUI |
| EmbeddingGemma 2 | Computed inside your computer (local). Nothing is sent outside | No extra preparation. The model is downloaded automatically only the first time |

> **Caution: when using Gemini**
> Images are sent to Google's service. Content sent under the free tier may be used by Google to improve its products.
> If you have many images you do not want to expose, choose the local EmbeddingGemma 2.
> Write the API key only in `.env`, and do not show it to others.

### Building the index (the "Index" tab of the gear)
1. Choose the target folder (you can also choose whether to include subfolders).
2. Choose "new only" or "rebuild all" and start. Progress is shown, and you can stop partway.
3. The index is one shared across all folders. You may build it a little at a time, folder by folder.

When you change the model, the vector dimension or the image precision, a **rebuild of everything** is needed.

### Speed guidelines and settings
- The local EmbeddingGemma 2 runs on the CPU by default and takes a few seconds per image.
  Setting the **image precision** to "standard" or "light" makes it faster (rebuild everything after changing it).
  Reducing the **number of CPU threads** lightens the computer's load while generating images.
- If you have an NVIDIA GPU, installing `onnxruntime-gpu` into ComfyUI's Python brings it to about 0.1 second per image (the fix is in Chapter 12, section 12-5).
- In the **Search** tab, you can decide the "minimum score" for similar-image and text search, and the maximum number of results.
  Because the score level differs by model, it is saved per model.

---

## 8-7 Handling audio files, and converting

As opportunities to make music and sound effects in ComfyUI have increased, the Gallery can handle audio files too (v0.8.0 and later).
Supported are WAV, MP3, OGG, M4A, FLAC and Opus.

- In the list, a waveform thumbnail and a note badge are shown. The waveform color differs by format (MP3 blue, WAV green, FLAC amber, OGG/Opus purple, M4A pink).
- When you select one, the waveform and a player appear in the right-hand detail panel, and you can play it right there.
- For audio saved with a workflow (`prompt` / `workflow`) embedded, the Prompt and JSON tabs also work.
- Videos (MP4 and WebM) can be listed in the same way. With the **Send to LV node** button, you can send the chosen video to the **Load Video** node selected on the ComfyUI screen (the video version of Send to LI node for images).

### Converting files
When you select several items including audio or video, **Convert...** appears on the bulk-action bar.

1. Select the files you want to convert and press **Convert...**.
2. Decide the output format (FLAC / MP3 / Opus / M4A / WAV) and, if needed, the bitrate, sample rate and number of channels.
3. When run, the result is saved as a separate file in the same folder (if the same name exists, a number is added such as `name_converted`, and nothing is overwritten).

When you choose a video, only the audio track is extracted and saved.

| Carried over | Description |
| --- | --- |
| Workflow information | Carried over to MP3, FLAC, Opus and M4A. It cannot be carried over to WAV (a notice appears) |
| Favorites, tags, memo, groups | You can choose whether to carry them over |
| Deleting the original file | You can choose whether to delete it after a successful conversion (with a confirmation screen) |

> **Tip**
> OGG can be played, but cannot be chosen as an output format of conversion.
> You can convert with Workflow Studio alone, without installing other video-editing software.

> **Tip: use in the Video tab**
> In the Asset subtab of Video, you can set an audio file as "Set as BGM" or "Add as sound" (Chapter 11, section 11-4).

> **Summary of this chapter**
> - In the Gallery's Output, you can look back at generated images folder by folder. You can also search by words in the prompt
> - The detail panel's Prompt tab shows right away the prompt used to generate the image
> - With "Load GenUI" you can reproduce the same workflow in GenerateUI, and with "Copy & Send Canvas" on the node screen
> - To reproduce, set the seed mode to Workflow (or Fixed)
> - If you drop an image onto the Metadata subtab, you can examine the models, LoRAs and prompt in detail
> - With the S button you can search by the meaning of a sentence or by "similar images" (semantic search)
> - Audio files can also be listed, played and converted
