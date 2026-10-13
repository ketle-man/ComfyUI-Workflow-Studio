# Chapter 5 The GenerateUI Tab - Making Images Without Touching Nodes

At last, you generate an image with Workflow Studio.
The **GenerateUI** tab is a screen that picks out, from inside a workflow, the items you change often, such as "prompt", "model" and "size",
and shows them as an input form.
You no longer need to find nodes and follow lines.

In the first half of this chapter (5-1 to 5-4), you use the basic sample imported in Chapter 4 to generate your first image.

> **Before you start**
> - ComfyUI is running
> - At least one Checkpoint model is in ComfyUI's `models/checkpoints` folder
> - You have imported a sample workflow (such as `ws_sdxl_t2i_basic`) in Chapter 4

---

## 5-1 Loading a workflow into GenerateUI

1. Open the **Workflow** tab.
2. **Click** the workflow you want to use (for example `ws_sdxl_t2i_basic`) to select it.
3. In the side panel's **GenerateUI Check** (Chapter 4, section 4-7), confirm that "Convert" shows a check mark.
4. Press **"Load in GenerateUI"** on the toolbar.

The screen switches automatically to the **GenerateUI** tab, and the contents of the workflow are loaded.
If the name of the loaded workflow is shown at the top of the screen, it worked.

> **Tip**
> On the GenerateUI screen, button and item names are shown in English.
> This book uses the displayed English names as they are.

---

## 5-2 Reading the GenerateUI screen

The GenerateUI tab is divided into the following main parts.

| No. | Place | Role |
| --- | --- | --- |
| 1 | Top bar | Connection state with ComfyUI, workflow name, various buttons |
| 2 | Subtabs | Switch between Input / Model / Settings / Feeder / Batch / Lab |
| 3 | Editing area (center) | The settings of the chosen subtab |
| 4 | Raw JSON (right side) | Shows the contents of the workflow as JSON (for advanced users) |
| 5 | Generate panel | The Generate button, progress, seed settings, generated results |

### 1. The top bar
| Display / button | Meaning |
| --- | --- |
| Connected / Disconnected | Whether it is connected to ComfyUI. If it is a green **Connected**, you can generate |
| Connect | Reconnects to ComfyUI |
| Refresh Models | Reloads the list of models (press it after adding models to ComfyUI) |
| Reset Workflow | Discards edits and returns to the state right after loading the workflow |
| Workflow name | The workflow currently loaded |

> **Tip**
> When you open the GenerateUI tab, it connects to ComfyUI automatically.
> If it shows **Disconnected**, check that ComfyUI is running and press **Connect**.

### 2. The subtabs
| Subtab | What you set | In this book |
| --- | --- | --- |
| Input | Prompts, input images | 5-3 |
| Model | Models such as Checkpoint, VAE and LoRA | 5-3 |
| Settings | Seed, step count, sampler, image size and so on | 5-4 |
| Feeder | Process images in a folder in order | 5-6 |
| Batch | Generate in bulk while changing conditions | 5-5 |
| Lab | Experimental I2I batch generation (advanced) | 5-7 |

At first, it is enough to learn just the three: **Input, Model and Settings**.

### 4. Raw JSON
To the right of Input, Model and Settings, the contents of the workflow are shown in JSON format.
When you change values in the form, they are reflected here too.
Until you are used to it, treat this as "view only".

---

## 5-3 Generating your first image

Now, to generate. At minimum, you check and set these three things.

1. Which model to draw with (Model)
2. What to draw (Input -> Prompt)
3. Generate (Generate)

### Step 1: Choose a model (Model)
1. Open the **Model** subtab.
2. In the **Checkpoint** field, choose a model you have.
   If the list is long, typing characters in the box above the field narrows it down.
3. Press the **Apply** button below the field.

> **Tip: when a model cannot be found**
> The model saved in a workflow may not be on your computer.
> You will almost always run into this when using distributed workflows. It is signaled in one of two ways.
> - The field shows "(model name) (not found)" with a warning mark
> - When loading, a message says the workflow's Checkpoint "..." was not found and was replaced with another model without warning
>   (in this case it has been replaced automatically with the first model in the list you have)
>
> In either case, choose the model you want to use from the list and press Apply.
> If choosing again each time is a nuisance, the **Default Checkpoint** in the Settings tab (Chapter 11) is handy.

> **Caution: Don't forget Apply**
> In GenerateUI, after changing a model or the Settings values (5-4), you must press **Apply** for them to be reflected in the workflow.
> If you Generate without pressing Apply, the image is generated **with the values from before the change**.
> When "I changed a setting but the result didn't change", suspect a forgotten Apply first.
> (Only the prompt input fields are reflected automatically when you press Generate)

> **Tip**
> Item names shown in bright green are items for which the loaded workflow contains a node for that model.
> Items that are not green have no effect on this workflow even if you change them.

### Step 2: Write a prompt (Input)
1. Open the **Input** subtab and choose **Prompt** inside it.
2. In the **Positive Prompt** field, enter in English what you want drawn.

   ```
   a cute cat sitting on a windowsill, sunlight, soft colors, high quality
   ```

3. Press **Apply** for the **Positive Prompt**.
4. If needed, enter in the **Negative Prompt** field what you do not want drawn, and press **Apply** for that too.

> Even if you forget Apply, the prompt is reflected automatically when you press Generate.
> However, you can check the reflected result in the Raw JSON (right side), so it is reassuring to get into the habit of pressing Apply.

   ```
   low quality, blurry, bad anatomy
   ```

