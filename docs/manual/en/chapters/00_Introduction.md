# Introduction

"I installed ComfyUI, but the node screen made me freeze."
"I downloaded so many workflows from the web that I can't tell which is which."
"I want to reuse the settings of an image that turned out well, but I can't find them."

This book is for people like that. It is an introduction to **ComfyUI-Workflow-Studio** (Workflow Studio from here on).

---

## Why is ComfyUI hard?

ComfyUI is one of the most flexible image-generation AI tools available today.
When a new model or technique is announced, ComfyUI is usually the first place you can use it.
Even so, many people stumble at the very first step. The reason is that ComfyUI is built on **a completely different way of thinking from ordinary applications**.

### How it differs from ordinary applications
| | Ordinary application | ComfyUI |
| --- | --- | --- |
| Screen | A fixed screen designed by the developer | You assemble it yourself by connecting nodes (boxes) with lines |
| Usage | Press buttons and menus and it works | You must know which nodes to connect, and how |
| Adding features | Wait for an update | You add custom nodes made by other people yourself |
| Where settings live | Collected in a settings screen | Scattered across many nodes inside the workflow |

An ordinary application is like a "finished appliance". Switch it on and you can use it right away, the way it was designed.
ComfyUI, on the other hand, is "a kit you build from parts".
If you know how to build, you can make anything. If you don't, you can make nothing.

### Freedom, and its side effects
The greatest appeal of ComfyUI is this **freedom to customize**.
You can combine custom nodes made by developers around the world to build your own flow of processing (a workflow).
Advanced workflows made by experienced users are published all over the web, and you can try them right after downloading.

But freedom has side effects too.

- **Workflows pile up** - as you keep downloading things to try, you lose track of which is which
- **You don't know where to touch** - in a large workflow made by someone else, even changing just the prompt means hunting for the right node
- **Your materials get scattered** - models, LoRAs, prompts and generated images end up in separate places, with no tool to manage them
- **Trial and error takes effort** - even to compare a few conditions, you must rewrite node values by hand every time

ComfyUI is excellent as a tool for "building", but
it offers almost nothing for "organizing", "reusing" and "trying things quickly".
Workflow Studio was made to fill that gap.

---

## What makes Workflow Studio different

### 1. Why a dedicated screen (SPA)? - separating "building" from "using"
Workflow Studio is an **independent, dedicated screen** (an SPA: single-page application) that you open from the **W** button in ComfyUI's top menu.

Building a workflow is best done by trial and error on ComfyUI's node screen.
Workflow Studio was created as a screen for **putting the workflows you have built to quick use**.

For that reason, Workflow Studio thinks of a workflow as three stages, **input, processing and output**, and is designed as follows.

| Stage | Design idea |
| --- | --- |
| Input | Make it easy to enter prompts and images |
| Processing | Keep changing values down to the fewest possible operations |
| Output | Make generated data easy to manage |

Underlying the design is the **5S** way of thinking (sort, set in order, shine, standardize, sustain) used in manufacturing.
The aim is to keep what you need in a state where you can take it out and use it, when you need it, right away.

The thing that connects the two screens, ComfyUI's node screen and Workflow Studio, is the **WS Library**, which opens beside the node screen.
Together with the supporting features, it makes moving between the two screens smooth.

### 2. Management - everything scattered, in one place
| What you can manage | What you can do |
| --- | --- |
| Workflows | Thumbnail list, sorting by badges and groups, search, a pre-check of whether a workflow will work in GenerateUI |
| Models and LoRAs | Lists by type, automatic retrieval of Civitai information (trigger words, sample images) |
| Prompts | Save and sort as presets, wildcards, styles |
| Generated images and audio | Browsing folder by folder, search by prompt or by "meaning", reading and reproducing embedded settings (audio files are supported too) |

### 3. Efficiency - try things quickly without touching nodes
- **GenerateUI tab** - automatically picks out, from inside a workflow, the items you change often (prompt, model, size and so on) and turns them into an input form. Even large workflows made by others can be used without hunting for nodes
- **Batch generation** - automatically runs your trial and error in bulk: "try all my models", "try prompts one after another", "compare samplers"
- **Feeder and Lab** - more advanced automation, such as processing many images in order, or switching several conditions step by step

### 4. Support features - help before and after generation
- **Image Edit** - simple layer-based editing, and redrawing parts with a mask (inpainting)
- **Local AI integration** - translating prompts from Japanese, creating prompts and tags from images
- **Tagger and Video** - automatic tag generation from images, and video generation with simple editing

---

## A custom node that is worth installing

For the following reasons, Workflow Studio is a custom node that is **"worth installing just in case"** for everyone who uses ComfyUI.

- **It is free, and you can install it right away from ComfyUI Manager**
- **The basic features need no extra preparation** - everything required is already included with ComfyUI. Extras such as AI and image editing can be prepared when you want to use them
- **You don't have to change how you work now** - workflows use ComfyUI's own save folder as it is. You can keep working on the node screen as before
- **It gets more useful the more you use it** - start with just browsing a list of workflows or checking the settings of generated images, then widen your use to GenerateUI and batch generation as you get used to it

It keeps ComfyUI's "freedom" and adds "clarity" and "ease". That is Workflow Studio.

## What you will learn in this book

- Installing Workflow Studio and how to read its screens
- Organizing the workflows you already have, with thumbnails
- Generating your first image without touching the node screen
- Managing models, LoRAs and prompts so you can reuse settings that worked
- Reading the settings used from a generated image and reproducing them
- Translating prompts and reading images with local AI
- Common problems and how to fix them

## What this book does not cover

- How to install ComfyUI itself
  (the explanation starts from the point where ComfyUI is already installed and can be launched)
- How to build a workflow from scratch by assembling nodes
- Detailed explanations of how image-generation AI works, or of model training (such as how to make a LoRA)

---

## Who this book is for

- People who have just installed ComfyUI, or who want to start using it seriously
- People who find the node screen hard and want to generate images more easily
- People who are struggling to organize growing numbers of workflows, models and prompts

It is written so that you can follow it if you know basic computer operations (copying files, opening folders, using a browser).

---

## Version and environment covered

- **Workflow Studio**: v0.8.9
- **ComfyUI**: the latest version at the time of writing
- **OS**: Windows (screen examples are from Windows)

Workflow Studio is under active development, so
depending on the version, the look of the screens and the positions of buttons may differ from this book.
For features that have changed significantly, also check Workflow Studio's **Help** tab and the release notes on GitHub.

---

## Notation used in this book

| Notation | Meaning |
| --- | --- |
| **Bold** | Button names and item names shown on screen |
| "GenerateUI" | The name as shown on screen |
| `ComfyUI/models/` | The location of a folder or file. For how to read this for your environment, see Chapter 2, section 2-6 |
| `Ctrl + Z` | A keyboard operation. "+" means pressing the keys at the same time |

> **Tip**
> Information that is handy to know.

> **Caution**
> Information to be careful about, because getting it wrong can lose data or stop things from working.

### About the display language
Workflow Studio supports English, Japanese and Chinese. This English edition explains things using the **English display**.
You can change the display language in the Settings tab (Chapter 2, section 2-5).

---

## How to read this book

If you are new, read **Chapters 1 to 5** in order and try things by hand.
Once you have generated your first image in Chapter 5, you have the basics of Workflow Studio.

From Chapter 6 onward, feel free to read from whichever place you need.
When in trouble, use the troubleshooting in Chapter 12 and the glossary in the appendix.

Now, let's start generating images with Workflow Studio, more easily and more enjoyably.
