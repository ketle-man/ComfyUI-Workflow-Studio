# Getting Started with ComfyUI Workflow Studio

Don't Be Afraid of Nodes - Generate Images More Easily and Keep Them Organized

- Covers: Workflow Studio v0.8.9
- Author: ketle-man
- (c) 2026 ketle-man

This is the **text-only edition** (without screenshots) of the Kindle book.
Chapter files are in the `chapters/` folder; the whole book in one file is `Workflow_Studio_Manual_v0.8.9_en.md`.
Screen examples are omitted, so please use the book together with Workflow Studio's Help tab.

---

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

---

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

---

# Chapter 2 Installation and Launch

In this chapter we add Workflow Studio to ComfyUI and go as far as opening its screen for the first time.
It assumes that ComfyUI itself is already installed and can be launched.

---

## 2-1 What you need

### Required
| What you need | Description |
| --- | --- |
| ComfyUI | A recent version is fine. Because it uses a feature that places buttons in the top menu, a fairly new version (frontend v1.33.9 or later) is recommended |
| Python 3.10 or later | The one bundled with ComfyUI is fine |
| A web browser | Such as Chrome or Edge: the browser in which you open the ComfyUI screen |

The basic features of Workflow Studio work with no extra preparation as long as ComfyUI is running.

### Later, as needed
The following are needed only when you use particular features. You can ignore them at first.

- **Ollama, LM Studio and similar** - AI support features such as prompt translation and AI chat (Chapter 10)
- **Eagle** - a feature that automatically saves generated images to the image-management software Eagle (Chapter 8)
- **Extra Python packages** - Tagger (tag generation from images), PSD export and the like (Chapter 11)

> **Tip**
> It is not the case that "you can't use it unless you have everything".
> Start by installing only the main part, and add things when features you want to use come up.

---

## 2-2 Install with ComfyUI Manager (recommended)

**ComfyUI Manager** is a management tool that lets you search for and install custom nodes (extensions) from the screen.
Recent versions of ComfyUI often include it from the start, and it is the easiest method.

1. Start ComfyUI and open its screen in the browser.
2. Click the **"Manager"** button in the top menu.

3. Click **"Custom Nodes Manager"**.
4. Type **`Workflow Studio`** in the search box.
5. Click **"Install"** on **ComfyUI-Workflow-Studio** in the list.

6. When the installation finishes, **restart ComfyUI** following the on-screen guidance.

> **Caution**
> ComfyUI loads extensions only once, when it starts.
> Always restart ComfyUI after installing. Reloading the browser alone will not take effect.

---

## 2-3 Install manually (git clone)

If ComfyUI Manager is not available, or if you are comfortable with Git, you can also install manually.
You use a screen where you type commands (on Windows, "Command Prompt" or "Terminal").

1. Move to the **`custom_nodes`** folder inside the ComfyUI folder.

   ```
   cd ComfyUI/custom_nodes
   ```

2. Type the following command to download Workflow Studio.

   ```
   git clone https://github.com/ketle-man/ComfyUI-Workflow-Studio.git
   ```

3. If a **`ComfyUI-Workflow-Studio`** folder now exists inside `custom_nodes`, it worked.
4. Restart ComfyUI.

> **Tip**
> If the `git` command is not available, you first need to install Git (for example Git for Windows).
> If you are unsure, the ComfyUI Manager method in 2-2 is recommended.

---

## 2-4 Launching

### Open it from the W button
When you restart ComfyUI, a **"W"** button has been added to the menu at the top of the screen.
This is the button that opens Workflow Studio.

- **Click** - Workflow Studio opens in a new tab.
- **Shift + click** - It opens in a new window. Handy when you want to use it side by side with the ComfyUI screen.

A **camera button** has also been added near the W button.
It is the button for saving a workflow screen as a thumbnail (you use it in Chapter 4).

### How addresses and port numbers work
When you press the W button, the address of Workflow Studio appears in the browser's address bar.
Knowing how to read this address lets you open it directly from a bookmark and track down causes when something goes wrong.

The address is made of the following three parts.

| Part | Example | Meaning |
| --- | --- | --- |
| Host | `127.0.0.1` | Which computer to connect to. `127.0.0.1` (or `localhost`) is a special address meaning "this computer" |
| Port number | `8188` | Which piece of software on that computer to connect to |
| Path | `/wfm` | Which page inside that software to open |

Joining these three in the form "`host:port-number/path`" gives the address of Workflow Studio.

#### What is a port number?
Many pieces of software on one computer communicate at the same time.
The **port number** is what is used to distinguish which software a communication is meant for.

To use an apartment building as an analogy, the host (`127.0.0.1`) is the "address of the building" and the port number is the "room number".
Even in the same building, if you get the room number wrong, you will not reach the person you want.

ComfyUI listens on a port number decided when it starts.
Commonly used numbers are as follows.

| Kind of ComfyUI / how it was started | Commonly used port number |
| --- | --- |
| Portable version or manual install (default settings) | 8188 |
| ComfyUI Desktop (the desktop app version) | 8000 |
| When the `--port` startup option is given | The number you specified |

If you use a launcher such as Stability Matrix, the number may also change depending on the launcher's settings.

#### Checking your own port number
The most reliable way is to **look at the address bar of the browser in which you have ComfyUI open right now**.
The number after `127.0.0.1:` or `localhost:` is the port number.

The black screen (console) shown when you start ComfyUI also displays a line such as
`To see the GUI go to: http://127.0.0.1:XXXX`.

#### Opening it by typing the address directly
If you know the port number, you can open Workflow Studio without the W button.
Just add **`/wfm`** to the end of ComfyUI's address.

- ComfyUI is open at `127.0.0.1:8188` -> Workflow Studio is at `127.0.0.1:8188/wfm`
- ComfyUI is open at `127.0.0.1:8000` -> Workflow Studio is at `127.0.0.1:8000/wfm`

If you use it often, bookmarking this address is handy.

> **Caution**
> When you open it from a bookmark, "Send to Canvas", which sends a workflow directly to ComfyUI's canvas, cannot be used.
> Instead, that workflow appears in ComfyUI's side panel (the WS Library), and you drag it onto the canvas yourself (Chapters 4 and 9).
> If you use it while going back and forth with the ComfyUI screen, opening it from the W button is recommended.

> **Tip**
> Workflow Studio runs as a part of ComfyUI, so it uses the same port number as ComfyUI.
> There is no port number dedicated to Workflow Studio.

---

## 2-5 Changing the display language

Workflow Studio is displayed in **English** at first. You can switch it to Japanese or Chinese as follows.

1. Open **"Settings"** from the tabs at the top.
2. In the **"UI Language"** field, choose the language you want.

3. After a notice that the language was changed, the page reloads automatically and switches to the new display language.

If you switch to Japanese, the tab names change as follows (some stay in English).

| English display | Japanese display |
| --- | --- |
| Workflow | ワークフロー |
| GenerateUI | 生成UI |
| Gallery | ギャラリー |
| Prompt | プロンプト |
| Models | モデル |
| Nodes | ノード |
| Settings | 設定 |
| Help | ヘルプ |
| AI TOOL / Tagger / Image Edit / Video | (stay in English) |

> **Tip**
> The language setting is saved **per browser** you use.
> If you open it from another browser or another computer, set it again.

The **"Summary Language"** field in the same place is the language used when AI creates descriptions of workflows (Chapter 10). You do not need to change it for now.

---

## 2-6 Folder locations in each environment

There are several ways to install ComfyUI. Depending on how it was installed, the folder locations differ slightly.
In this book, folder locations are written in a form **starting from `ComfyUI/`**.
Read it as the "place that corresponds to `ComfyUI/`" in the table below, to match your environment.

### How this book writes it, and where it is in each environment
| Notation in this book | Contents | Portable version | ComfyUI Desktop | Stability Matrix |
| --- | --- | --- | --- | --- |
| `ComfyUI/` | ComfyUI's main folder | `ComfyUI_windows_portable/ComfyUI/` | The folder you chose at install time (by default `ComfyUI` inside "Documents") | `(data folder)/Packages/ComfyUI/` |
| `ComfyUI/custom_nodes/` | Custom nodes (Workflow Studio too) | `ComfyUI/custom_nodes/` | `ComfyUI/custom_nodes/` | `ComfyUI/custom_nodes/` |
| `ComfyUI/models/` | Models | `ComfyUI/models/` | `ComfyUI/models/` | `(data folder)/Models/` (shared by all packages) |
| `ComfyUI/output/` | Generated images | `ComfyUI/output/` | `ComfyUI/output/` | `(data folder)/Images/` |
| `ComfyUI/user/default/workflows/` | Saved workflows | `ComfyUI/user/default/workflows/` | `ComfyUI/user/default/workflows/` | `ComfyUI/user/default/workflows/` |
| ComfyUI's Python | Where extra packages are installed | `ComfyUI_windows_portable/python_embeded/python.exe` | `ComfyUI/.venv/Scripts/python.exe` | `ComfyUI/venv/Scripts/python.exe` |
| Default port number | See 2-4 | 8188 | 8000 | 8188 |