> **Tip**
> Pressing the **reset arrow** button next to Apply returns the contents of the field to the value currently reflected in the workflow.
> Handy when an edit went wrong.

> **Tip**
> If you are not good at English, the AI translation features introduced in Chapters 7 and 10 let you turn a prompt you thought up in your own language into English.

### Step 3: Generate (Generate)
1. Press the **Generate** button in the generate panel on the screen.
2. A bar showing progress extends, and a percentage is displayed.
3. When "Done" is shown, the generated image appears in the generate panel.

Congratulations. You have completed your first image with Workflow Studio.

A generated image is saved in ComfyUI's `output` folder, just as when generated in ComfyUI.
To look at it again later, you can browse it in the **Gallery** tab (Chapter 8).

> **Tip: when you want to stop partway**
> During generation, a **Stop** button appears next to the Generate button. Pressing it interrupts generation.

> **Tip: Apply and Generate at once**
> **Click Apply while holding the Alt key** to reflect the values and generate in one go.
> Once you are used to it, you can try things quickly: rewrite the prompt, then Alt + Apply.

### Saving the workflow you generated with
If you want to use settings changed in GenerateUI again later, press the **Save** button at the right end of the subtabs.
If you save it with a name, it is added as a new workflow in the Workflow tab.

---

## 5-4 What seed, sampler and step count mean

Once the first image is out, next look at the **Settings** subtab, where settings that decide how the result turns out are found.

The Settings tab is divided into two blocks, left and right.

- **KSampler (left)** - settings for how the image is drawn
- **Latent Image (right)** - settings for the size and number of images

Here too, don't forget to press **Apply** on each block after changing values.

### KSampler items
| Item | Meaning | Rule of thumb for beginners |
| --- | --- | --- |
| Seed | The "seed of the random numbers" the image grows from. With the same settings and the same seed, you get almost the same image | When generating, the seed settings in the generate panel (below) take priority, so think of this as "for checking the seed of the loaded workflow". To use the workflow's seed as it is, set the generate panel's mode to **Workflow** |
| Steps | How many times to repeat the drawing. More is more careful but takes longer | 20 to 30 |
| CFG | How faithfully to follow the prompt. Too high and colors and shapes tend to break down | About 5 to 8 for SDXL |
| Sampler | The drawing algorithm | `euler`, `dpmpp_2m` and so on |
| Scheduler | How the drawing amount is distributed across steps | `normal`, `karras` and so on |
| Denoise | How much to redraw the original image. 1.0 when making from text | 1.0 (0.4 to 0.7 and so on when making from an image) |

> **Tip**
> The suggested values differ by model. The model's distribution page (Civitai and so on) often lists recommended values, so check it.
> If unsure, using the values the sample workflow starts with is fine.

### Latent Image items
| Item | Meaning | Rule of thumb |
| --- | --- | --- |
| Width | Horizontal size of the image (pixels) | Around 1024 for SDXL, around 512 for SD1.5 |
| Height | Vertical size of the image (pixels) | Same as above |
| Batch Size | How many images to make in one generation | 1 to 4 (more uses more memory) |

> **Caution**
> If you stray far from the size the model learned, people tend to come out doubled or the composition falls apart.
> Even when you want portrait or landscape, adjust so the total pixel count stays about the same (for example 832x1216 for SDXL).

### Managing the seed (generate panel)
The seed is managed with the **Seed** field in the generate panel and the pull-down below it.

| Mode | What it does | When to use it |
| --- | --- | --- |
| Random | Generates with a random seed every time | When you want to try various pictures |
| Fixed | Fixes it to the value in the Seed field | When you want to keep a picture you like and change only the prompt to compare |
| Increment | Increases the seed by 1 each time you generate | When you want to make slightly different pictures in sequence |
| Decrement | Decreases the seed by 1 each time you generate | The reverse of Increment |
| Workflow | Uses the seed in the workflow as it is, without overriding it | When you want to reproduce, with the original seed, an image loaded from the Gallery or a distributed workflow |

When generation finishes, the Seed field shows **the seed value actually used**.

> **Tip: Workflow mode (v0.8.3 and later)**
> If you set the mode to **Workflow**, it generates with the loaded workflow's own seed, not the Seed field's value or a random one.
> Even after trying several images with Random, it returns to the workflow's original seed (the value at the time of loading) when generating.
> If no seed input can be found in the workflow, the value in the Seed field is used (random if it is -1).
> If you press it twice in a row with the same seed and the same settings, ComfyUI reuses the already computed result, so no new image is added (this is not a malfunction).

### The flow of "growing" a picture you like
Using the seed, you can improve a picture you like a little at a time.

1. Generate several with **Random** and look for a composition you like
2. When a picture you like appears, switch the mode to **Fixed** (the Seed field already holds that picture's seed)
3. Add words to the prompt or change Steps, and compare the differences

Fixing the seed makes it easy to see "what you changed, and how it changed".
This is the shortest path to getting used to image generation.

> **Summary of this chapter (first half)**
> - Select in the Workflow tab and press "Load in GenerateUI" to edit in GenerateUI
> - The basics are the three subtabs Input (prompt), Model (model) and Settings (detailed settings)
> - After changing the model or Settings values, always press **Apply**. If you forget, it generates with the values from before the change (prompts are reflected automatically)
> - Generate to produce. Alt + Apply reflects and generates in one go
> - If you set the seed to Fixed, you can keep a picture you like and compare by changing conditions. To use the workflow's seed as it is, use Workflow
