# Chapter 1 Basics of ComfyUI and Workflow Studio

This chapter sorts out the ideas and terms worth knowing before you start operating anything.
You don't need to read it at the computer. Read it casually on your commute or in spare moments.

---

## 1-1 What is ComfyUI?

ComfyUI is free software for running image-generation AI on your own computer.
It supports many image-generation models, such as Stable Diffusion and FLUX.

The biggest feature of ComfyUI is that **you build the flow of processing by connecting "boxes" with "lines"**.

"A box that loads the model" -> "a box that takes the prompt" -> "a box that makes the image" -> "a box that saves it"...
When you connect boxes with lines like this, processing happens in that order.

This approach has big advantages.

- Everything about the processing is visible, so you can fine-tune it
- Even when a new technique appears, you can try it just by adding a box
- You can save a flow you have built and reuse it as many times as you like

On the other hand, for someone touching it for the first time, it is also a screen where "you don't know where to touch".
**Workflow Studio**, introduced in this book, is exactly a tool for softening that "hard-to-understand" quality.

---

## 1-2 Five terms to remember

The minimum set of terms worth knowing for using ComfyUI is these five.

### 1. Node
The "boxes" arranged on the screen.
One node handles one job, for example "load a model" or "save an image".
A node has entrances (inputs) and exits (outputs), and passes data along through connecting lines.

### 2. Workflow
The "whole flow of processing" made by connecting nodes with lines.
To use a cooking analogy, nodes are tasks such as "chop" and "stir-fry", and the workflow is the "recipe".
A workflow can be saved as a file in a format called JSON.

> **Tip**
> Images made in ComfyUI usually have the workflow information embedded in them.
> If you drag such an image onto the ComfyUI screen, you can recall the same workflow.

### 3. Model
The file that acts as the "AI brain" that makes images. They are typically large, from a few GB to tens of GB.
The main kinds are as follows (Chapter 6 explains them in detail).

| Kind | In a phrase |
| --- | --- |
| Checkpoint | The model that forms the core of image generation |
| LoRA | A small add-on model that teaches an art style or a character |
| VAE | The model in charge of finishing the colors and fine details of an image |

### 4. Prompt
The text that tells the AI "what kind of image you want". It is what people call a "spell".
There are two kinds: the **positive prompt**, where you write what you want drawn, and
the **negative prompt**, where you write what you do not want drawn.

### 5. Queue
The "reservation list for generation".
In ComfyUI, pressing the generate button first puts a reservation in the queue, and the reservations are processed in order.
If you reserve many images, they are generated in bulk while you are away from your seat.

---

## 1-3 Where beginners get stuck in ComfyUI

You installed ComfyUI, but have you stopped at any of these points?

1. **Workflows pile up and you can't tell which is which**
   As you keep saving workflows you found online, file names alone stop being enough to tell them apart.

2. **Hunting for values on the node screen every time is tiring**
   You only want to change the prompt or seed value, yet you have to find the right node inside a large workflow.

3. **Models and prompts are managed in a scattered way**
   It is easy to lose track of where you put which model, or what prompt worked last time.

4. **You can't reproduce the settings of an image you made before**
   Even when you wonder "which settings made that image?", you may not know how to look it up.

None of these is really a lack of ComfyUI features. The cause is **a lack of "organization" and of an "entrance"**.

---

## 1-4 What Workflow Studio can do

Workflow Studio is an **extension (a custom node)** that you add to ComfyUI.
It adds "a dedicated screen for management and generation" inside ComfyUI.

Workflow Studio answers the four sticking points above as follows.

| Sticking point | Workflow Studio's solution | Chapter |
| --- | --- | --- |
| Can't tell workflows apart | A thumbnail list, badges and groups, search | Chapter 4 |
| Hunting for values on the node screen is tiring | The GenerateUI tab shows only the items you need as a form | Chapter 5 |
| Models and prompts are scattered | Managed together in the Models tab and the Prompt tab | Chapters 6 and 7 |
| Can't reproduce settings | Check an image's metadata in the Gallery and send it to the canvas | Chapter 8 |

In addition, a side panel called the **WS Library** is added beside ComfyUI's node screen,
letting you place models and prompts onto the node screen by drag and drop (Chapter 9).

If you prepare AI that runs locally (such as Ollama or LM Studio),
you can also use AI support such as prompt translation and tag generation from images (Chapter 10).

> **Tip**
> Workflow Studio is not software that replaces ComfyUI.
> It is ComfyUI that makes the images; Workflow Studio plays the role of its "control panel" and "storage shelf".
> For that reason, it cannot be used unless ComfyUI is running.

### The screens can be used in your language
Workflow Studio supports English, Japanese and Chinese.
This edition explains things using the English display.

---

## 1-5 How this book proceeds

This book is meant to be read in the following order.

1. **Prepare** (Chapters 2 and 3)
   Install it and learn how to read the screens.

2. **Organize** (Chapter 4)
   Make the workflows you already have viewable as a list.

3. **Create** (Chapter 5)
   Generate your first image without touching the node screen.
   If you read this far, you can use the basics of Workflow Studio.

4. **Collect and review** (Chapters 6 to 8)
   Manage models, prompts and generated images, and reuse settings that worked.

5. **Expand** (Chapters 9 to 11)
   Bring in handy features such as the side panel and AI support, as you need them.

When in trouble, see the troubleshooting in Chapter 12 and the glossary in the appendix.

> **Summary of this chapter**
> - ComfyUI is software that makes images with a workflow of connected nodes (boxes)
> - The five terms to remember are "node", "workflow", "model", "prompt" and "queue"
> - Workflow Studio is an extension that adds a "storage shelf" and an "easy control panel" to ComfyUI
> - First, aim for the "first image" in Chapter 5