> **Tip**
> `ComfyUI/` in the table refers to the "place that corresponds to `ComfyUI/`" in each environment.
> On Windows, path separators are shown as `\` instead of `/`.

### Portable version
Everything is inside the `ComfyUI_windows_portable` folder created by extracting the downloaded ZIP file.
You launch it with `run_nvidia_gpu.bat` or similar inside the folder.
For **Python**, you use the one inside the `python_embeded` folder dedicated to ComfyUI (Chapter 11, section 11-2).

### ComfyUI Desktop
This is the app version installed with an installer. At first launch, you choose the folder in which to put data.
If you forget where the folder is, you can check it with the app's menu item that opens the folder ("Open Folder" or similar).
The default port number is **8000**, so be careful when typing the address directly (2-4).

### Stability Matrix
This is a launcher that manages several image-generation programs together.
Inside the **data folder** you chose first (for example `StabilityMatrix/Data/`), things are separated as follows.

- **ComfyUI itself** - `Data/Packages/ComfyUI/`
- **Models** - folders by type inside `Data/Models/` (`StableDiffusion` for Checkpoints, `Lora` for LoRAs, and so on). They are shared with other programs
- **Generated images** - inside `Data/Images/`

> **Caution**
> In Stability Matrix, the folders for models and images are **outside ComfyUI's main folder**.
> Where this book says "put it in `ComfyUI/models/checkpoints`", put it in Stability Matrix's shared model folder (such as `Data/Models/StableDiffusion`).
> If images do not appear in the Gallery, check that the "Gallery Output Folder" in the Settings tab points inside `Data/Images/`.

> **Tip**
> Folder names and structure can change with each program's version updates.
> If you cannot find something, also check each program's official documentation.

---

## 2-7 If it does not start properly

### The W button does not appear
- **Did you restart ComfyUI?** Reloading the browser alone does not take effect.
- **Is the install location correct?** Check that the folder exists at `ComfyUI/custom_nodes/ComfyUI-Workflow-Studio`.
  If there is another folder with the same name inside it (a doubled folder), it will not be loaded.
- **Is your ComfyUI version old?** Try updating the main program from ComfyUI Manager or similar.

### The page does not open, or "cannot connect" is shown
- **Is ComfyUI running?** Workflow Studio runs inside ComfyUI, so you cannot open it if you quit ComfyUI.
- **Is the port number right?** Check ComfyUI's port number using the method in 2-4.
  For example, if you use ComfyUI Desktop but type `8188`, it will not connect.

### An error appears in the console at startup
Check whether the black screen shown when you start ComfyUI displays any error about `ComfyUI-Workflow-Studio`.
Noting the content of the error will help with the troubleshooting in Chapter 12, and when asking questions on GitHub.

> **Summary of this chapter**
> - The easy way to install is to search for "Workflow Studio" in ComfyUI Manager
> - Always restart ComfyUI after installing
> - Open it with the "W" button in the top menu (Shift + click for a separate window)
> - The address is "host:port-number/wfm". You can check the port number in the address bar where ComfyUI is open
> - Switch the language in the Settings tab with "UI Language"
> - Folder locations differ by environment (portable version, Desktop, Stability Matrix). Read `ComfyUI/` in this book accordingly

---

# Chapter 3 Reading the Screens

Workflow Studio has many tabs, but you do not need to memorize all of them from the start.
In this chapter you will get a rough idea of "what each tab is for",
and check the roles of the buttons and the side panel added to the ComfyUI side.

---

## 3-1 The tabs and their roles

When you open Workflow Studio, tabs are lined up in a row across the top of the screen.

From the left, there are the following tabs.
It is enough to learn the tabs marked with a star under "Often used" first.

| Tab | What it is for | Often used | Chapter in this book |
| --- | --- | :---: | --- |
| Workflow | Listing and organizing saved workflows | * | Chapter 4 |
| Nodes | Listing nodes and registering favorites | | Chapter 11 |
| Models | Listing and organizing models such as Checkpoints and LoRAs | * | Chapter 6 |
| GenerateUI | Generating images without touching the node screen | * | Chapter 5 |
| Prompt | Saving and sorting prompts, AI assistance | * | Chapter 7 |
| Gallery | Browsing generated images, checking their settings | * | Chapter 8 |
| Image Edit | Simple image editing, making masks | | Chapter 11 |
| Video | Video generation and video editing | | Chapter 11 |
| Tagger | Automatically generating tags (prompts) from images | | Chapter 11 |
| Settings | Language, theme, folders and other settings | | This chapter, Chapter 11 |
| Help | Feature list, shortcuts, troubleshooting | | This chapter |
| AI TOOL | Translation, chat and image analysis with local AI | | Chapter 10 |

### Think of the tabs in three groups: "organize", "create" and "support"
If the number of tabs makes you lose your way, it helps to think of them in these three groups.

- **Organize** - Workflow / Nodes / Models / Prompt / Gallery
  Tabs that list your materials so they are easy to find.
- **Create** - GenerateUI / Image Edit / Video
  Tabs for actually making images and videos, or touching them up.
- **Support** - AI TOOL / Tagger / Settings / Help
  Tabs that help with work in other tabs, or hold overall settings.

> **Tip**
> The tabs are connected to each other.
> For example, you can load a workflow picked in the Workflow tab into GenerateUI,
> or recall a prompt saved in the Prompt tab from GenerateUI.

### The Help tab
The first thing to open when in trouble is the **Help** tab.
A list of topics is lined up on the left, and clicking one shows the explanation on the right.

- The feature list (an overview of each tab's features)
- Keyboard shortcuts
- Troubleshooting
- Support (links to GitHub and so on)

It is also useful when, reading this book, you wonder "what was this button?".

---

## 3-2 Buttons added to the ComfyUI side

When you install Workflow Studio, **three buttons** are added to the menu at the top of ComfyUI's screen.

| Button | Name | Role |
| --- | --- | --- |
| 1. W | Open Workflow Studio | Opens Workflow Studio in a new tab. Shift + click opens a new window (Chapter 2) |
| 2. Camera | Canvas snapshot | Saves the current node screen as an image and makes it the workflow's thumbnail (Chapter 4) |
| 3. An icon of lined-up squares | WS Library | Opens and closes a side panel beside the node screen (3-3) |

When you hover the mouse over a button, a description is shown.

> **Tip**
> The main part of Workflow Studio (the screen with the row of tabs) and ComfyUI's node screen open in **separate browser tabs**.
> The basic style is to use the two screens back and forth: "organizing and generating in Workflow Studio",
> "detailed building on ComfyUI's node screen".

---

## 3-3 The side panel "WS Library"

When you press button 3, a panel called the **WS Library (Workflow Studio Library)** opens beside ComfyUI's node screen.

The WS Library is **a shelf for using the materials you organized in Workflow Studio right away on the node screen**.
Single-letter tabs are lined up at the top of the panel (hover the mouse over one to see its proper name).

| Tab | Name | What you can do |
| --- | --- | --- |
| W | Workflows | Drag a workflow to load it onto the canvas |
| N | Nodes | Place favorite nodes and node sets on the canvas |
| P | Prompts | Place or copy saved prompts onto the canvas |
| M | Models | Drag a model to place it onto the canvas together with a loader node |
| I | Information | Drop an image or workflow file to inspect its contents (the models and prompts used) |
| A | AI TOOL | Use AI features such as translation and chat while staying on the node screen |

For example, when you drag a model from the M tab onto the canvas, a node that loads that model is placed automatically.
It saves the trouble of finding a node in a list, placing it, choosing the file name, and so on.

Chapter 9 explains how to use it in detail. For now, it is enough to remember only that "you can bring out a shelf of materials beside the node screen".

---

## 3-4 Theme and appearance settings

The look of Workflow Studio can be changed to your liking in the **Settings** tab.
Because it is a tool you use for long periods, a color scheme that is easy on the eyes and a readable text size are recommended.

### Theme
From the **"Theme"** field you can choose the color scheme of the whole screen. The default is the dark scheme "Deep Ocean Dark".

| Example theme | Feel |
| --- | --- |
| Deep Ocean Dark (default) | Dark blue. Images are easy to see |
| Light Minimalist (clean) | White-based, bright and simple |
| Pastel Dream (pastel) | Soft pastel tones |
| Corporate Trust (for business) | Calm white and blue |

Besides these, there are 13 themes in all, including pop, cyberpunk and retro.

> **Tip**
> When checking the colors of generated images, a darker theme makes colors easier to tell apart.
> If you can't decide, try using the default for now.

### Customize
Opening **"Customize"** lets you fine-tune the chosen theme further.

- **Color Override** - change colors such as background, text and accent individually
- **Background Pattern** - add patterns such as stripes or dots to the background
- **Font** - change the typeface (Japanese fonts such as Zen Maru Gothic and BIZ UDPGothic can also be chosen)

When you finish adjusting, press **"Apply & Save"**.
To go back, press **"Reset Customization"**.

### Text Size
With the **"Text Size"** field you can change the size of the text across the whole screen.
If the text feels too small to read, make it bigger here.

### The look of the WS Library
The colors of the WS Library (3-3) can be set separately from the **gear button** inside the panel.
You can adjust the background and text colors to match the colors of the ComfyUI screen.

> **Summary of this chapter**
> - Thinking of the tabs in three groups, "organize", "create" and "support", makes them easy to follow
> - For now, it is enough to learn five: Workflow, Models, GenerateUI, Prompt and Gallery
> - Three buttons, "W", "camera" and "WS Library", are added to the top of ComfyUI
> - The WS Library is a shelf of materials you can bring out beside the node screen
> - The look can be adjusted with the Settings tab's Theme, Customize and Text Size

---

# Chapter 4 The Workflow Tab - Organizing the Workflows You Made

The Workflow tab is the first thing shown when you open Workflow Studio, a kind of "front door".
In this chapter you will learn how to make the workflows you already have viewable as a list,
and how to organize them so they are easy to find later.

---

## 4-1 How workflows are listed automatically

When you open the Workflow tab, some workflows may already be lined up.
This is because Workflow Studio automatically reads ComfyUI's workflow save folder.

A workflow you "Save" on ComfyUI's node screen is normally saved in the following folder.

```
ComfyUI/user/default/workflows/
```

Workflow Studio lists the workflows inside this folder.
In other words, **workflows saved in ComfyUI line up in the Workflow tab without your doing anything**.

> **Tip**
> If a workflow you just saved in ComfyUI does not appear in the list,
> press the **"Refresh"** button on the toolbar. It reloads to the latest state.

> **Tip**
> The folder that is read can be changed with the **"Workflow Data Folder"** setting in the Settings tab.
> Unless you have a reason, leaving it as it is causes no problem.

---

## 4-2 Reading the screen and switching the display

The Workflow tab is divided into three main parts.

| No. | Place | Role |
| --- | --- | --- |
| 1 | Toolbar (top) | Search, filtering, sorting, various buttons |
| 2 | List (center) | Workflows lined up as cards or in a table |
| 3 | Side panel (right) | Shows the thumbnail and contents of the selected workflow |

### Thumbnail view and table view
With the switch buttons on the toolbar you can change how the list is displayed.

- **Thumbnail** - lines them up as cards with images. Handy when you want to find things by how they look.
- **Table** - lines them up in a table. Handy when you want to find one among many workflows by name.

### Click and double-click
Workflows in the list behave differently depending on how you click.

| Operation | What happens |
| --- | --- |
| Click | Shows the contents in the right-hand side panel (the workflow becomes "selected") |
| Double-click | Opens the detail screen (editing badges, tags and memo; explained in 4-4) |

### The side panel
When you click a workflow, the following three tabs appear in the right-hand side panel.

- **Thumbnail** - shows the workflow's image large
- **JSON** - shows the contents (JSON data) of the workflow with color coding. The "Copy" button copies it all
- **Groups** - sorts the workflow into groups (explained in 4-4)

Below the workflow name, the **format of the workflow** (UI format, API format and so on) and
the **check result** of whether it can be used in GenerateUI are shown (explained in 4-7).

---

## 4-3 Taking a thumbnail with the camera button

A workflow that you only saved in ComfyUI has no thumbnail image, and can be hard to tell apart in the list.
That is where the **camera button** (canvas snapshot) added to ComfyUI's top menu comes in.

### How to take a thumbnail
1. On ComfyUI's node screen, open the workflow you want to make a thumbnail of.
2. Adjust the screen position and zoom so that the whole workflow is easy to see.
3. Click the **camera button** in the top menu.

4. A screen for confirming the name to save appears. Change the name if you wish and save.
   (At first, the name of the workflow currently open is filled in)
5. When "Workflow saved" is shown, you are done.

When you open the Workflow tab of Workflow Studio (or press "Refresh"),
the workflow appears in the list with the image you took attached as its thumbnail.

> **Tip**
> The image (PNG) saved with the camera button also has the workflow information embedded in it.
> If you drag and drop this image onto ComfyUI's node screen, you can load that workflow.
> A single image file carries both the "look" and the "contents", which is handy.

### Changing a thumbnail later
To replace the thumbnail of an existing workflow,
double-click the workflow to open the detail screen, press **"Change Thumbnail"** and choose an image.

---

## 4-4 Sorting with favorites, badges and groups

As workflows increase, sorting them lets you find what you want right away.
Workflow Studio has three ways to sort.

| Method | When to use it | Example |
| --- | --- | --- |
| Favorites (star) | You want to mark the ones you use often | The basic workflow you use every day |
| Badges | You want to tell kinds apart at a glance with colored labels | "SDXL", "FLUX", "Video", "Experimenting" |
| Groups | You want to gather them by purpose or project | "Character work", "Background materials" |

### Favorites (star)
Click the **star** on a card to register it as a favorite.
Press the **star** button at the top of the toolbar to show only favorites (**ALL** returns to showing everything).

Workflows registered as favorites also appear under
"Favorites" in ComfyUI's side panel (the WS Library) (Chapter 9).

### Badges
A badge is a **colored label** you attach to a workflow.
You can also attach several badges to one workflow.

**1. Make a badge**
1. Press the **"Badge"** button on the toolbar.
2. Type a name in the **"Badge label..."** field and press **"Add"**.
3. Click a color swatch to change the badge's color.

**2. Attach a badge to a workflow**
1. Double-click the workflow to open the detail screen.
2. In the **"Badges"** field, tick the badges you want to attach.
3. Press **"Save"**.

**3. Filter by badge**
Once you have made badges, they line up next to the star and ALL buttons at the top of the toolbar.
Click a badge to show only the workflows that have that badge.

> **Tip**
> The kinds and colors of badges are shared with the Models tab (Chapter 6).
> If you make a badge called "SDXL", you can attach it in the same color to both workflows and models.

### Groups
A group is **a box for gathering workflows by purpose**.

1. Click a workflow to select it.
2. In the right-hand side panel, open the **"Groups"** tab.
3. Make a group with **"Create New Group"**, or pick an existing group and **"Add to Group"**.

If you choose a group from the pull-down labeled **"All Groups"** on the toolbar, only the workflows in that group are shown.

### Tags and memo
On the detail screen you can also write the following.

- **Tags** - keywords for searching. You can enter several, separated by commas (,).
- **Memo** - free notes, such as cautions on how to use it or settings that worked well.

If you note the "source" and the "required custom nodes" for a workflow you got online, you will not be in trouble later.

### Renaming and deleting
- **Rename** - click the workflow name at the top of the detail screen to edit it.
- **Delete** - press the **"Delete"** button on the detail screen.

> **Caution**
> Deleting removes the file itself in ComfyUI's workflow save folder (including the thumbnail image).
> For workflows that matter, back them up somewhere else before deleting.

---

## 4-5 Search, sorting and clearing filters

### Search
Type a keyword in the **"Search..."** box on the toolbar, and only workflows whose name, tags and so on match are shown.
Pressing the **x** at the right end of the box clears the search text immediately.

### Sorting
With the pull-down next to the search box you can change the order.

| Choice | Order |
| --- | --- |
| Date (Newest) | Newest first |
| Date (Oldest) | Oldest first |
| Name A-Z | Ascending by name |
| Name Z-A | Descending by name |

The order you choose is remembered, and the same order is used the next time you open it.

### Clearing filters all at once
While narrowing down by search, group and badge, you may wonder "why doesn't it show up in the list?".
In that case, press **"x Clear"** at the right end of the toolbar.
The search text, group and badge filters are all cleared at once, and every workflow is shown.

---

## 4-6 Importing, and sending to the canvas

### Bringing in workflows (import)
Workflow files you got online (`.json`, or `.png` containing a workflow)
can be brought into the Workflow tab in either of these ways.

- Press the **"Import"** button on the toolbar and choose files (you can select several)
- **Drag and drop** the files onto the list area of the Workflow tab

Imported workflows are saved in ComfyUI's workflow save folder and added to the list.

### Using the selected workflow
When you click a workflow to select it, the following three buttons on the toolbar become pressable.

| Button | What happens |
| --- | --- |
| Load in GenerateUI | Loads it into the GenerateUI tab so you can generate without touching the node screen (Chapter 5) |
| Load in Video | Loads a workflow for video generation into the Video tab (Chapter 11) |
| Send to Canvas | Loads the workflow onto ComfyUI's node screen |

> **Tip**
> If a button cannot be pressed (it is gray), you have not yet selected a workflow.
> Click a workflow in the list once, then press it.

When you press **"Send to Canvas"**, that workflow is loaded onto the node screen of the ComfyUI from which you opened Workflow Studio.
You can use it like this: find in Workflow Studio, edit in detail in ComfyUI.

> **Caution**
> "Send to Canvas" works in Workflow Studio **opened from ComfyUI's W button**.
> If you opened it directly, for example from a bookmark, that workflow appears in the WS Library on the ComfyUI side,
> so drag it onto the canvas from there (Chapters 2 and 9).

---

## 4-7 Checking in advance whether it works in GenerateUI (GenerateUI Check)

Not every workflow can be used as it is in GenerateUI (Chapter 5).
If it uses special custom nodes, or specifies models you do not have, it may not work well.

So before you load one into GenerateUI, there is a feature that automatically checks whether it looks usable.

### Reading the check result
When you click a workflow, the following information appears below the workflow name in the side panel.

- **Format badge** - the workflow's save format (UI format / API format / App format)
- **Convert** - whether it can be converted into a form GenerateUI can use
- **Operability** - how many of the settings can be changed on the GenerateUI screen alone

Each is shown in one of three levels.

| Display | Meaning |
| --- | --- |
| Check mark | No problem |
| Warning mark | Usable, but needs care |
| Cross mark | Cannot be used in GenerateUI, or is hard to use |

Hovering the mouse over a badge shows the reason for the judgment.

### Common judgments and what to do
| Judgment | Common reason | What to do |
| --- | --- | --- |
| Convert: cross | The custom nodes the workflow needs are not installed | Install the missing nodes with ComfyUI Manager (Chapter 12) |
| Convert: warning | The specified model or LoRA is not on your computer | Choose a model you have in GenerateUI. For UI-format workflows, note that it is automatically replaced with the first model in the list |
| Operability: warning / cross | Many settings are not shown in GenerateUI | Change settings of nodes that are not shown on ComfyUI's node screen |

> **Tip**
> Operability is "the share of nodes that have settings which are shown in GenerateUI".
> It is a check mark at 80% or more, a warning at 50% or more, and a cross below that.
> Even with a warning or cross, generation itself is often possible, so treat it as a rough indication of "hard to finish using GenerateUI alone".

> **Tip**
> The check fetches from ComfyUI only the information of the nodes that workflow uses (v0.8.8 and later).
> It used to take tens of seconds the first time, but now the result appears almost instantly.
> From the second time on, results appear immediately.

---

## 4-8 Trying the bundled sample workflows

Workflow Studio comes with sample workflows you can try right away.
The samples are in the **`workflows`** folder inside the folder where you installed Workflow Studio.

```
ComfyUI/custom_nodes/ComfyUI-Workflow-Studio/workflows/
```

Each sample has a `.json` (the workflow itself) and a `.png` (the thumbnail image) of the same name.

### Samples recommended for beginners
| File name | Contents |
| --- | --- |
| `ws_sdxl_t2i_basic` | A basic workflow that makes images from text with an SDXL model |
| `ws_sd15_t2i_basic` | A basic workflow that makes images from text with an SD1.5 model |

Choose according to the kind of model you have (SDXL or SD1.5).

### Importing a sample
1. Press **"Import"** in the Workflow tab.
2. Open the `workflows` folder above and choose the `.png` file of the sample you want to use.
   (If you choose the `.png`, it is imported with its thumbnail)
3. Check that it has been added to the list.

There are also more advanced samples, such as pose specification and inpainting (redrawing part of an image).

> **Caution**
> Some samples require additional custom nodes.
> If any nodes are shown in red on the node screen, install the missing nodes with ComfyUI Manager (Chapter 12).
> The "Convert: cross" shown in the GenerateUI Check of 4-7 is also mostly this case.

In the next chapter, you load the basic sample you just imported into GenerateUI and finally generate your first image.

> **Summary of this chapter**
> - Workflows saved in ComfyUI line up automatically in the Workflow tab
> - Click to show in the side panel; double-click for the detail screen
> - With the camera button you can give a workflow a thumbnail that is easy to recognize
> - Sort with favorites, badges and groups, and find with search and sorting. If lost, use "x Clear"
> - With "Load in GenerateUI" and "Send to Canvas" you can use the selected workflow right away
> - The GenerateUI Check lets you confirm in advance whether it works in GenerateUI

---

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
> From v0.8.7, if you have exactly one model with the same file name that differs only in its folder, it is replaced with that model instead of the first one.
> (Official templates often save model names without a folder, and the old behavior could swap in an unrelated model.)
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

---

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
2. Edit the prompt in the **Prompt** subtab and press **Apply**.
3. To use reference images, specify them on the image cards in the **Image** subtab.
4. Press **Generate**.

> **Tip**
> You can also run it from ComfyUI's own screen while logged in. In that case you do not need the `.env` setting.

---

## 5-9 More workflows are supported (v0.8.4 and later)

The workflows you can use in GenerateUI have increased as follows. They are used the same way as other workflows.

- **Qwen Image 2.1 Turbo** - ComfyUI's official templates for text to image (T2I) and image to image (I2I). Edits also carry over to the prompt enhancer's input (the feature that expands your prompt automatically).
- **Flux.3 Klein** - the four official templates (T2I and Image Edit, for Klein and Klein SD).
- **MOSS-Image** - Base/SFT T2I, and the bounding-box versions that specify positions with frames.
- **Native LoRA stack** - ComfyUI v0.40's nodes that load several LoRAs at once (LoadLoraModel / LoadLoraTextEncoder). Apply, bypass and the Metadata display are supported.

> **Caution**
> The native LoRA stack nodes are supported **only in API-format workflows**.
> ComfyUI's own screen cannot yet add rows to this node, so UI-format workflows are not covered.

> **Tip**
> The Metadata tab and the side panel's **I** tab can also read images made with Nano Banana (v0.8.5 and later).
> The prompt appears as one whole entry, not split into Positive/Negative.

> **Summary of this chapter (second half)**
> - With the Batch subtab, you can generate in bulk while changing the model, prompt, sampler and so on, one kind at a time
> - Choose the kind with the Batch Queue column checkbox and start with Generate. Turn the check off when done
> - Feeder is a feature that feeds many images one at a time into a workflow. A dedicated node is required
> - Lab is an advanced feature that can switch several settings at separate timings
> - Partner API nodes (Nano Banana and others) run once `COMFY_API_KEY` is set in `.env`. They consume credits

---

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

---

# Chapter 7 The Prompt Tab - Collecting and Growing Your Spells

A prompt that worked well is your own treasure.
But if you only paste it into a notepad, you can easily lose track of which was which.

The **Prompt** tab is a place to **save, sort and reuse** prompts.
In addition, you can use translation with local AI, and "wildcards" that change the prompt a little each time.

---

## 7-1 Prompt basics

Before getting into how to use the Prompt tab, let's cover the basics of writing prompts.

### Positive and negative
| Kind | What to write | Example |
| --- | --- | --- |
| Positive Prompt | What you want drawn | `1girl, smiling, school uniform, cherry blossoms, spring` |
| Negative Prompt | What you do not want drawn | `low quality, blurry, extra fingers, watermark` |

### Tips for writing
- **Write in English** - most models were trained on English.
- **Separate with commas (,)** - it is common to line up words and short phrases separated by commas.
- **Put important things first** - words written earlier tend to be reflected more strongly.
- **Emphasize words with (word:number)** - writing `(red hair:1.3)` emphasizes that word (1.0 is the default).

> **Tip: change the emphasis number from the keyboard**
> In the prompt field of GenerateUI, select the word to emphasize and press **Ctrl + Up/Down**
> to raise or lower the number in `(word:number)` by 0.05. When the number returns to 1.0, the parentheses are removed automatically.

> **Tip**
> Anime-style SDXL models suit "lining up tags", and newer models such as FLUX suit "describing in ordinary English sentences".
> The model's distribution page often lists a recommended way of writing, so check it.

---

## 7-2 The Prompt tab screen

The Prompt tab is divided into three columns: left, center and right.

| Column | Name | Role |
| --- | --- | --- |
| Left | AI Assistant | Chat and translation with local AI (7-5) |
| Center | Presets / Preset Manager | Saving, listing and sorting prompts (7-3) |
| Right | Wildcard / Style | Managing wildcards and styles (7-4) |

With **Form / Table** at the top of the screen, you can switch how things are displayed.

- **Form** - a screen for editing one item at a time (the screen this chapter explains)
- **Table** - a screen for editing presets and wildcards together in a table (handy when the count grows)

---

## 7-3 Saving and sorting as presets

A **preset** is a pair of positive and negative prompts saved together under a name.

### Saving a preset
1. In the center column, open the **Presets** tab.
2. Check that the topmost pull-down shows **New Preset (none selected)**.
3. Fill in the following items.

   | Item | Contents |
   | --- | --- |
   | Preset Name | The name of the preset (for example `Sakura and uniform`) |
   | Category | A classification (for example `Portrait`, `Landscape`). May be omitted |
   | Positive Prompt | What you want drawn |
   | Negative Prompt | What you do not want drawn |

4. Press **Save**. When a message says the preset was saved, you are done.

> **Tip**
> Get into the habit of saving prompts you tried in GenerateUI and thought "this is good!" as presets on the spot.
> Later, when you want to make an image with the same feel, you can recall it right away.

### Recalling and using a preset
1. From the topmost pull-down, choose the preset you want to use.
2. Press a button according to how you want to use it.

| Button | What it does |
| --- | --- |
| GenUI Set | Sets both the positive and negative into the prompt fields of GenerateUI at once |
| PP Copy | Copies the positive prompt |
| NP Copy | Copies the negative prompt |

> **Caution**
> **GenUI Set** can be used while a workflow is loaded in GenerateUI.
> Load a workflow first, using the steps in Chapter 5.

### Sorting with groups
Presets can also be sorted into groups.

1. With a preset selected, press **+ Group** to make a new group.
2. Choose a group from **Select group...** and press **Add to Group**.

A group can also be deleted (**Del Group**).

Groups made here can be used as "Prompt" groups in GenerateUI batch generation (Chapter 5, section 5-5).
For example, if you put spring, summer, autumn and winter presets in a group called "Seasons series",
you can generate the pictures of all four seasons in bulk.

### Listing with Preset Manager
In the **Preset Manager** tab of the center column, you can see the saved presets as a list.

- **All** - all presets
- **Star** - presets registered as favorites
- **Groups** - shown by group

With the **Search presets...** box at the top, you can search presets.

Saved presets are also shown in the **P (Prompts)** tab of the **WS Library** beside ComfyUI's node screen,
and can be dragged onto the canvas for use (Chapter 9).

---

## 7-4 Wildcards and styles

In the right column, you manage **wildcards**, which change the prompt automatically,
and **styles**, which add a mood to the prompt.
Switch with **Wildcard / Style** at the top of the column.

### What is a wildcard?
A wildcard is a mechanism that **randomly swaps out a part of the prompt every time you generate**.
With the same prompt, you can make many images with variation.

The easiest way in Workflow Studio is to use a **wildcard file**.
Make a file listing candidates, and when you write `__filename__` in the prompt,
one line from the file is chosen at random every time you generate.

### Making a wildcard file
As an example, let's make a file called `colors` containing candidate colors.

1. In the right column, choose **Wildcard** and press **+ New** under **Wildcard Files**.
2. Enter a file name (for example `colors`) and choose **txt** as the format.
3. Enter one candidate per line.

   ```
   red
   blue
   green
   golden
   ```

4. Press **Save**.

### Using a wildcard
In the prompt, write the file name enclosed in `__` (two underscores).

```
1girl, __colors__ dress, standing in a garden
```

Each time you generate in GenerateUI, the `__colors__` part is replaced with one of `red`, `blue`, `green` or `golden`.

> **Tip**
> Instead of typing `__colors__` by hand, you can also choose a file with the **File** button in the right column and insert it.

### More advanced notation (for Impact Pack)
At the top of the right column there are also buttons that insert symbols such as `{ }`, `$$` and `[ ]`.
These are for notations like the following.

- `{cat|dog|rabbit}` - choose one out of the three
- `{2$$cat|dog|bird}` - choose two out of the three

> **Caution**
> What GenerateUI expands automatically is only the `__filename__` notation.
> To use notations such as `{A|B}`, you need to put the wildcard node of the custom node **ComfyUI-Impact-Pack**
> (ImpactWildcardProcessor and so on) in the workflow.
> Until you are used to it, using only the `__filename__` notation is enough.

### Sending the prompt you built
The prompt you built in the right column can be sent out with the buttons below.

- **-> Pos** - send to the preset's Positive Prompt
- **-> Neg** - send to the preset's Negative Prompt
- **Copy** - copy it

The `__filename__` parts are expanded automatically when you generate in GenerateUI.

### Styles
A **style** is a "mood template" added to the prompt.
For example, the "cinematic" style has contents registered such as `cinematic still, {prompt}, dramatic lighting`.
Your own prompt goes into the `{prompt}` part.

To use a style, in the top bar of GenerateUI, turn on the **Style** checkbox and choose a style from the pull-down.
When you generate, the chosen style is combined into the prompt automatically (the workflow itself is not rewritten).

Many styles come with Workflow Studio.
In **Style** of the Prompt tab, you can look at the list of styles and make your own with **+ New**.

> **Tip**
> To see what mood each style gives, it helps to use **Create Catalog** in GenerateUI to make sample images for each style in bulk.
> The samples you make can be listed in the Style_Catalog of the Gallery tab (Chapter 8).

---

## 7-5 Getting AI to help with translation and prompt making

In the **AI Assistant** in the left column, you can have AI running on your computer (local AI) help you make prompts.

> **What you need in advance**
> To use this feature, you need local AI software such as **Ollama** or **LM Studio**, and an AI model prepared.
> How to prepare is explained in Chapter 10. If it is not ready, **Disconnected** is shown at the top of the AI Assistant.

### Translating your language into English
Even if you are not good at English prompts, it is fine.

1. In the input box at the bottom of the left column, write in your language what you want drawn.

   ```
   A girl in a school uniform smiling under a cherry tree, soft spring light
   ```

2. Press the **JA->EN** button under **Translate:** (choose the languages to suit your text).
3. The translated result is shown in the chat area.

With the buttons shown below the translation result, you can use the result.

| Button | What it does |
| --- | --- |
| Apply to GenerateUI | Puts it into the positive prompt field of GenerateUI |
| Copy | Copies it (for pasting into a preset and so on) |

When you want to know the meaning of an English prompt, you can conversely translate it with **EN->JA**.

### Making prompts while consulting the AI
Write a question in the input box and press **Send** (or the Enter key) to chat with the AI.

- "Make a prompt for a sunset seaside scene, in English tag format"
- "Add a more fantastical mood to this prompt"

If you ask like this, it offers draft prompts.
If you are using an AI model that can read images, you can attach an image with **Attach Image**
and ask "turn the mood of this image into a prompt".

- **Shift + Enter** - line break
- **Clear Chat** - reset the conversation
- **Gear button** - settings for which AI software and model to use (Chapter 10)

> **Caution**
> A local AI's answers are not always correct.
> Adjust the prompts that come out while actually generating to check them.

> **Summary of this chapter**
> - Prompts are basically English and comma-separated. Emphasis is `(word:number)`
> - Save prompts that worked as presets with a name
> - With "GenUI Set", you can set a preset into GenerateUI right away
> - If you sort them into groups, you can try them in bulk with batch generation
> - Make a wildcard file and write `__filename__` to make the prompt vary with each generation
> - If you prepare local AI, you can translate and consult about prompts

---

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

---

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

---

# Chapter 10 AI TOOL - Making Local AI Your Assistant

Workflow Studio can work together with **local AI (large language models)** running inside your computer.
If you prepare local AI, you can do things like the following.

- Translate what you thought up in your own language into an English prompt
- Chat with the AI and have it come up with prompt ideas
- Show it an image and have it make a description, prompt or tags for that image
- Have it make candidate lists for wildcards

Because it runs inside your own computer rather than as a service on the internet,
a big feature is that **what you type and the images you use are not sent outside**.

> **Tip**
> AI features are "nice to have" features. Even if you do not use them, all of Workflow Studio's basic features are available.
> If your computer has room to spare (especially GPU memory), please give them a try.

---

## 10-1 Preparing local AI software

### Supported software
Workflow Studio supports the following four pieces of local AI software.

| Software | Characteristics | Default address |
| --- | --- | --- |
| **Ollama** | The standard. Easy from downloading models to running them | `http://localhost:11434` |
| **LM Studio** | Operated from a screen. You can also look for models inside the app | `http://localhost:1234` |
| Lemonade Server | Easy to run on AMD GPUs and NPUs | `http://localhost:13305` |
| Unsloth | Requires extra setup such as an API key (for advanced users) | `http://localhost:8888` |

