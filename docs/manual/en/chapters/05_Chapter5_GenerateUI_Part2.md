## 5-5 Batch generation - trying while changing conditions

As you get used to image generation, you start wanting to try things like these.

- Try all the models you have with the same prompt and compare them
- Generate several prompts one after another
- Check in bulk which sampler suits this model

Changing the settings and pressing Generate for each image is a lot of work.
With the **Batch** subtab, you specify "what to change while generating" all at once, and it generates in order automatically.

### What can be changed in a batch
In a batch, you choose **one** of the following seven kinds and generate while changing it in order.

| Kind | What changes | When to use it |
| --- | --- | --- |
| Checkpoint | The model | Compare how models draw |
| Lora | The LoRA | Compare the effect of LoRAs |
| Prompt | The prompt | Try saved prompts in order |
| Workflow | The workflow | Run several workflows in order |
| Sampler | The sampler | Compare the differences between samplers |
| Scheduler | The scheduler | Compare the differences between schedulers |
| Style | The style | Compare the differences between styles |

> **Tip**
> Only one kind can be changed at a time.
> If you want to change both the model and the prompt at once, use the Lab in 5-7.

### The Batch tab screen
The Batch tab is divided into three parts: left, center and right.

| Place | Role |
| --- | --- |
| Left (lists) | Choose Checkpoints / Sampler / Scheduler / Style from a list |
| Center (groups) | Choose Checkpoint / Lora / Prompt / Workflow by "group" |
| Right (Batch Queue) | The list of chosen items. This is where you decide which kind to run |

The groups in the center are linked to the groups made in each tab.

- Checkpoint and Lora groups -> the Models tab (Chapter 6)
- Prompt groups -> the Prompt tab (Chapter 7)
- Workflow groups -> the Workflow tab (Chapter 4)

### Example: comparing the models you have
Let's compare how three models draw, using the same prompt and the same seed.

1. Using the steps in 5-3, load beforehand a workflow with the prompt you want to compare.
2. Set the seed mode in the generate panel to **Fixed**.
   (Fixing the seed evens out every condition except the model, so the difference is easy to see)
3. Open the **Batch** subtab.
4. On the left **Checkpoints** tab, tick the models you want to compare.
5. In the right-hand **Batch Queue**, turn on the checkbox in the heading of the **Checkpoint** column.
   The column shows the list of chosen models and their count.

6. Press **Generate**.

It generates in order with the chosen models.
The **Batch** area of the generate panel shows which one is being generated now, and the overall progress.

- **Pause** - pauses. Pressing it again resumes.
- **Stop** - stops the whole batch.

> **Caution**
> If a Batch Queue column's checkbox stays on, the next time you press Generate it will run as a batch again.
> If you want to generate just one image, turn the column's checkbox off.

> **Tip: LoRA batches**
> In a Lora batch, the format of the chosen LoRA (`<lora:name:strength>`) and the trigger words obtained from Civitai
> are added automatically to the Positive Prompt. When the batch ends, it returns to the original prompt.

---

## 5-6 Feeder - processing images from a folder in order

**Feeder** is a feature that feeds many images one at a time into a workflow and processes them in order.
For example, you can use it like this.

- Convert photos you have collected into an illustration style in bulk (I2I: making an image from an image)
- Read poses from several images and draw a character in the same pose

Feeder has two modes, switched with the **[Image Loop] / [Gallery]** buttons at the top left of the Feeder tab.

| Mode | Where images are taken from | What you need |
| --- | --- | --- |
| Image Loop | A folder on your computer | The custom node **comfyui-image-feeder** (installed separately) |
| Gallery | A group in the Gallery tab | No extra installation (the **Gallery Feeder (WFS)** node bundled with Workflow Studio) |

> **Tip**
> In both modes, **a dedicated node must be in the workflow**.
> It cannot be used just by loading an ordinary workflow.

### How to use Gallery mode (no extra installation)
1. On ComfyUI's node screen, place a **Gallery Feeder (WFS)** node where the workflow "loads an image",
   and connect its image output. Save, and load it into GenerateUI.
2. In the **Gallery** tab (Chapter 8), gather the images you want to process into a group.
   (When you first open the Feeder tab, a group called `__Feeder__` is created automatically. You may use this)
3. Open the **Feeder** subtab of GenerateUI and choose **[Gallery]**.
4. Choose the target **Gallery Feeder Node** and the **group** to take images from, and press **Apply**.
5. The images of the group line up in the center. Click an image to start processing from that image.
6. Choose **After gen** (what to do after generation) and press **Run**.

