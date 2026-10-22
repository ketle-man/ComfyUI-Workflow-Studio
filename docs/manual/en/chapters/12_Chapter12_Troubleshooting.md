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