For beginners, **Ollama** is recommended. This chapter explains using Ollama as the example.

> **Tip**
> `localhost` in the address means "this computer", and the number after it is the **port number** (Chapter 2, section 2-4).
> Just like ComfyUI, AI software also listens on its own fixed port number.

### Preparing Ollama
1. From Ollama's official site, download the installer for your OS and install it.
2. Start Ollama (on Windows it starts automatically after installation and stays resident in the taskbar's notification area).
3. Download the AI model you will use. In Command Prompt or similar, type the following.

   ```
   ollama pull (model name)
   ```

   Model names can be checked in the model list on Ollama's official site.

> **Guide to choosing a model**
> - **You also want the image-reading feature (VLM)** -> choose a model that supports image input (vision)
>   (in the author's testing, image generation and image reading work well with Gemma 4 `e4b` and similar)
> - **GPU memory is small** -> choose a model with a small parameter count (a few B, that is a few billion)
> - If translation accuracy matters, choose a model that is good at your language
>
> The world of AI models changes quickly, so please try newer models too.

> **Caution: competing for GPU memory**
> Local AI also uses **GPU memory (VRAM)**, just like image generation.
> If you run both at the same time, memory runs short and image generation slows down or errors out.
> Countermeasures are explained in 10-3.

---

## 10-2 Using the AI TOOL tab

Open the **AI TOOL** tab of the main Workflow Studio.
The screen is divided into four parts, all shown at the same time.

| Part | What you can do |
| --- | --- |
| Translate | Translation between languages such as Japanese, English and Chinese |
| Chat | Conversation with the AI. If the conditions are met, generating images from the conversation too |
| TOOLS | Reading images (VLM), making wildcards |
| Settings | Settings for which AI software and model to use |

### First: connect to the AI software in the settings
1. In **Backend** under the settings, choose the software to use (for example Ollama).
2. Check the address under **Connection**. If you use Ollama with its defaults, no change is needed.
3. Press **Test Connection**. If it shows success, it is OK.
4. Press **Refresh** next to **Model** and choose the model to use from the list.
5. Press **Save Settings**.

> **Tip**
> The settings here are shared with the **A (AI TOOL)** tab of the WS Library on the ComfyUI side.
> On the other hand, the Prompt tab (Chapter 7) and the Tagger tab each have their own **gear button** settings.
> If "it works in the AI TOOL tab but the Prompt tab says Disconnected", set the same thing with the gear button in the Prompt tab as well.

> **If it does not connect well**
> - Check that software such as Ollama is running.
> - For LM Studio, you need to **start the server** inside the app.
> - Check that the port number in the address matches the software's settings.
> - If the model list is empty, check that the model has been downloaded.

### Translate
1. Choose the source and target languages (swap them with the **swap** button).
2. Write the text in the input box and press **Translate**.
3. **Copy** the result and paste it into GenerateUI or a preset.

> **Tip**
> Small models sometimes return the original text as it is without translating.
> In that case a message says the model returned the original text, so try another model.

### Chat
Talk in the input box and send with **Enter** (**Shift + Enter** for a line break).
It remembers the flow of the conversation, so follow-up requests such as "make it a brighter mood" also work.
**Clear** resets the conversation.

> **Tip: generating images from chat (advanced)**
> If you use a model that supports "Tool Calling",
> just asking in chat "draw a cat" generates an image with the workflow loaded in GenerateUI, and it is shown inside the chat.
> This feature can be turned on or off with the **Allow image generation** check next to the input box.

### TOOLS - reading images (VLM)
With a model that supports image input (a VLM), you can have the AI read the contents of an image.

1. Drop an image (PNG / JPG / WebP) into the **TOOLS** frame.
2. Choose a task.

   | Task | Contents |
   | --- | --- |
   | Describe | Explains in text what is in the image |
   | Create prompt | Makes a prompt for reproducing the image |
   | Create tags | Writes out the elements of the image in tag format |
   | Create wildcards | Makes candidate wildcard lists by specifying a category name and count (no image needed) |

3. Press **Run**. You can copy the result and use it.

> **Example**
> When you want to imitate the mood of an illustration you like, run "Create prompt" on that image
> and try the resulting prompt in GenerateUI - you can use it like that.

### It can be used inside the ComfyUI screen too
The same AI features can also be used in the **A** tab of the WS Library on the ComfyUI side.
Handy when you want to translate something briefly while working on the node screen.

---

## 10-3 Freeing VRAM and managing memory

As touched on in 10-1, local AI and image generation compete for GPU memory (VRAM).
Ollama keeps a model that has been used in memory for a while,
so if you generate images after using the AI, memory may run short.

### Freeing manually
Pressing **Unload Model** in the AI TOOL settings takes the AI model out of memory and frees VRAM.
(With Ollama, all loaded models are unloaded)

### Freeing automatically before generation
In **VRAM Management (Ollama)** in the Settings tab, you can set Ollama's models to be unloaded automatically just before image generation.

| Behavior before generation | What it does |
| --- | --- |
| Do nothing | Does not unload automatically |
| Unload what is needed only when free memory is below the target | Unloads only when free VRAM is less than the **Target free VRAM (GB)** |
| Unload everything every time | Always unloads everything at every generation |

> **Tip**
> If you can't decide which to choose, "Unload what is needed only when free memory is below the target" is recommended.
> For the target free VRAM, enter a rough value of the amount of memory image generation needs (it differs by the model you use).
> The **Unload all now** button can also free it immediately, on the spot.

> **Caution**
> This automatic unloading applies to Ollama only. If you use LM Studio or similar, free memory manually.

---

## 10-4 Security notes

### By default it connects only to AI on "your own computer"
For safety, the AI software Workflow Studio connects to (Ollama, LM Studio and so on) is by default limited to
**software running inside the same computer (localhost / 127.0.0.1)**.

### When you want to use AI on another computer
If you want to run Ollama on another computer on your home LAN (such as a computer with a strong GPU) and use it,
register the address of the computer you want to connect to in the environment variable **`WFS_ALLOWED_BACKEND_HOSTS`**, and restart ComfyUI.

```
WFS_ALLOWED_BACKEND_HOSTS=192.168.1.20:11434
```

If there are several, list them separated by commas (,).
How to set environment variables differs depending on how you start ComfyUI.

### If you start ComfyUI with `--listen`
If you start ComfyUI with the `--listen` option, other computers and smartphones on the same network
can also access ComfyUI (and Workflow Studio).
In that case, anyone who can access it can use your AI software and images.

> **Caution**
> Use `--listen` **only on a trusted network**, such as a home LAN.
> Do not use it in cafes or on public Wi-Fi.

> **Summary of this chapter**
> - If you prepare local AI (Ollama and so on), you can translate, chat and read images. What you type is not sent outside
> - In the AI TOOL tab's settings, choose the backend, address and model, and test the connection
> - The Prompt tab and Tagger tab have separate gear-button settings
> - AI and image generation compete for VRAM. Free it with "Unload Model" or "VRAM Management (Ollama)"
> - By default it connects only to AI on your own computer. Use `--listen` only on a trusted network

---

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

---

# Chapter 12 When You Are in Trouble (Troubleshooting / FAQ)

This chapter collects the troubles that often occur when using Workflow Studio, and how to deal with them.
When in trouble, first look in the **"symptom"** headings for the one closest to your situation.

> **Three things to try first**
> For almost any trouble, these three often solve it.
> 1. Reload the browser page (F5 key)
> 2. Press the **Refresh** button of each Workflow Studio tab
> 3. Quit ComfyUI completely and start it again

---

## 12-1 Startup and connection troubles

### The W button does not appear
| Cause | What to do |
| --- | --- |
| You did not restart ComfyUI after installing | Quit ComfyUI completely and start it again (reloading the browser alone does not take effect) |
| The folder is in the wrong place | Check that the folder exists at `ComfyUI/custom_nodes/ComfyUI-Workflow-Studio`. Also check that the folder is not doubled |
| ComfyUI is old | Update ComfyUI itself |

### The Workflow Studio page does not open
- Is ComfyUI running? Workflow Studio runs inside ComfyUI, so you cannot open it if you quit ComfyUI.
- Is the **port number** in the address right? You can check it in the address bar of the browser where ComfyUI is open (Chapter 2, section 2-4).

### GenerateUI shows "Disconnected"
1. Check that ComfyUI is running and that you can generate an image on ComfyUI's screen.
2. Press **Connect** at the top of GenerateUI.
3. If it still does not connect, reload the browser page.

### You updated but the behavior did not change
After updating Workflow Studio, always restart ComfyUI.
If it still behaves the old way, the browser cache may remain.
Try **Ctrl + F5** (forced reload).

---

## 12-2 Workflow troubles

### Workflows do not appear in the list
| Cause | What to do |
| --- | --- |
| The list is still old | Press **Refresh** in the Workflow tab |
| A filter is applied | Press **x Clear** at the right end of the toolbar |
| You saved to another folder | Check "Workflow Data Folder" in the Settings tab |

### Nodes are shown in red (missing)
When you load a workflow, nodes may be shown in red, or a message may say there are missing nodes.
This means **the custom nodes the workflow needs are not installed**.

**What to do**
1. Open ComfyUI's **Manager**.
2. Choose **Install Missing Custom Nodes**.
3. Install the custom nodes shown, and restart ComfyUI.

> **Tip**
> The "Convert: cross" in the Workflow tab's **GenerateUI Check** (Chapter 4, section 4-7) is also mostly caused by this.
> Hovering the mouse over the badge shows the names of the missing nodes.

### GenerateUI judged it "unusable"
| Judgment | Meaning and what to do |
| --- | --- |
| Convert: cross | A required custom node is missing -> see "Nodes are shown in red" above |
| Convert: warning | A model you do not have is specified -> choose again in GenerateUI (12-3) |
| Operability: warning / cross | Many settings are not shown in GenerateUI -> generation is often still possible. Change detailed settings on ComfyUI's node screen |

---

## 12-3 Generation troubles

### You changed a setting but the result did not change
The most common cause is **forgetting to press Apply**.
In GenerateUI, after changing the model or Settings values (steps, size and so on), the change is not reflected in the workflow unless you press **Apply** (Chapter 5, section 5-3).
Looking at the **Raw JSON** on the right lets you check the values actually reflected.

### It generates something different from the loaded workflow
If a batch kind's checkbox in the **Batch** subtab stays on,
a batch generation runs when you press Generate (Chapter 5, section 5-5).
Open the Batch subtab and turn off all the Batch Queue column checkboxes.

### It generates with a different model than you expected
If the model saved in the workflow is not on your computer, it may be replaced automatically with another model.
In that case a message says the Checkpoint "..." was not found and was replaced with another model without warning.
(From v0.8.7, if you have exactly one model with the same name that differs only in its folder, it is replaced with that one.)
In the **Model** subtab of GenerateUI, choose the model you want to use again and press **Apply**.

If you always want to use the same model, the **Default Checkpoint** in the Settings tab is handy (Chapter 11, section 11-5).

### It does not become the same image even with the same settings
Is the seed mode in the generate panel set to **Random**?
To make the same image, you need to set the seed to **Workflow** (use the workflow's seed as it is) or **Fixed** (fix it to the value in the Seed field).
If no new image is added when you generate in a row with the same seed and settings, that is because ComfyUI reuses the already computed result, not a malfunction.
For the steps to reproduce a Gallery image, see Chapter 8, section 8-3.

### Slow generation, or it stops with an error (out of memory)
| Cause | What to do |
| --- | --- |
| Local AI is using GPU memory | Press **Unload Model** in AI TOOL. Use **VRAM Management (Ollama)** in the Settings tab (Chapter 10, section 10-3) |
| The image size or Batch Size is too large | Make Width, Height and Batch Size smaller in the Settings subtab |
| The model is too large for your GPU | Use a smaller model (such as a GGUF version) |

### Errors appear after moving or deleting a model
ComfyUI may remember the old location of a model.
Run **Hard Reset** in ComfyUI's menu (inside the queue menu), or restart ComfyUI.

### A newly added model does not appear in the list
Press **Refresh Models** in GenerateUI, or **Refresh** in the Models tab.
If it still does not appear, check that the folder where you put the model is correct (Chapter 6, section 6-1).

---

## 12-4 AI feature troubles

### AI features show "Disconnected" or do not connect
1. Check that software such as Ollama is running.
   For LM Studio or Lemonade, you need to **start the server** inside the app and have a model loaded.
2. Check that the address (port number) in the settings matches the software.
3. Press **Test Connection** and check the result.

### It works in the AI TOOL tab but not in the Prompt tab
AI settings are saved separately depending on the place (Chapter 10, section 10-2).

| Place | Where to set it |
| --- | --- |
| AI TOOL tab / the A tab of the WS Library | The AI TOOL tab's settings (shared) |
| Prompt tab | The **gear button** of the AI Assistant in the Prompt tab |
| Tagger tab | The **gear button** in the Tagger tab |

### The model list is empty
The AI model may not have been downloaded.
For Ollama, download the model with `ollama pull (model name)`, then press **Refresh** in the model selection.

### It does not connect to Ollama on another computer
For safety, by default it connects only to AI software inside the same computer.
You need to set the environment variable `WFS_ALLOWED_BACKEND_HOSTS` (Chapter 10, section 10-4).

---

## 12-5 Troubles with other features

### No model appears in Tagger
- Check that a `.onnx` file (and `selected_tags.csv`) is in the `ComfyUI/models/tagger/(model name)/` folder.
- Check that the extra Python package (onnxruntime) is installed in **the Python that ComfyUI uses** (Chapter 11, section 11-2).

### PSD-related features give an error
An extra Python package (psd-tools) is needed.
Run the installation command shown in the error message in the Python that ComfyUI uses, then restart ComfyUI.

### Semantic search (Gallery) does not work well
| Symptom | Cause | What to do |
| --- | --- | --- |
| The GPU is not detected (settings say no GPU detected, or runs on the CPU) | The onnxruntime in ComfyUI's Python is the CPU version | Stop ComfyUI, then in ComfyUI's Python run `pip uninstall -y onnxruntime onnxruntime-gpu` followed by `pip install onnxruntime-gpu`, and restart ComfyUI (DirectML is not supported) |
| Gemini says "GEMINI_API_KEY is not set", or the key is rejected | There is no key in `.env`, or the line starts with `#` | Write `GEMINI_API_KEY=key` in the plugin's `.env` (copy `.env.example`) and restart ComfyUI. `.env` is only read at startup |
| Search or Similar gives no results | The selected folder has no indexed images | Build the index with the gear button. Choose a folder with a green dot. When you change the model or precision, "rebuild all" |

### A partner API (Nano Banana) says authentication failed
The cause is a missing Comfy API key in `.env`. Write `COMFY_API_KEY=your key` (issued at platform.comfy.org) in the plugin's `.env` and restart ComfyUI (Chapter 5, section 5-8).
`.env` is read only at startup.

### Images do not appear in the Gallery
- Press **Refresh** in the Gallery.
- Check that the "Gallery Output Folder" in the Settings tab matches where ComfyUI saves images.

---

## 12-6 If it is still not solved

### Look at Workflow Studio's Help
The **Help** tab of Workflow Studio also has troubleshooting information.
It may include information added after this book was published.

### Ask or report on GitHub
Problems that are not solved can be reported in **Issues** on Workflow Studio's GitHub repository.
When reporting, attaching the following information makes the cause easier to find.

- The Workflow Studio version
- The ComfyUI version and how it was installed (portable version, Desktop version, Stability Matrix and so on)
- On which screen, what you did, and what happened
- The error message shown on the black screen (console) where ComfyUI was started
- The red error message shown in the "Console" of the browser's developer tools (F12 key)

> **Caution**
> When pasting error messages, check that they do not contain personal information such as your computer's user name.

> **Summary of this chapter**
> - When in trouble, first try "reload", "Refresh buttons" and "restarting ComfyUI"
> - Red nodes mean missing custom nodes. Solve with ComfyUI Manager's Install Missing Custom Nodes
> - When settings are not reflected, check for a forgotten Apply and a leftover Batch check
> - For out-of-memory, deal with it by unloading local AI and reviewing the image size
> - When not solved, make use of the Help tab and GitHub Issues

---

# Appendix

## Appendix A Glossary

The main terms that appear in this book, in alphabetical order.

| Term | Meaning | In this book |
| --- | --- | --- |
| API format / UI format | The save format of a workflow. UI format includes things such as node positions; API format contains only the processing content | Chapter 4 |
| Apply | The button in GenerateUI that reflects changed values into the workflow | Chapter 5 |
| Badge | A colored label attached to a workflow or model | Chapter 4 |
| Batch generation | Automatically generating in bulk while changing conditions | Chapter 5 |
| Canvas | The work space where nodes are laid out on ComfyUI's node screen | Chapter 3 |
| CFG | How strongly to follow the prompt | Chapter 5 |
| Checkpoint | The model that forms the core of image generation | Chapter 6 |
| Civitai | A sharing site for image-generation models | Chapter 6 |
| ComfyUI Manager | A management tool for searching for and installing custom nodes | Chapter 2 |
| Custom node | A node or extension added to ComfyUI afterwards. Workflow Studio is one of them | Chapter 1 |
| Denoise | How strongly to redraw the original image | Chapter 5 |
| Embedding | A small file that teaches a particular word a meaning | Chapter 6 |
| Hash value | A "fingerprint"-like value computed from a file's contents. Used to look up models on Civitai | Chapter 6 |
| I2I (Image to Image) | Making a new image based on an image | Chapter 5 |
| Inpainting | Redrawing only part of an image (the masked part) | Chapter 11 |
| JSON | The data format used to save workflows | Chapter 1 |
| Keyframe | In Lab, a specification of "from which run to switch settings" | Chapter 5 |
| Local AI | AI that runs inside your own computer (such as Ollama) | Chapter 10 |
| LoRA | A small model that teaches an art style, character and so on as an add-on | Chapter 6 |
| Mask | A specification of the part of an image to be processed | Chapter 11 |
| Metadata | Information embedded in an image, such as the settings used at generation | Chapter 8 |
| Model | The file that acts as the "AI brain" that makes images | Chapter 1 |
| Negative prompt | A prompt where you write what you do not want drawn | Chapter 7 |
| Node | A "box" arranged on ComfyUI's screen. It handles one process | Chapter 1 |
| Node set | Several nodes and their connections saved together | Chapter 9 |
| Ollama | Software for running local AI easily | Chapter 10 |
| Port number | A number for distinguishing which software to communicate with inside one computer | Chapter 2 |
| Positive prompt | A prompt where you write what you want drawn | Chapter 7 |
| Preset | A pair of positive and negative prompts saved together | Chapter 7 |
| Prompt | The text that tells the AI "what kind of image you want" | Chapter 1 |
| Queue | The reservation list for generation. Processed in order | Chapter 1 |
| Sampler | The algorithm used when drawing an image (such as euler) | Chapter 5 |
| Scheduler | How the drawing amount is distributed across steps | Chapter 5 |
| Seed | The seed of random numbers an image grows from. If the same, you get almost the same image | Chapter 5 |
| Semantic search | Searching images by the "meaning" of a sentence or image. Used with the Gallery's S button | Chapter 8 |
| Steps | The number of times drawing is repeated | Chapter 5 |
| Style | A mood template added to a prompt | Chapter 7 |
| T2I (Text to Image) | Making an image from text (a prompt) | Chapter 5 |
| Trigger word | A word to put in the prompt to bring out a LoRA's effect | Chapter 6 |
| VAE | The model that finishes an image's colors and fine details | Chapter 6 |
| VLM | An AI model that can read images | Chapter 10 |
| VRAM | The memory of the GPU (graphics card) | Chapter 10 |
| Wildcard | A mechanism that randomly swaps a part of the prompt at every generation | Chapter 7 |
| Workflow | The whole flow of processing made by connecting nodes with lines | Chapter 1 |
| WS Library | Workflow Studio's side panel that opens beside ComfyUI's node screen | Chapter 9 |

---

## Appendix B Keyboard and mouse operations

### General
| Operation | What happens |
| --- | --- |
| Esc | Closes the open screen (modal or panel) |
| Enter | Confirms a rename / sends a chat message |
| Shift + Enter | Line break in chat |
| Double-click | Opens the detail screen (workflows, models and so on) |
| Shift + click (W button) | Opens Workflow Studio in a new window |

### GenerateUI
| Operation | What happens |
| --- | --- |
| Alt + click (Apply) | Reflects the values and generates at once |
| Ctrl + Up/Down (prompt field) | Raises or lowers the emphasis `(word:number)` of the selected word by 0.05 |
| Enter / Shift + Enter (Raw JSON search box) | Moves to the next / previous match |

### Gallery
| Operation | What happens |
| --- | --- |
| Ctrl + click | Select several images |
| Alt + click | Open the image in the Metadata subtab |
| Enter (when semantic search is on) | Run a semantic search with the text in the search box |

### WS Library
| Operation | What happens |
| --- | --- |
| Drag and drop | Place or load at the dropped position on the canvas |
| Double-click | Place or load near the center of the canvas |
| Alt + click (N tab) | Switch a node's favorite on or off |

### Image Edit
| Operation | What happens |
| --- | --- |
| V / B / T / S / G | Switch to the Select / Draw / Text / Shape / Fill tool |
| Ctrl + Z / Ctrl + Y | Undo / redo |
| Mouse wheel | Zoom in and out |
| Space + drag | Move the view position |
| Delete | Delete the selected layer (when there are two or more layers) |

---

## Appendix C Reference links

### Workflow Studio
- GitHub (latest version, release notes, bug reports)
  https://github.com/ketle-man/ComfyUI-Workflow-Studio

### ComfyUI itself and management tools
- ComfyUI
  https://github.com/comfyanonymous/ComfyUI
- ComfyUI Manager
  https://github.com/Comfy-Org/ComfyUI-Manager

### Related software and services introduced in this book
| Name | Use | In this book |
| --- | --- | --- |
| Civitai (https://civitai.com/) | Getting models, fetching information | Chapter 6 |
| Ollama (https://ollama.com/) | Local AI | Chapter 10 |
| LM Studio (https://lmstudio.ai/) | Local AI | Chapter 10 |
| Lemonade Server (https://lemonade-server.ai/) | Local AI | Chapter 10 |
| Eagle (https://eagle.cool/) | Image-management software | Chapter 8 |

### Custom nodes that are handy to use together
| Name | Use | In this book |
| --- | --- | --- |
| ComfyUI Comic Creator (https://github.com/ketle-man/comfyui-comic-creator) | Manga making. Works with the Gallery and image generation | Chapter 11 |
| comfyui-image-feeder (https://github.com/ketle-man/comfyui-image-feeder) | Feeder's Image Loop mode | Chapter 5 |
| comfyui-mask-editor-one (https://github.com/ketle-man/comfyui-mask-editor-one) | Advanced masking and background removal in Image Edit | Chapter 11 |
| ComfyUI-Impact-Pack (https://github.com/ltdrdata/ComfyUI-Impact-Pack) | Curly-brace-style wildcards | Chapter 7 |
| ComfyUI-Lora-Manager | Managing LoRAs; placing LoRAs together from the WS Library | Chapter 9 |

> **Caution**
> The contents and URLs of linked pages may change.

---

# Afterword

Thank you for reading to the end.

ComfyUI is very free and deep software.
Because of that freedom, it is also software where beginners think "I don't know where to start".
Workflow Studio was born from the wish to widen that entrance a little,
and to make "creating" and "organizing" more casual.

Let's look back once more at the ways of using it introduced in this book.

1. **Organize** - make workflows, models and prompts easy to tell apart with thumbnails and badges
2. **Create** - generate images in GenerateUI without touching the node screen
3. **Collect** - keep prompts and settings that worked in presets and the Gallery
4. **Reproduce** - recall the same settings right away from an image's metadata
5. **Expand** - speed up trial and error with batch generation and local AI

The shortest path to improving at image generation is to **try a lot, and keep what worked**.
I will be glad if Workflow Studio becomes a tool that supports that accumulation.

Workflow Studio will continue to gain features and improvements.
New features and changes are announced in the release notes on GitHub.
Your impressions after using it, and requests such as "I want this feature", are also welcome on GitHub.

May your life with image generation become more fun and richer.

ketle-man
