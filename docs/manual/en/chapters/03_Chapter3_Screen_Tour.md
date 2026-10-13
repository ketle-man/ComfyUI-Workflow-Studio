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