### After gen (what to do after generation)
| Mode | What it does |
| --- | --- |
| Loop | Moves to the next image and, on reaching the end, returns to the start and continues (does not stop until you press Stop) |
| Increment | Moves to the next image, and stops automatically after processing the last one |
| Fixed | Keeps using the same image (when you want to make many images changing only the seed) |

At first, choosing **Increment** is reassuring: it processes each image once and stops automatically.

### Image Loop mode
In Image Loop mode, you use the images in a folder on your computer (`ComfyUI/user/default/image-loop-data/`).
You can also choose images from the folder and save them as a preset.
The **comfyui-image-feeder** custom node is needed separately.

The bundled samples `ws_sdxl_image_feeder_i2i` (I2I) and `ws_dwpose_image_feeder` (pose reading) are for this Image Loop mode.

### A sample for Gallery mode (v0.8.3 and later)
For Gallery mode you can use the bundled sample `ws_sdxl_gallery_feeder_i2i` (SDXL I2I).
You do not need to place nodes yourself: a **Gallery Feeder (WFS)** node is already in it (group name `__Feeder__`, sort order filename_asc).

1. Import the sample in the Workflow tab and press **Load in GenerateUI**.
2. In the Gallery, press the **F** button at the top left of the thumbnail of each image you want to process, to put it into the `__Feeder__` group.
3. In the **Feeder** subtab, choose **[Gallery]**, choose the Gallery Feeder Node and the group, and press **Apply**.
4. In the Model subtab, choose again the Checkpoint and VAE you have, and press **Apply** (the model names in the sample are those of the author's environment).
5. Set **After gen** to **Increment** and press **Run**.

---

## 5-7 Lab - experimental I2I batch generation (advanced)

**Lab** is an advanced, experimental feature that develops the batch generation of 5-5 further.
Feel free to skip it at first.

### Differences from Batch
| | Batch (5-5) | Lab |
| --- | --- | --- |
| What can be changed at once | Only one kind | Model, prompt and KSampler **separately from each other** |
| When changes happen | Every time | You freely specify "from which run to change" |
| Using a generated image as the next input | Not possible | Possible (can be chained) |

### The idea of keyframes
In Lab, you specify "from which generation run to switch to which setting" as **keyframes**.

Example: generating 10 times

| Runs | Model | Prompt | KSampler |
| --- | --- | --- | --- |
| 1 to 10 | Model A | - | - |
| 1 to 4 | - | "Morning city" | - |
| 5 to 10 | - | "Night city" | - |
| 1 to 7 | - | - | Steps 20 |
| 8 to 10 | - | - | Steps 40 |

In this way, the timing of switching can be decided separately for each column.
Until the next keyframe arrives, the previous setting is carried over.

### Basic flow
1. Load a workflow into GenerateUI.
2. Open the **Lab** subtab.
3. For I2I (image to image), drop the source image.
   When making from text (T2I), tick **T2I workflow (no source image)**.
4. Decide the number of generations (Batch).
5. In each of the Model, Prompt and KSampler columns, press **+** to add a keyframe,
   then double-click the keyframe and enter "from which run" and "to which setting".
   Cells in the KSampler column show the items you set (Step, CFG, Denoise, sampler, scheduler, Seed).
   A cell with nothing set shows "(workflow default)".
6. Press **Run**.

Results are listed in the **Results** panel.

### Handy features
- **Use generated image for next** - uses the generated image as the input image of the next run.
  You can make a series of images that change little by little.
- **Plan Save** - lets you save the settings (the plan). When saved, an overview image summarizing the results is also made,
  and dropping that image lets you load the same plan again.
- **Making a plan from a story** (v0.9.5+) - with the **Storyboard to Lab** skill in the AI TOOL chat,
  a story is split into one prompt per scene and the **Open in Lab** button loads the plan here (Chapter 10, section 10-5).

---

## 5-8 Using partner APIs (Nano Banana)

ComfyUI has **partner API nodes**, such as Google's **Nano Banana** image model (the Gemini image nodes), that hand the generation over to a cloud service.
From v0.8.6, GenerateUI can also run workflows that contain these nodes.

> **Caution**
> Partner API nodes run in the cloud, not on your PC's GPU, and **consume Comfy credits (paid)**.
> If you run them repeatedly with Batch, Lab and so on, credits are consumed once per run.

### Preparation: set your Comfy API key
1. Issue a Comfy API key at platform.comfy.org.
2. Add the line `COMFY_API_KEY=your key` to the `.env` file in the plugin folder.
   (If there is no `.env`, copy `.env.example` to make one.)
3. Restart ComfyUI. `.env` is read only at startup.

The key is used only on the server side and is never sent to the browser.
If you run without a key, a message says that partner API authentication failed and how to set it up.

### How to use
1. In the Workflow tab, load the Nano Banana sample (`ws_nano_banana_2_1_t2i`) into GenerateUI.
2. Edit the prompt on the left side (Prompt) of the **Input** subtab and press **Apply**.
3. To use reference images, specify them on the image cards on the right side (Image) of the **Input** subtab.
4. Press **Generate**.

> **Tip**
> You can also run it from ComfyUI's own screen while logged in. In that case you do not need the `.env` setting.

---

## 5-9 More workflows are supported (v0.8.4 and later)

The workflows you can use in GenerateUI have increased as follows. They are used the same way as other workflows.

- **Qwen Image 2.1 Turbo** - ComfyUI's official templates for text to image (T2I) and image to image (I2I). Edits also carry over to the prompt enhancer's input (the feature that expands your prompt automatically).
- **Flux.3 Klein** - the four official templates (T2I and Image Edit, for Klein and Klein SD).
- **MOSS-Image** - Base/SFT T2I, and the bounding-box versions that specify positions with frames.
- **Fibo 2.0 Edit** (v0.8.14 and later) - an image-editing workflow. With the prompt enhancer (PE) setup, edits in the prompt area apply whether PE is on or off. The negative area holds a VGL-format (JSON) description as is. Width and height (Settings) of 0 mean automatic.
- **FastH3 OmniRef / Pika-H3-Flex** (v0.8.14 and later) - MiniMax H3 reference to video. Treated as video workflows, and also usable in the Video tab (Chapter 11).
- **Native LoRA stack** - ComfyUI v0.40's nodes that load several LoRAs at once (LoadLoraModel / LoadLoraTextEncoder). Apply, bypass and the Metadata display are supported.
- **P-H3 Image** (v0.9.4+) - the image-edit and T2I templates. The prompt is shown on the Input tab and can be read by the Metadata tab; there is no negative prompt field. Width and height follow the workflow's wiring, and the prompt upsampler runs as set in the workflow.
- **MiniMax H3 Image** (v0.9.6+) - ComfyUI's official image-edit and T2I templates. As with P-H3 Image, the prompt is shown on the Input tab and can be read by the Metadata tab and the sidepanel I tab; there is no negative prompt field. The prompt enhancer (PE) can be turned on and off in the Settings tab's Switches column (5-4).

> **Caution**
> The native LoRA stack nodes are supported **only in API-format workflows**.
> ComfyUI's own screen cannot yet add rows to this node, so UI-format workflows are not covered.

> **Tip**
> Workflows containing the **Compare Images** (ImageCompare) node, which compares two images with a slider, used to fail on that node when run from GenerateUI (fixed in v0.9.6).

> **Tip**
> The Metadata tab and the side panel's **I** tab can also read images made with Nano Banana (v0.8.5 and later).
> The prompt appears as one whole entry, not split into Positive/Negative.

## 5-10 Writing prompts in your own language (Prompt Translation, v0.9.9 and later)

Most image generation models were trained on English prompts.
With **Prompt Translation** turned on, you can write a prompt in your own language and turn it into English with one button.
Like the translation extensions for Stable Diffusion web UI (A1111), it translates **only the parts written in your own language**.

Translation uses AI running on your PC (**Ollama**) and the translation model **PLaMo 3 Translate**, which supports 51 languages besides English (Japanese, Chinese, Korean, French, German, Spanish, Russian, Thai, Vietnamese and more).
Your prompts are not sent to an online translation service.

> **What you need first**
> Install and start **Ollama** (Chapter 10, section 10-1). The translation model can be downloaded from the Settings screen (see below).

### Preparation: turn it on in Settings
1. In the **Settings** tab, open **Prompt Translation (native language -> English)**.
2. Check **Enable prompt translation in GenerateUI**.
3. Choose the model in **Translation model**. Models not yet in Ollama are marked **(not downloaded)**; choose one and press **Download** to pull it into Ollama.
4. Press **Test**. When the sample prompt comes back in English, you are ready.

PLaMo 3 Translate comes in four sizes.

| Model | Size | Notes |
| --- | --- | --- |
| 0.8B | about 0.6 GB | Fastest. Enough for short tags |
| 2B | about 1.8 GB | Recommended. Translates sentences accurately too |
| 8B | about 5.3 GB | Higher quality |
| 31B | about 19.5 GB | Highest quality, for PCs with plenty of memory |

> **Tip**
> 0.8B sometimes shifts the meaning of a sentence (for example, "the camera follows from behind" in Japanese became "her camera following behind").
> If you often write prompts as sentences, such as video prompts, choose 2B or larger.

The other settings are:

| Setting | What it does |
| --- | --- |
| Source language | Usually leave it at **Auto-detect**. If you always write in one language, choosing it makes detection certain |
| Ollama URL | Ollama's address. Blank means `http://localhost:11434` |
| Where to run the translation model | **GPU** or **CPU, kept loaded** (see below) |
| Translate automatically when running | Translates automatically when you press Generate and so on (see below) |

Other Ollama models (such as the one you use for chat) can also be chosen under **Other Ollama models**. They are sent the text with a "translate into English" instruction.

### Where to run the translation model
| Where | Time per phrase | Good for |
| --- | --- | --- |
| GPU (fastest per translation, uses VRAM) | about 0.1 s | GPUs with VRAM to spare |
| CPU, kept loaded (no VRAM, no reload wait) | about 0.2-0.3 s | Keeping all VRAM for image generation |

On GPU, turning on **Unload the translation model from VRAM after translating** frees VRAM before image generation (on by default).
However, every translation then waits **about 4 seconds** while the model loads again.

**CPU, kept loaded** keeps the model in system RAM (about 2.7 GB for 2B).
It uses no VRAM and is loaded in the background when a workflow is loaded into GenerateUI, so even the first translation does not wait.

> **Tip**
> When Ollama loads another model (for example the AI TOOL chat model), it may drop the resident translation model.
> It then loads again automatically at the next translation (that one translation takes a few seconds).

### Using it: translate with the globe button
With Prompt Translation on, a **globe (🌐)** button appears to the right of the **↺** button of Positive Prompt and Negative Prompt on the Input tab.

1. Write the prompt in your own language. Mixing in English tags is fine.

   ```
   masterpiece, 夕焼けの海辺に立つ少女、(長い黒髪:1.2), <lora:test_lora:0.8>, {猫耳|狐耳}, 水彩画風
   ```

2. Press the globe button.
3. Only the parts in your language become English.

   ```
   masterpiece, A girl standing by the seaside at sunset, (long black hair:1.2), <lora:test_lora:0.8>, {cat ears|fox ears}, watercolor style
   ```

The following prompt syntax is kept as it is, without translating:

- Commas and line breaks
- Weights `(word:1.2)` and `[ ]`
- Random choice `{A|B}` and wildcards `__name__`
- LoRA `<lora:name:0.8>` and `embedding:name`
- `BREAK` and `AND`

After translating, an **Original** button appears. Press it to go back to the text before translation (Ctrl+Z also works).

> **Note**
> Only parts that contain letters outside ASCII are translated; English-only parts stay as they are.
> Conversely, an English word that contains an accented letter such as é is translated too.

### Translating automatically when running
Under **Translate automatically when running** in Settings, checkboxes choose when to translate automatically.

- **GenerateUI - Generate**: pressing Generate replaces the text of the Positive/Negative fields with the translation, then generates
- **GenerateUI Lab - Run**: a Lab run translates only what is sent. The Lab plan keeps your text
- **Video Plan - Run**: a Video tab Plan run translates only the prompts that are sent. The plan keeps your text

Because Lab and Video Plan keep your text, you can keep editing the plan in your own language.
The information saved with the generated images and videos (metadata) records the English prompt that was actually sent.

> **Note**
> If translation fails while automatic translation is on (for example, Ollama is not running), generation stops so that untranslated text is not sent.
> For Lab and Video Plan, the reason is shown in the progress line.

### Also in the Lab modal and Video Plan
The globe button is also on these fields, and works the same way:

- The Positive and Negative fields of the screen that opens when you double-click a cell in Lab's prompt column (5-7)
- The **Prompt** field of a block in the Video tab's Plan subtab (Chapter 11, section 11-4)

> **Tip**
> PLaMo 3 Translate is free for personal use, hobbies, research and other non-commercial use (PLaMo Community License).
> Check the license terms before using it commercially.

> **Summary of this chapter (second half)**
> - With the Batch subtab, you can generate in bulk while changing the model, prompt, sampler and so on, one kind at a time
> - Choose the kind with the Batch Queue column checkbox and start with Generate. Turn the check off when done
> - Feeder is a feature that feeds many images one at a time into a workflow. A dedicated node is required
> - Lab is an advanced feature that can switch several settings at separate timings
> - Partner API nodes (Nano Banana and others) run once `COMFY_API_KEY` is set in `.env`. They consume credits
> - With Prompt Translation on, the globe button turns a prompt written in your own language into English. Prompt syntax is kept, and Generate, Lab and Video Plan runs can translate automatically
