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
