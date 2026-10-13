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
6. Press **Run**.

Results are listed in the **Results** panel.

### Handy features
- **Use generated image for next** - uses the generated image as the input image of the next run.
  You can make a series of images that change little by little.
- **Plan Save** - lets you save the settings (the plan). When saved, an overview image summarizing the results is also made,
  and dropping that image lets you load the same plan again.

> **Summary of this chapter (second half)**
> - With the Batch subtab, you can generate in bulk while changing the model, prompt, sampler and so on, one kind at a time
> - Choose the kind with the Batch Queue column checkbox and start with Generate. Turn the check off when done
> - Feeder is a feature that feeds many images one at a time into a workflow. A dedicated node is required
> - Lab is an advanced feature that can switch several settings at separate timings
