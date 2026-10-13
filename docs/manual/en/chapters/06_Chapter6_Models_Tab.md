# Chapter 6 The Models Tab - Managing Models and LoRAs

As you keep generating images, model and LoRA files keep increasing.
"What model was this file?" "What was that LoRA's trigger word?"
- The **Models** tab is what solves worries like these.

---

## 6-1 Kinds of models

At the top of the Models tab, tabs for each kind of model are lined up.
Each shows the files in the corresponding folder inside ComfyUI's `models` folder.

| Kind | In a phrase | Main location |
| --- | --- | --- |
| Checkpoint | The core of image generation. Nothing starts without it | `models/checkpoints` |
| LoRA | A small model that teaches an art style, character, outfit and so on | `models/loras` |
| VAE | Finishes the colors and fine details of an image. Often built into the Checkpoint | `models/vae` |
| ControlNet | A model for specifying composition, such as poses and line art | `models/controlnet` |
| UNET | The core of newer-format models such as FLUX (Diffusion Model) | `models/diffusion_models` and so on |
| TextEncoder | A model that converts the prompt text into a form the AI can understand | `models/text_encoders` and so on |
| Hypernetwork | An older-format add-on model for adjusting art style | `models/hypernetworks` |
| Embedding | A small file that teaches a particular word a meaning (often used for negatives) | `models/embeddings` |

> **Tip**
> At first, it is enough to make good use of just two: **Checkpoint** and **LoRA**.
> When you start using newer models such as FLUX, UNET and TextEncoder come up more often.

---

## 6-2 Displaying and finding in the list

### The first load
When you open the Models tab for the first time, the list is empty and a message says to load models with the refresh button.
Press **"Refresh"** on the toolbar and the list of models appears.
Press "Refresh" also when you have added new models.

### Thumbnail view and table view
As in the Workflow tab, you can switch between **Thumbnail** and **Table**.
24 items are shown per page.

In table view, clicking a column heading sorts by that column
(first click: ascending, second click: descending, third click: sorting off).

> **Tip**
> For thumbnails, `(model name).preview.png` located in the same place as the model file is used automatically.
> For models without an image, you can get one from Civitai using the method in 6-3, or set one yourself.

### Searching and filtering
The toolbar has items for filtering.

| Item | What it filters |
| --- | --- |
| Search models... | Keywords such as the name |
| Star | Favorites only |
| All Tags | Tags |
| All Folders | Subfolders |
| All Groups | Groups |
| All / Enabled only / Disabled only | Enabled or disabled state (6-5) |

If you narrow down so far that you lose track, press **"x Clear"** at the right end of the toolbar to clear everything.

### Favorites, badges and groups
The way of sorting is almost the same as in the Workflow tab (Chapter 4, section 4-4).

- **Favorites (star)** - mark models you use often
- **Badges** - attach colored labels made with **"Badge"**. The kinds and colors of badges are shared with the Workflow tab
- **Groups** - click a model and add it in the side panel's **"Groups"** tab

> **Tip**
> Groups are divided **by kind of model**.
> A Checkpoint group is shown only in the Checkpoint tab.
> Groups made here can also be used in the GenerateUI batch generation (Chapter 5, section 5-5).

---

## 6-3 Bringing in Civitai information

**Civitai** is a sharing site where many image-generation models are published.
Many of the models you get online are distributed on Civitai.

Workflow Studio computes a **hash value** (a value like a fingerprint of the file) from your local model file,
and can automatically look up the information registered on Civitai.

### What information you can get
- The model's name and kind (Checkpoint, LoRA and so on)
- **Base Model** (which family the model belongs to: SDXL, SD1.5, FLUX and so on)
- **Trigger words** (words to put in the prompt to bring out a LoRA's effect)
- Tags and description
- Sample images (also used for thumbnails)

### Getting one at a time
1. Click a model to select it.
2. In the right-hand side panel, open the **"CivitAI"** tab (this tab opens first when you select a model).
3. Press **"Fetch from CivitAI"**.

When fetching finishes, the model's information is shown.
In the **Sample** tab, you can look at sample images posted to Civitai.

### Getting them in bulk
Press the **"CivitAI"** button on the toolbar to fetch information in bulk for the models of the kind being shown.
Models whose information has already been fetched are skipped, so it is fine to press it again and again after adding models.
For models without a thumbnail image, a preview image is also saved automatically.

> **Tip**
> Computing the hash value takes time depending on the size of the model.
> If you have many models of several GB, run it when you have time to spare.

> **Tip**
> A model that was not found on Civitai shows a message saying it was checked but this model was not found on CivitAI.
> For models you made yourself, or models distributed somewhere other than Civitai, not being found is normal.
> If you tick **"Skip not found"**, models that were not found are skipped without being rechecked when fetching in bulk.

> **Tip: API key**
> The **"CivitAI API Key"** in the Settings tab can be left empty (optional).
> If authentication is needed to get some information, enter a key issued in your Civitai account settings.

### Especially handy when using LoRAs
Many LoRAs have no effect unless you put their **trigger words** in the prompt.
If you have fetched the Civitai information, you can check the trigger words in the side panel right away.
Also, when you use a LoRA in GenerateUI batch generation, the trigger words are added to the prompt automatically (Chapter 5, section 5-5).

---

## 6-4 Using models in generation and on the canvas

### Set it in GenerateUI (GenUI Model)
You can set the model chosen in the Models tab directly into the workflow in GenerateUI.

1. Load a workflow into GenerateUI beforehand (Chapter 5, section 5-1).
2. In the Models tab, select the model you want to use.
3. Press the **"GenUI Model"** button.

The model in the GenerateUI workflow is now replaced with the one you chose.
While comparing Civitai sample images, you can try any model that catches your eye right away.

> **Tip**
> For an Embedding, **GenUI PP** (add to the positive prompt) and **GenUI NP** (add to the negative prompt) buttons are shown.
> Add negative Embeddings with GenUI NP.

> **Caution**
> It cannot be used if the GenerateUI workflow has no node that loads that model.
> For example, you cannot set a LoRA in a workflow that has no LoRA node.

### Using it on ComfyUI's node screen
If you drag a model from the **M (Models)** tab of the **WS Library** beside ComfyUI's node screen onto the canvas,
a node that loads that model is placed automatically (Chapter 9).

---

## 6-5 Tidying away models you do not use

### Switching enabled and disabled
Models you will not use for a while can be set to **Disable** instead of being deleted.
A disabled model no longer appears in ComfyUI's model-selection lists, so the lists become tidier.

- With the **pause (II)** button on a card, you can switch enabled and disabled one at a time.
- You can also enable or disable them in bulk, by group.

> **Tip**
> When disabled, `.disabled` is added to the end of the file name. The file itself is not deleted.
> When you enable it again, the original name comes back.

### Operating in bulk (Select)
Press the green **Select** button to tick several models and operate on them together.

- Add to or remove from a group
- Add or remove badges
- Move to another subfolder (related files such as preview images move together)
- Delete

### Deleting
You can delete a model from the detail screen or from Select.

> **Caution**
> Deleting **permanently removes** the model file and its related files (preview image, Civitai information and so on).
> Many models take a long time to download again, so if in doubt, "disable" instead of deleting.

> **Summary of this chapter**
> - In the Models tab you can list ComfyUI's models by kind. Press "Refresh" first
> - You can sort with favorites, badges and groups. Groups can also be used in batch generation
> - With "Fetch from CivitAI", you can automatically bring in Base Model, trigger words, sample images and more
> - With "GenUI Model", you can try the chosen model in GenerateUI right away
> - For models you do not use, "disable" rather than delete, to be safe
