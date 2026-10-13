# Chapter 9 The WS Library - Using It Inside the ComfyUI Screen

In the chapters so far, we mainly used the main part of Workflow Studio (the screen with the row of tabs).
In this chapter, we use the **WS Library (Workflow Studio Library)** that opens beside ComfyUI's node screen.

With the WS Library, you can use the workflows, nodes, models and prompts you organized in Workflow Studio
**just by dragging and dropping onto the node screen**.
It is a feature whose convenience you feel more the longer you spend working on the node screen.

---

## 9-1 Opening the WS Library

1. Open ComfyUI's node screen.
2. Press the **WS Library** button (the icon of lined-up squares) added to the top menu.

A panel opens at the edge of the screen. Press the button again to close it.

### Six tabs
At the top of the panel, single-letter tabs are lined up. Hovering the mouse shows the proper name.

| Tab | Name | What you can do | In this book |
| --- | --- | --- | --- |
| W | Workflows | Load workflows | 9-2 |
| N | Nodes | Place nodes and node sets | 9-2 |
| M | Models | Place nodes that load models | 9-2 |
| P | Prompts | Place or copy saved prompts | 9-2 |
| I | Information | Inspect images and workflows and place the materials used | 9-3 |
| A | AI TOOL | Use AI features such as translation and chat | Chapter 10 |

Inside each tab there are further small tabs (subtabs).
In many tabs, the following subtabs are common.

- **All** - everything
- **Favorites** - things registered as favorites in the main Workflow Studio
- **Groups** - by the groups made in the main Workflow Studio

Also, in each subtab's search box, you can narrow down by typing a name.

> **Tip**
> What is shown in the WS Library is linked to the organization done in the main Workflow Studio (favorites, groups, badges).
> The better you organize in the main part, the easier the WS Library is to use.

---

## 9-2 Placing onto the canvas with drag and drop

The basic operation of the WS Library is very simple.

| Operation | What happens |
| --- | --- |
| Drag and drop onto the canvas | Places or loads it at the dropped position |
| Double-click | Places or loads it near the center of the screen |

### W - Load a workflow
When you drag a workflow onto the canvas (or double-click it), that workflow is loaded.
It behaves the same as when you drop a workflow file from the file explorer.

Subtabs: All / Favorites / Groups / By Badge (by badge)

> **Tip**
> If you opened the main Workflow Studio from a bookmark and "Send to Canvas" is unavailable,
> the target workflow is shown in this W tab, so drag it from here (Chapter 4, section 4-6).

### M - Place a model
When you drag a model onto the canvas, **a loader node with that model already chosen** is placed.

| Kind of model | Node placed |
| --- | --- |
| Checkpoint | Load Checkpoint (CheckpointLoaderSimple) |
| LoRA | Load LoRA (LoraLoader) |
| VAE | Load VAE (VAELoader) |
| ControlNet | Load ControlNet Model (ControlNetLoader) |
| UNET | Load Diffusion Model (UNETLoader) |
| TextEncoder | Load CLIP (CLIPLoader) |
| Hypernetwork | HypernetworkLoader |

The trouble of finding a node in a list, placing it, choosing the file name from a pull-down and so on goes away.
After placing it, you connect it with lines to other nodes and use it.

Subtabs: All / Favorites / Groups / By Type (by kind)

> **Tip**
> There is no loader node for Embeddings, so they cannot be placed on the canvas.

> **Tip: placing LoRAs in bulk**
> In a LoRA group, an item called **All N LoRAs** (N is the number of LoRAs in the group) is shown.
> If you drag it, a `Lora Loader (LoraManager)` node containing all the LoRAs in the group is placed.
> (The custom node **ComfyUI-Lora-Manager** is required)

### P - Place a prompt
When you drag a saved preset (Chapter 7) onto the canvas,
a **Prompt Text (WFS)** node containing the positive and negative prompts is placed.
This is a node bundled with Workflow Studio, and it outputs the prompt text.

If you only want to paste the prompt, you can copy it with the **P** (positive) / **N** (negative) buttons on the item.

Subtabs: All / Favorites / Categories (by category) / Groups

### N - Place a node
When you drag a node onto the canvas, that node is placed.
If you register frequently used nodes as favorites in the **Nodes** tab of the main Workflow Studio, you can take them out quickly.
In the N tab's list, **Alt + click** a node to switch its favorite on or off on the spot (v0.8.0 and later).
The N tab opens faster than before, because it shows the list first without waiting for the nodes' detailed information.

Subtabs: All / Favorites / Groups / Sets / Category (by category) / Package (by custom-node package)

### Node sets - saving a frequently used combination as a whole
A **node set** is a bundle of several nodes and their connections saved together.
If you save "a group of nodes you always use in the same combination", you can place the whole thing with one drag.

**Making a node set**
1. On ComfyUI's node screen, select the nodes you want to save (click while holding the Ctrl key, or drag to select a range).
2. **Right-click** on the selected nodes and choose **Save as Node Set**.
3. Save it with a name.

**Using a node set**
From the **Sets** subtab of the WS Library's **N** tab, drag it onto the canvas.

> **Example**
> It is handy to make sets of parts you want to add afterwards to any workflow,
> such as "a group of nodes that automatically corrects faces" or "a group of nodes for upscaling".

---

## 9-3 Inspecting the contents of an image in the Information tab

The **I (Information)** tab is a feature that inspects image and workflow files and lets you
**place the models and prompts that were used straight onto the canvas**.
Think of it as the Gallery's metadata (Chapter 8, section 8-2) made usable inside the node screen.

### How to use it
1. Open the **I** tab of the WS Library.
2. Drop the file you want to inspect (a PNG, WebP, MP4 or WebM image or video made in ComfyUI, or a workflow JSON) onto the panel.
3. The materials found in the file are shown, split into subtabs.

| Subtab | Contents | When dragged onto the canvas |
| --- | --- | --- |
| model | Checkpoint, VAE, Diffusion Model, Text Encoder | The corresponding loader node is placed |
| lora | The LoRAs used and their strength | A LoRA loader node is placed |
| Prompts | Positive (POS) and negative (NEG) prompts | A text-encode node containing the prompt is placed |

Clicking a prompt item shows the whole text, and **Copy** also copies it.

### When it is handy
- "I want to build a new workflow with the same model and LoRAs as that image I made before"
- "I just want to borrow the prompt from a workflow I found online"
- "Which LoRA did this image use, and at what strength?"

The point is that rather than loading the whole workflow, **you can take out and use only the parts you need**.

---

## 9-4 Changing the look of the WS Library

From the **gear button** inside the WS Library panel, you can set the panel's colors.

- The panel's background color
- The sub-header's background color
- Text color, and the color of auxiliary text
- Border color

If you adjust them to match ComfyUI's theme, you can use it without any sense of mismatch.
The settings are saved in the browser and applied the next time you open it.

> **Summary of this chapter**
> - The WS Library is a "shelf of materials" that opens beside ComfyUI's node screen
> - From the W, N, M and P tabs, you can place workflows, nodes, models and prompts by dragging (or double-clicking)
> - If you drag a model from the M tab, a loader node with the model already chosen is placed
> - With "Save as Node Set" in the right-click menu, you can save a combination of frequently used nodes
> - If you drop an image onto the I tab, you can take out and use the models, LoRAs and prompts that were used
